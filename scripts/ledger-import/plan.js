/**
 * The ledger import's plan (ADR 0042): what a write would do, computed from
 * the read ledger and the data as it stands, without writing anything. Pure:
 * the entry point reads the store and hands its rows in, so the dry run and
 * the write cannot disagree.
 *
 * The rules, in order:
 *
 *   1. Categories. The ledger's tree becomes two-level categories, found by
 *      name under the same parent or created. A top-level category is income
 *      when the ledger files money in under it and never money out;
 *      otherwise spending. A subcategory the ledger marks `ricorrente` is a
 *      fixed cost when it is created.
 *   2. Accounts. A ledger account is the account of the same name, or the one
 *      `--account-map` names. One with statements is matched; one without
 *      takes the ledger as its source, and is created (cash) when missing.
 *   3. Matching, on an account with statements. Each end of a ledger row on
 *      it finds the one statement movement it describes: the same account,
 *      the same signed amount, dated within the window. One to one, the
 *      nearest first -- every exact day before any one-day match -- then the
 *      earliest ledger day, the ledger id, the earliest statement day. A
 *      match gives the movement the ledger's category, note, project tag and
 *      not-counted flag, each only where the movement has none: what you set
 *      in the app is never overwritten. A row that matches nothing is listed,
 *      never imported: the statement is that account's transactions.
 *   4. An account without statements gets the ledger's rows as transactions,
 *      origin `sheet` keyed by the ledger id, and its `saldo_iniziale` rows
 *      as one opening balance, dated the day before its first movement (ADR
 *      0024). An opening balance on an account with statements is ignored
 *      and listed: the statement knows better.
 *   5. Transfers, by where each end comes from (the ADR's table): both ends
 *      statement rows -- both not counted; one end a statement row and the
 *      other an account with no row for it -- the statement row becomes the
 *      transfer, its counter account the other -- and when that row is not
 *      found and the other account is one the ledger feeds, that account's
 *      leg is written on its own, not counted; neither end on an account
 *      with statements -- one ledger transaction with a counter account.
 *   6. An account the ledger feeds must end with the ledger's balance and
 *      totals; any difference blocks.
 *
 * Every refusal is in `blocking`, so the dry run lists exactly what --write
 * would refuse.
 */

import { ORIGIN_SOURCES } from '../../personalos.config.js';
import { shiftDayKey } from '../../lib/domain/dates.js';
import { accountValueOn, totalsBetween } from '../../lib/domain/derive/finance.js';
import { isSyncedAccount } from '../../lib/domain/origin.js';
import { formatMinor } from '../statement-import/money.js';
import { pairKey, pairLabel } from './read.js';

/** How far a statement movement's day may be from the ledger's, by default. */
export const DEFAULT_WINDOW_DAYS = 3;

/** The id a record that does not exist yet has in the plan. */
const NEW_ACCOUNT = 'new-account:';
const NEW_CATEGORY = 'new-category:';

/**
 * The key suffix of a transfer's leg on an account the ledger feeds, written
 * when the other end's statement row was not found (ADR 0042).
 */
export const LEG_SUFFIX = ':leg';

/** The field names a match fills, as the report names them. */
export const ZONE_FIELDS = Object.freeze(['category', 'note', 'tags', 'notCounted', 'counter']);

/**
 * @typedef {import('../../lib/domain/types.js').FinanceAccount} FinanceAccount
 * @typedef {import('../../lib/domain/types.js').FinanceCategory} FinanceCategory
 * @typedef {import('../../lib/domain/types.js').FinanceObservation} FinanceObservation
 * @typedef {import('../../lib/domain/types.js').Transaction} Transaction
 * @typedef {import('./read.js').LedgerMovement} LedgerMovement
 *
 * @typedef {'category' | 'note' | 'tags' | 'notCounted' | 'counter'} ZoneField
 *
 * @typedef {object} CategoryPlan
 * @property {string} key the pair's key, or the category's name at the top level
 * @property {string} label "Category" or "Category > Subcategory"
 * @property {string} name
 * @property {string | null} parentKey
 * @property {'income' | 'expense' | null} kind at the top level only
 * @property {boolean} fixedCost
 * @property {FinanceCategory | null} existing
 * @property {string} id the existing id, or a placeholder the write resolves
 *
 * @typedef {object} UnmatchedSide
 * @property {string} ledgerId
 * @property {string} date
 * @property {number} amount signed, from the account's side
 * @property {string} account the PersonalOS account's name
 * @property {string} pair
 * @property {string} note
 * @property {string} reason
 *
 * @typedef {object} AccountPlan
 * @property {string} ledgerName
 * @property {string} name the PersonalOS account's name
 * @property {FinanceAccount | null} account null: it would be created
 * @property {string} id the account's id, or a placeholder the write resolves
 * @property {boolean} statements whether it has statement movements
 * @property {string} ledgerKind the accounts file's own word, '' when not listed
 * @property {number | null} dashboard the ledger dashboard's balance
 * @property {number} sides ledger rows (or transfer ends) on it, opening balances not counted
 * @property {number} openingRows its `saldo_iniziale` rows
 * @property {Record<string, number>} byDistance matches by days apart
 * @property {Record<string, number>} applied fields filled, by field
 * @property {Record<string, number>} leftAlone fields already set otherwise, by field
 * @property {number} already matches the ledger had nothing new for
 * @property {UnmatchedSide[]} unmatched
 * @property {{ new: number, unchanged: number, changed: number }} ledgerTransactions
 * @property {number} uncategorised its statement movements in the ledger's range still in Uncategorised after the import
 * @property {{ spending: number, income: number }} ledgerTotals counted as the ledger has them
 * @property {{ spending: number, income: number }} ledgerFiled the same rows as PersonalOS files them:
 *   money in counted by the ledger but filed in a spending category reduces spending (a refund), and
 *   money out filed in an income category reduces income
 * @property {number} refiled the counted money the ledger calls income or spending that PersonalOS
 *   files the other way, as a refund or a chargeback
 * @property {number | null} ledgerBalance for an account the ledger feeds, the balance the ledger
 *   implies: its opening balance rows plus every row on it; null on an account with statements
 * @property {string | null} checkDay the day the balances are compared on: the ledger's last day, or a
 *   later statement row that reaches the account
 * @property {{ spending: number, income: number }} computedTotals as PersonalOS computes them after the import
 * @property {{ amount: number, date: string } | null} valueAfter on `checkDay`, after the import
 *
 * @typedef {object} PlannedUpdate
 * @property {Transaction} transaction the statement movement as it stands
 * @property {string} account its account's name
 * @property {string} ledgerId
 * @property {number} distance days apart
 * @property {{ categoryId?: string, note?: string, tags?: string[], notCounted?: boolean, counterAccountId?: string }} patch
 *   only the fields still empty; ids may be placeholders
 * @property {ZoneField[]} already
 * @property {ZoneField[]} leftAlone
 *
 * @typedef {object} PlannedTransaction
 * @property {string} ledgerId
 * @property {string} externalId the ledger id, or for a transfer's leg on an account the ledger feeds
 *   whose statement row was not found, the ledger id and LEG_SUFFIX
 * @property {string} date
 * @property {number} amount signed from the account's side
 * @property {string} accountId may be a placeholder
 * @property {string | null} counterAccountId may be a placeholder
 * @property {string | null} categoryId may be a placeholder
 * @property {boolean} notCounted
 * @property {string[]} tags
 * @property {string} description the ledger's note, or the subcategory when it has none
 * @property {'new' | 'unchanged' | 'changed'} status
 *
 * @typedef {object} PlannedOpening
 * @property {string} account the account's name
 * @property {string} accountId may be a placeholder
 * @property {string} date
 * @property {number} amount
 * @property {string[]} ledgerIds
 * @property {'new' | 'recorded' | 'anchored'} status recorded: this balance is already there;
 *   anchored: another balance on or before that day already anchors the account
 * @property {string | null} anchoredOn
 *
 * @typedef {'both statements' | 'one statement row' | 'statement and ledger' | 'leg written' | 'ledger only' | 'unmatched'} TransferCase
 *
 * @typedef {object} TransferEntry
 * @property {string} ledgerId
 * @property {string} date
 * @property {number} amount positive
 * @property {string} from
 * @property {string} to
 * @property {TransferCase} case
 *
 * @typedef {object} LedgerPlan
 * @property {number} window
 * @property {{ from: string, to: string } | null} range the ledger's first and last day
 * @property {CategoryPlan[]} categories parents first
 * @property {AccountPlan[]} accounts
 * @property {PlannedUpdate[]} updates
 * @property {PlannedTransaction[]} transactions
 * @property {{ transaction: Transaction, account: string, ledgerId: string }[]} removals legs an earlier
 *   run wrote that a statement row now carries: deleted, so the money is not on the account twice
 * @property {PlannedOpening[]} openings
 * @property {{ ledgerId: string, account: string, date: string, amount: number }[]} ignoredOpenings
 * @property {TransferEntry[]} transfers
 * @property {string[]} warnings
 * @property {string[]} blocking
 */

/**
 * @param {{
 *   read: import('./read.js').ReadLedger,
 *   accountMap: Record<string, string>,
 *   window: number,
 *   accounts: FinanceAccount[],
 *   transactions: Transaction[],
 *   observations: FinanceObservation[],
 *   categories: FinanceCategory[],
 *   demoFinance: boolean,
 * }} input
 * @returns {LedgerPlan}
 */
export function planLedger({ read, accountMap, window, accounts, transactions, observations, categories, demoFinance }) {
  /** @type {string[]} */
  const warnings = [];
  const blocking = read.problems.map((problem) => problem.file + ' line ' + problem.line + ': ' + problem.reason);
  if (demoFinance) blocking.unshift('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');

  const { movements } = read;
  const dates = movements.map((movement) => movement.date).sort();
  const range = dates.length === 0 ? null : { from: dates[0], to: /** @type {string} */ (dates.at(-1)) };

  const accountPlans = planAccounts(read, accountMap, accounts, transactions, warnings, blocking);
  const byLedgerName = new Map(accountPlans.map((plan) => [plan.ledgerName, plan]));
  const categoryPlans = planCategories(read, categories, warnings, blocking);
  const categoryIdOf = new Map(categoryPlans.map((plan) => [plan.key, plan.id]));

  // --- Matching (rule 3) ---------------------------------------------------
  /** @type {Side[]} */
  const sides = [];
  for (const movement of movements) {
    if (movement.type === 'saldo_iniziale') continue;
    if (movement.from !== '') sides.push({ movement, end: 'out', account: byLedgerName.get(movement.from), amount: -movement.amount });
    if (movement.to !== '') sides.push({ movement, end: 'in', account: byLedgerName.get(movement.to), amount: movement.amount });
  }
  const matches = matchSides(sides, transactions, window);

  // --- What each row does (rules 3 to 5) -----------------------------------
  /** @type {Map<Transaction, { desired: Desired, side: Side, distance: number }>} */
  const desiredByTransaction = new Map();
  /** @type {PlannedTransaction[]} */
  const planned = [];
  /** @type {TransferEntry[]} */
  const transfers = [];
  /** @type {{ ledgerId: string, account: string, date: string, amount: number }[]} */
  const ignoredOpenings = [];
  /** @type {Map<AccountPlan, LedgerMovement[]>} */
  const openingRows = new Map();
  /** @type {{ leg: PlannedTransaction, carrier: Transaction, entry: Omit<TransferEntry, 'case'> }[]} */
  const legs = [];

  const sideOf = (/** @type {LedgerMovement} */ movement, /** @type {'out' | 'in'} */ end) =>
    sides.find((side) => side.movement === movement && side.end === end);
  /** @param {Side} side @param {string} reason */
  const unmatched = (side, reason) => {
    const account = /** @type {AccountPlan} */ (side.account);
    account.unmatched.push({
      ledgerId: side.movement.id,
      date: side.movement.date,
      amount: side.amount,
      account: account.name,
      pair: pairLabel(side.movement.category, side.movement.subcategory),
      note: side.movement.note,
      reason,
    });
  };
  /** @param {Side} side @param {Desired} desired */
  const desire = (side, desired) => {
    const match = /** @type {{ transaction: Transaction, distance: number }} */ (matches.get(side));
    desiredByTransaction.set(match.transaction, { desired, side, distance: match.distance });
  };

  for (const movement of movements) {
    const from = movement.from === '' ? undefined : byLedgerName.get(movement.from);
    const to = movement.to === '' ? undefined : byLedgerName.get(movement.to);
    // An account that could not be resolved blocks; its rows are not planned.
    if ((movement.from !== '' && from === undefined) || (movement.to !== '' && to === undefined)) continue;
    for (const account of [from, to]) if (account !== undefined && movement.type !== 'saldo_iniziale') account.sides += 1;
    const categoryId = /** @type {string} */ (categoryIdOf.get(pairKey(movement.category, movement.subcategory)));
    const description = movement.note === '' ? movement.subcategory : movement.note;

    if (movement.type === 'saldo_iniziale') {
      const account = /** @type {AccountPlan} */ (to);
      account.openingRows += 1;
      if (account.statements) ignoredOpenings.push({ ledgerId: movement.id, account: account.name, date: movement.date, amount: movement.amount });
      else openingRows.set(account, [...(openingRows.get(account) ?? []), movement]);
      continue;
    }

    if (movement.type !== 'trasferimento') {
      // A flow, or a payment to a broker: one end.
      const account = /** @type {AccountPlan} */ (from ?? to);
      const side = /** @type {Side} */ (sideOf(movement, from === undefined ? 'in' : 'out'));
      const desired = { categoryId, note: movement.note, tags: movement.tags, notCounted: !movement.counted, counterAccountId: null };
      if (!account.statements) {
        planned.push(ledgerTransaction(movement, account.id, side.amount, null, desired, description));
      } else if (matches.has(side)) desire(side, desired);
      else unmatched(side, 'no statement movement');
      continue;
    }

    // A transfer (rule 5).
    const source = /** @type {AccountPlan} */ (from);
    const target = /** @type {AccountPlan} */ (to);
    const out = /** @type {Side} */ (sideOf(movement, 'out'));
    const into = /** @type {Side} */ (sideOf(movement, 'in'));
    const entry = { ledgerId: movement.id, date: movement.date, amount: movement.amount, from: source.name, to: target.name };
    // Both ends are statement rows: each moves its own balance, and neither
    // counts. Neither carries a counter account, or the other balance would
    // move twice.
    const notCounting = { categoryId, note: movement.note, tags: movement.tags, notCounted: true, counterAccountId: null };
    /** @param {AccountPlan} other */
    const carrying = (other) => ({ categoryId: null, note: movement.note, tags: movement.tags, notCounted: false, counterAccountId: other.id });

    if (!source.statements && !target.statements) {
      planned.push(ledgerTransaction(movement, source.id, -movement.amount, target.id, carrying(target), description));
      transfers.push({ ...entry, case: 'ledger only' });
    } else if (source.statements && target.statements) {
      const outMatched = matches.has(out);
      const inMatched = matches.has(into);
      if (outMatched && inMatched) {
        desire(out, notCounting);
        desire(into, notCounting);
        transfers.push({ ...entry, case: 'both statements' });
      } else if (outMatched || inMatched) {
        // One statement has no row for it -- a card topped up from the bank,
        // whose own statement lists only spending: the other end's row is the
        // transfer, and its counter account receives the money once.
        if (outMatched) desire(out, carrying(target));
        else desire(into, carrying(source));
        transfers.push({ ...entry, case: 'one statement row' });
      } else {
        unmatched(out, 'transfer to ' + target.name + ': neither end has a statement movement');
        unmatched(into, 'transfer from ' + source.name + ': neither end has a statement movement');
        transfers.push({ ...entry, case: 'unmatched' });
      }
    } else {
      // One end on an account with statements, the other on one the ledger
      // feeds -- cash taken out at a machine: the statement row is the
      // transfer, and the other account receives it through its counter.
      const statementSide = source.statements ? out : into;
      const other = source.statements ? target : source;
      // The ledger is the other account's source, so its end is always
      // written: carried by the statement row when it is found, otherwise a
      // leg of its own, not counted and with no counter account -- the
      // statement account does not move; its own statement shows the money
      // or does not.
      const leg = ledgerTransaction(movement, other.id, source.statements ? movement.amount : -movement.amount, null, notCounting, description, LEG_SUFFIX);
      const match = matches.get(statementSide);
      if (match !== undefined) {
        desire(statementSide, carrying(other));
        legs.push({ leg, carrier: match.transaction, entry });
      } else {
        unmatched(statementSide, 'transfer ' + (source.statements ? 'to ' : 'from ') + other.name + ": statement row not found; the ledger account's leg written");
        planned.push(leg);
        transfers.push({ ...entry, case: 'leg written' });
      }
    }
  }

  // --- The user's zone, only where empty -----------------------------------
  /** @type {PlannedUpdate[]} */
  const updates = [];
  for (const [transaction, { desired, side, distance }] of desiredByTransaction) {
    const account = /** @type {AccountPlan} */ (side.account);
    const update = zoneUpdate(transaction, desired);
    updates.push({ transaction, account: account.name, ledgerId: side.movement.id, distance, ...update });
    account.byDistance[distance] = (account.byDistance[distance] ?? 0) + 1;
    for (const field of /** @type {ZoneField[]} */ (Object.keys(update.patch).map(fieldOfKey))) account.applied[field] = (account.applied[field] ?? 0) + 1;
    for (const field of update.leftAlone) account.leftAlone[field] = (account.leftAlone[field] ?? 0) + 1;
    if (Object.keys(update.patch).length === 0) account.already += 1;
  }

  /** @type {Map<string, Transaction>} */
  const sheetRows = new Map();
  for (const transaction of transactions) {
    if (transaction.origin?.source === ORIGIN_SOURCES.sheet) sheetRows.set(transaction.origin.externalId, transaction);
  }

  // A transfer's end on an account the ledger feeds, whose statement row was
  // found: carried by that row's counter account when it has one or gets
  // one, and then a leg an earlier run wrote for it -- before the row was
  // found -- is removed, or the money would be on the account twice. A row
  // that cannot carry it (you gave it a category or another counter
  // account) leaves the leg written.
  /** @type {LedgerPlan['removals']} */
  const removals = [];
  for (const { leg, carrier, entry } of legs) {
    const update = /** @type {PlannedUpdate} */ (updates.find((row) => row.transaction === carrier));
    const carried = update.patch.counterAccountId !== undefined || update.already.includes('counter');
    if (!carried) {
      planned.push(leg);
      transfers.push({ ...entry, case: 'leg written' });
      continue;
    }
    transfers.push({ ...entry, case: 'statement and ledger' });
    const stale = sheetRows.get(leg.externalId);
    if (stale !== undefined) removals.push({ transaction: stale, account: update.account, ledgerId: leg.ledgerId });
  }

  // --- Ledger transactions against what is already there --------------------
  for (const transaction of planned) {
    const existing = sheetRows.get(transaction.externalId);
    if (existing === undefined) continue;
    transaction.status =
      existing.date === transaction.date && existing.amount === transaction.amount && existing.accountId === transaction.accountId &&
      existing.description === transaction.description
        ? 'unchanged'
        : 'changed';
  }
  for (const account of accountPlans) {
    for (const transaction of planned) {
      if (transaction.accountId === account.id) account.ledgerTransactions[transaction.status] += 1;
    }
  }
  // Rows an earlier import wrote that this ledger does not plan: the old
  // spreadsheet import's, a row deleted from the ledger since, or an account
  // that has statements now. Left there, they count beside the statement.
  const plannedIds = new Set([
    ...planned.map((transaction) => transaction.externalId),
    ...removals.map((removal) => removal.transaction.origin?.externalId ?? ''),
  ]);
  /** @type {Map<string, number>} */
  const strays = new Map();
  for (const [externalId, transaction] of sheetRows) {
    if (plannedIds.has(externalId)) continue;
    const name = accounts.find((account) => account.id === transaction.accountId)?.name ?? transaction.accountId;
    strays.set(name, (strays.get(name) ?? 0) + 1);
  }
  for (const [name, count] of strays) {
    blocking.push(
      count + ' movement(s) on "' + name + '" came from a spreadsheet or ledger import and are not in this ledger as a movement of an account ' +
        'without statements -- an earlier import (data:import-sheet), a row deleted since, or an account that has statements now. ' +
        'Delete them, or restore a backup from before that import, so no month counts them twice'
    );
  }

  // --- Opening balances (rule 4) --------------------------------------------
  const openings = planOpenings(openingRows, planned, updates, observations);

  // --- After the import: totals, Uncategorised, balances --------------------
  simulate({ accountPlans, categoryPlans, categories, accounts, transactions, observations, updates, planned, removals, openings, movements, range });

  // For an account the ledger feeds, the ledger is the source: its balance
  // and its totals after the import are the ledger's, or a row was lost.
  for (const account of accountPlans) {
    if (account.statements) continue;
    if (account.ledgerBalance !== null && account.valueAfter !== null && account.valueAfter.amount !== account.ledgerBalance) {
      blocking.push(
        '"' + account.name + '" would end at ' + formatMinor(account.valueAfter.amount) + ' on ' + account.checkDay + ', the ledger implies ' +
          formatMinor(account.ledgerBalance) + ' (its opening balance and its rows): a difference of ' +
          formatMinor(account.valueAfter.amount - account.ledgerBalance) + '. The ledger is its source, so the import lost a row -- ' +
          'or a balance or a movement on it that is not from the ledger changes it'
      );
    }
    const { ledgerFiled: filed, computedTotals: computed } = account;
    if (filed.spending !== computed.spending || filed.income !== computed.income) {
      blocking.push(
        '"' + account.name + '": spending ' + formatMinor(computed.spending) + ' and income ' + formatMinor(computed.income) +
          ' after the import, the ledger has ' + formatMinor(filed.spending) + ' and ' + formatMinor(filed.income) +
          ': the ledger is its source, so the import lost or added a counted row'
      );
    }
  }

  for (const account of accountPlans) {
    if (!account.statements && account.account === null && openings.every((opening) => opening.accountId !== account.id)) {
      warnings.push(
        '"' + account.name + '" has no saldo_iniziale and no balance: an account with no balance is unknown, not zero -- record one on the ' +
          'Finances screen, dated before its first movement'
      );
    }
  }

  return {
    window,
    range,
    categories: categoryPlans,
    accounts: accountPlans,
    updates,
    transactions: planned,
    removals,
    openings,
    ignoredOpenings,
    transfers,
    warnings,
    blocking,
  };
}

/**
 * @typedef {object} Side one end of a ledger row, on one account
 * @property {LedgerMovement} movement
 * @property {'out' | 'in'} end
 * @property {AccountPlan | undefined} account
 * @property {number} amount signed, from the account's side
 *
 * @typedef {object} Desired what a ledger row would give the movement it matched
 * @property {string | null} categoryId
 * @property {string} note
 * @property {string[]} tags
 * @property {boolean} notCounted
 * @property {string | null} counterAccountId
 */

/**
 * The statement movement each end on an account with statements describes:
 * one to one, nearest first, then the earliest ledger day, the ledger id, the
 * out end before the in end, the earliest statement day and its id. Greedy
 * over every candidate pair in that order, so every exact-day match is made
 * before any match a day apart.
 *
 * @param {Side[]} sides
 * @param {Transaction[]} transactions
 * @param {number} window
 * @returns {Map<Side, { transaction: Transaction, distance: number }>}
 */
export function matchSides(sides, transactions, window) {
  /** @type {Map<string, Transaction[]>} */
  const byAccount = new Map();
  for (const transaction of transactions) {
    if (transaction.origin?.source !== ORIGIN_SOURCES.statement) continue;
    byAccount.set(transaction.accountId, [...(byAccount.get(transaction.accountId) ?? []), transaction]);
  }
  /** @type {{ side: Side, transaction: Transaction, distance: number }[]} */
  const pairs = [];
  for (const side of sides) {
    if (side.account === undefined || !side.account.statements) continue;
    for (const transaction of byAccount.get(side.account.id) ?? []) {
      if (transaction.amount !== side.amount) continue;
      const distance = daysApart(side.movement.date, transaction.date, window);
      if (distance !== null) pairs.push({ side, transaction, distance });
    }
  }
  pairs.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.side.movement.date.localeCompare(b.side.movement.date) ||
      a.side.movement.id.localeCompare(b.side.movement.id) ||
      (a.side.end === b.side.end ? 0 : a.side.end === 'out' ? -1 : 1) ||
      a.transaction.date.localeCompare(b.transaction.date) ||
      (a.transaction.origin?.externalId ?? a.transaction.id).localeCompare(b.transaction.origin?.externalId ?? b.transaction.id)
  );
  /** @type {Map<Side, { transaction: Transaction, distance: number }>} */
  const matched = new Map();
  /** @type {Set<Transaction>} */
  const claimed = new Set();
  for (const { side, transaction, distance } of pairs) {
    if (matched.has(side) || claimed.has(transaction)) continue;
    matched.set(side, { transaction, distance });
    claimed.add(transaction);
  }
  return matched;
}

/**
 * How many days apart two days are, or null when more than `window`. Shared
 * with categorising's transfer pairing (ADR 0043).
 *
 * @param {string} a day key
 * @param {string} b day key
 * @param {number} window
 * @returns {number | null}
 */
export function daysApart(a, b, window) {
  if (b < shiftDayKey(a, -window) || b > shiftDayKey(a, window)) return null;
  for (let distance = 0; distance <= window; distance += 1) {
    if (shiftDayKey(a, distance) === b || shiftDayKey(a, -distance) === b) return distance;
  }
  return null;
}

/**
 * What a match writes to a statement movement: each field the ledger has a
 * value for, only where the movement's is still empty -- no category, no
 * note, no tags, counted, no counter account. A field already set to the
 * ledger's value is `already`; one set to something else is yours, and left
 * alone. A movement that is a transfer takes no category, and one with a
 * category is not made a transfer (ADR 0023).
 *
 * @param {Transaction} transaction
 * @param {Desired} desired
 * @returns {{ patch: PlannedUpdate['patch'], already: ZoneField[], leftAlone: ZoneField[] }}
 */
function zoneUpdate(transaction, desired) {
  /** @type {PlannedUpdate['patch']} */
  const patch = {};
  /** @type {ZoneField[]} */
  const already = [];
  /** @type {ZoneField[]} */
  const leftAlone = [];
  if (desired.counterAccountId !== null) {
    if (transaction.counterAccountId === desired.counterAccountId) already.push('counter');
    else if (transaction.counterAccountId === null && transaction.categoryId === null) patch.counterAccountId = desired.counterAccountId;
    else leftAlone.push('counter');
  }
  if (desired.categoryId !== null) {
    if (transaction.categoryId === desired.categoryId) already.push('category');
    else if (transaction.categoryId === null && transaction.counterAccountId === null) patch.categoryId = desired.categoryId;
    else leftAlone.push('category');
  }
  if (desired.note !== '') {
    if (transaction.note === desired.note) already.push('note');
    else if (transaction.note === '') patch.note = desired.note;
    else leftAlone.push('note');
  }
  if (desired.tags.length > 0) {
    if (desired.tags.every((tag) => transaction.tags.includes(tag))) already.push('tags');
    else if (transaction.tags.length === 0) patch.tags = desired.tags;
    else leftAlone.push('tags');
  }
  // Counted is the empty value: the ledger only ever takes a movement out.
  if (desired.notCounted) {
    if (transaction.notCounted) already.push('notCounted');
    else patch.notCounted = true;
  }
  return { patch, already, leftAlone };
}

/**
 * @param {string} key a patch key
 * @returns {ZoneField}
 */
function fieldOfKey(key) {
  if (key === 'categoryId') return 'category';
  if (key === 'counterAccountId') return 'counter';
  return /** @type {ZoneField} */ (key);
}

/**
 * @param {LedgerMovement} movement
 * @param {string} accountId
 * @param {number} amount
 * @param {string | null} counterAccountId
 * @param {Desired} desired
 * @param {string} description
 * @param {string} [suffix] LEG_SUFFIX for a transfer's leg
 * @returns {PlannedTransaction}
 */
function ledgerTransaction(movement, accountId, amount, counterAccountId, desired, description, suffix = '') {
  return {
    ledgerId: movement.id,
    externalId: movement.id + suffix,
    date: movement.date,
    amount,
    accountId,
    counterAccountId,
    categoryId: counterAccountId === null ? desired.categoryId : null,
    notCounted: desired.notCounted,
    tags: desired.tags,
    description,
    status: 'new',
  };
}

/**
 * Each ledger account's PersonalOS account (rule 2), refused where an import
 * could not file on it.
 *
 * @param {import('./read.js').ReadLedger} read
 * @param {Record<string, string>} accountMap
 * @param {FinanceAccount[]} accounts
 * @param {Transaction[]} transactions
 * @param {string[]} warnings
 * @param {string[]} blocking
 * @returns {AccountPlan[]}
 */
function planAccounts(read, accountMap, accounts, transactions, warnings, blocking) {
  const used = [...new Set(read.movements.flatMap((movement) => [movement.from, movement.to]).filter((name) => name !== ''))];
  const listed = new Map(read.accounts.map((account) => [account.name, account]));
  for (const name of used) {
    if (!listed.has(name)) warnings.push('the account "' + name + '" is used by the movements but not listed in the accounts file');
  }
  for (const name of Object.keys(accountMap)) {
    if (!used.includes(name) && !listed.has(name)) warnings.push('--account-map names "' + name + '", which the ledger does not have');
  }
  const names = [...used, ...read.accounts.map((account) => account.name).filter((name) => !used.includes(name))];

  /** @type {AccountPlan[]} */
  const plans = [];
  /** @type {Map<string, string>} */
  const taken = new Map();
  for (const ledgerName of names) {
    const name = accountMap[ledgerName] ?? ledgerName;
    const other = taken.get(name);
    if (other !== undefined) {
      blocking.push('the ledger accounts "' + other + '" and "' + ledgerName + '" both go to "' + name + '": one ledger account, one account');
      continue;
    }
    taken.set(name, ledgerName);
    const matches = accounts.filter((account) => account.name === name);
    if (matches.length > 1) {
      blocking.push('two accounts are named "' + name + '": rename one so the ledger account "' + ledgerName + '" has one');
      continue;
    }
    const account = matches[0] ?? null;
    if (account !== null) {
      const refusal =
        account.valuation !== 'balance' ? 'is valued by units: the ledger moves money on an account valued by balance' :
        isSyncedAccount(account) ? 'is synced from ' + account.origin?.source + ' and belongs to it' :
        account.archivedOn !== null ? 'is archived; restore it before importing' :
        null;
      if (refusal !== null && used.includes(ledgerName)) {
        blocking.push('the account "' + name + '" ' + refusal);
        continue;
      }
    }
    const entry = listed.get(ledgerName);
    plans.push({
      ledgerName,
      name,
      account,
      id: account?.id ?? NEW_ACCOUNT + name,
      statements: account !== null && transactions.some((row) => row.accountId === account.id && row.origin?.source === ORIGIN_SOURCES.statement),
      ledgerKind: entry?.kind ?? '',
      dashboard: entry?.dashboard ?? null,
      sides: 0,
      openingRows: 0,
      byDistance: {},
      applied: {},
      leftAlone: {},
      already: 0,
      unmatched: [],
      ledgerTransactions: { new: 0, unchanged: 0, changed: 0 },
      uncategorised: 0,
      ledgerTotals: { spending: 0, income: 0 },
      ledgerFiled: { spending: 0, income: 0 },
      refiled: 0,
      ledgerBalance: null,
      checkDay: null,
      computedTotals: { spending: 0, income: 0 },
      valueAfter: null,
    });
  }
  return plans.filter((plan) => used.includes(plan.ledgerName));
}

/**
 * The ledger's tree as two-level categories (rule 1), parents first.
 *
 * @param {import('./read.js').ReadLedger} read
 * @param {FinanceCategory[]} existing
 * @param {string[]} warnings
 * @param {string[]} blocking
 * @returns {CategoryPlan[]}
 */
function planCategories(read, existing, warnings, blocking) {
  /** @type {Map<string, { category: string, subcategory: string, recurring: boolean }>} */
  const pairs = new Map();
  for (const row of read.categories) pairs.set(pairKey(row.category, row.subcategory), row);
  /** @type {Map<string, number>} */
  const uses = new Map();
  for (const movement of read.movements) {
    const key = pairKey(movement.category, movement.subcategory);
    uses.set(key, (uses.get(key) ?? 0) + 1);
    if (!pairs.has(key)) {
      warnings.push('"' + pairLabel(movement.category, movement.subcategory) + '" (movement ' + movement.id + ') is not in the categories file; it is created all the same');
      pairs.set(key, { category: movement.category, subcategory: movement.subcategory, recurring: movement.recurring });
    }
  }
  for (const row of read.categories) {
    const count = uses.get(pairKey(row.category, row.subcategory)) ?? 0;
    if (row.uses !== null && row.uses !== count) {
      warnings.push('"' + pairLabel(row.category, row.subcategory) + '": the categories file counts ' + row.uses + ' movement(s), the movements file has ' + count);
    }
  }

  /** @type {CategoryPlan[]} */
  const tops = [];
  /** @type {CategoryPlan[]} */
  const children = [];
  for (const name of new Set([...pairs.values()].map((pair) => pair.category))) {
    // By the rows the ledger counted: a refund it left out of an income
    // category, or a chargeback out of a spending one, does not turn it.
    const all = read.movements.filter((movement) => movement.category === name);
    const rows = all.some((movement) => movement.counted) ? all.filter((movement) => movement.counted) : all;
    const moneyIn = rows.some((movement) => movement.type === 'entrata');
    const moneyOut = rows.some((movement) => movement.type === 'uscita' || movement.type === 'investimento');
    /** @type {'income' | 'expense'} */
    const kind = moneyIn && !moneyOut ? 'income' : 'expense';
    const found = existing.find((category) => category.parentId === null && category.name === name) ?? null;
    if (found !== null && found.kind !== kind && (moneyIn || moneyOut)) {
      blocking.push('a category named "' + name + '" already exists as ' + found.kind + '; the ledger files it as ' + kind);
    }
    tops.push({ key: name, label: name, name, parentKey: null, kind: found?.kind ?? kind, fixedCost: false, existing: found, id: found?.id ?? NEW_CATEGORY + name });
  }
  for (const [key, pair] of pairs) {
    const parent = /** @type {CategoryPlan} */ (tops.find((top) => top.key === pair.category));
    const found = parent.existing === null ? null : existing.find((category) => category.parentId === parent.id && category.name === pair.subcategory) ?? null;
    children.push({
      key,
      label: pairLabel(pair.category, pair.subcategory),
      name: pair.subcategory,
      parentKey: parent.key,
      kind: null,
      fixedCost: found?.fixedCost ?? pair.recurring,
      existing: found,
      id: found?.id ?? NEW_CATEGORY + key,
    });
  }
  return [...tops, ...children];
}

/**
 * One opening balance per account the ledger feeds: its `saldo_iniziale`
 * rows summed, dated the day before its first movement -- the ledger's own
 * or a statement row's that reaches it as a counter account -- so that day's
 * movements count on top of it (ADR 0024). Not recorded when a balance on or
 * before that day already anchors the account.
 *
 * @param {Map<AccountPlan, LedgerMovement[]>} rows
 * @param {PlannedTransaction[]} planned
 * @param {PlannedUpdate[]} updates
 * @param {FinanceObservation[]} observations
 * @returns {PlannedOpening[]}
 */
function planOpenings(rows, planned, updates, observations) {
  /** @type {PlannedOpening[]} */
  const openings = [];
  for (const [account, movements] of rows) {
    const days = [
      ...movements.map((movement) => movement.date),
      ...planned.filter((row) => row.accountId === account.id || row.counterAccountId === account.id).map((row) => row.date),
      ...updates.filter((update) => update.patch.counterAccountId === account.id || update.transaction.counterAccountId === account.id).map((update) => update.transaction.date),
    ].sort();
    const date = shiftDayKey(days[0], -1);
    const amount = movements.reduce((sum, movement) => sum + movement.amount, 0);
    const anchors = observations.filter((observation) => observation.accountId === account.id && observation.date <= date);
    const same = anchors.find((observation) => observation.date === date && observation.amount === amount);
    const latest = anchors.map((observation) => observation.date).sort().at(-1) ?? null;
    openings.push({
      account: account.name,
      accountId: account.id,
      date,
      amount,
      ledgerIds: movements.map((movement) => movement.id),
      status: same !== undefined ? 'recorded' : latest !== null ? 'anchored' : 'new',
      anchoredOn: latest,
    });
  }
  return openings;
}

/**
 * The data as it would stand after the import, and from it what the report
 * checks: each account's totals over the ledger's range against the
 * ledger's own, its statement movements still in Uncategorised, and its
 * value on the ledger's last day. Computed by the same derivations the
 * screens use; never adjusted to agree.
 *
 * @param {{
 *   accountPlans: AccountPlan[],
 *   categoryPlans: CategoryPlan[],
 *   categories: FinanceCategory[],
 *   accounts: FinanceAccount[],
 *   transactions: Transaction[],
 *   observations: FinanceObservation[],
 *   updates: PlannedUpdate[],
 *   planned: PlannedTransaction[],
 *   removals: LedgerPlan['removals'],
 *   openings: PlannedOpening[],
 *   movements: LedgerMovement[],
 *   range: { from: string, to: string } | null,
 * }} input
 */
function simulate({ accountPlans, categoryPlans, categories, accounts, transactions, observations, updates, planned, removals, openings, movements, range }) {
  if (range === null) return;
  const idOf = new Map(categoryPlans.map((plan) => [plan.key, plan.id]));
  /** @type {FinanceCategory[]} */
  const afterCategories = [
    ...categories,
    ...categoryPlans
      .filter((plan) => plan.existing === null)
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        kind: plan.kind,
        parentId: plan.parentKey === null ? null : /** @type {string} */ (idOf.get(plan.parentKey)),
        fixedCost: plan.fixedCost,
        archived: false,
      })),
  ];
  const patched = new Map(updates.map((update) => [update.transaction, update.patch]));
  const replaced = new Set(planned.filter((row) => row.status !== 'new').map((row) => row.externalId));
  const removed = new Set(removals.map((removal) => removal.transaction));
  /** @type {Transaction[]} */
  const afterTransactions = transactions
    .filter((transaction) => !removed.has(transaction))
    .filter((transaction) => !(transaction.origin?.source === ORIGIN_SOURCES.sheet && replaced.has(transaction.origin.externalId)))
    .map((transaction) => ({ ...transaction, ...(patched.get(transaction) ?? {}) }));
  for (const row of planned) {
    afterTransactions.push(/** @type {Transaction} */ ({
      id: 'planned:' + row.externalId, date: row.date, amount: row.amount, currency: 'EUR', description: row.description, accountId: row.accountId,
      counterAccountId: row.counterAccountId, categoryId: row.categoryId, notCounted: row.notCounted, tags: row.tags, note: '',
      origin: { source: ORIGIN_SOURCES.sheet, externalId: row.externalId },
    }));
  }
  /** @type {FinanceAccount[]} */
  const afterAccounts = [
    ...accounts,
    ...accountPlans.filter((plan) => plan.account === null).map((plan) => /** @type {FinanceAccount} */ ({ id: plan.id, name: plan.name, kind: 'cash', valuation: 'balance', archivedOn: null, origin: null })),
  ];
  const afterObservations = [
    ...observations,
    ...openings.filter((opening) => opening.status === 'new').map((opening) => /** @type {FinanceObservation} */ ({ accountId: opening.accountId, date: opening.date, amount: opening.amount })),
  ];
  const inputs = { accounts: afterAccounts, observations: afterObservations, trades: [], prices: [], transactions: afterTransactions };
  const kindOf = new Map(categoryPlans.filter((plan) => plan.parentKey === null).map((plan) => [plan.name, plan.kind]));
  // Balances are compared on the ledger's last day, or on a later statement
  // row that reaches an account, so nothing the import writes is left out.
  const checkDay = [range.to, ...updates.map((update) => update.transaction.date)].sort().at(-1) ?? range.to;

  for (const plan of accountPlans) {
    plan.checkDay = checkDay;
    let balance = 0;
    for (const movement of movements) {
      const out = movement.from === plan.ledgerName;
      const into = movement.to === plan.ledgerName;
      if (out) balance -= movement.amount;
      if (into) balance += movement.amount;
      if (!movement.counted) continue;
      const kind = kindOf.get(movement.category);
      if ((movement.type === 'uscita' || movement.type === 'investimento') && out) {
        plan.ledgerTotals.spending += movement.amount;
        if (kind === 'income') {
          plan.ledgerFiled.income -= movement.amount;
          plan.refiled += movement.amount;
        } else plan.ledgerFiled.spending += movement.amount;
      }
      if (movement.type === 'entrata' && into) {
        plan.ledgerTotals.income += movement.amount;
        if (kind === 'expense') {
          plan.ledgerFiled.spending -= movement.amount;
          plan.refiled += movement.amount;
        } else plan.ledgerFiled.income += movement.amount;
      }
    }
    plan.ledgerBalance = plan.statements ? null : balance;
    const own = afterTransactions.filter((transaction) => transaction.accountId === plan.id);
    const totals = totalsBetween(own, afterCategories, range.from, range.to);
    plan.computedTotals = { spending: totals.spending, income: totals.income };
    plan.uncategorised = own.filter(
      (transaction) =>
        transaction.origin?.source === ORIGIN_SOURCES.statement && transaction.date >= range.from && transaction.date <= range.to &&
        transaction.categoryId === null && transaction.counterAccountId === null && !transaction.notCounted
    ).length;
    const subject = afterAccounts.find((account) => account.id === plan.id);
    plan.valueAfter = subject === undefined ? null : accountValueOn(subject, inputs, checkDay);
  }
}

/**
 * Whether an id in the plan stands for a record the write creates.
 *
 * @param {string | null | undefined} id
 * @returns {boolean}
 */
export function isPlaceholder(id) {
  return typeof id === 'string' && (id.startsWith(NEW_ACCOUNT) || id.startsWith(NEW_CATEGORY));
}
