/**
 * The statement import's plan: what a write would do, computed from the read
 * statement and the data as it stands, without writing anything. Pure: the
 * entry point reads the store and hands its rows in.
 *
 * Per account (one per product of the file, ADR 0041): the movements in the
 * order they happened, each new, already imported and unchanged, or changed
 * in the source's zone; the opening balance a running balance makes known
 * (ADR 0024: dated the day before the first movement, so the first day's
 * movements are added on top of it, never absorbed into it), only when
 * nothing anchors the account before the file starts; and the balance check,
 * the file's last balance against the account's value after the import,
 * computed by the one `accountValueOn`.
 *
 * Every refusal is in `blocking`, so the dry run lists exactly what --write
 * would refuse.
 */

import { FINANCE_CURRENCIES, ORIGIN_SOURCES } from '../../personalos.config.js';
import { shiftDayKey } from '../../lib/domain/dates.js';
import { accountValueOn, touchesAccount } from '../../lib/domain/derive/finance.js';
import { isSyncedAccount } from '../../lib/domain/origin.js';
import { unappliedTotals } from './formats/card-normalised.js';
import { FEE_KEY_SUFFIX, externalIdFor, movementKeys } from './identity.js';

/** The id an account that does not exist yet has in the plan. */
const NEW_ACCOUNT_ID = '(new account)';

/**
 * @typedef {import('../../lib/domain/types.js').FinanceAccount} FinanceAccount
 * @typedef {import('../../lib/domain/types.js').FinanceObservation} FinanceObservation
 * @typedef {import('../../lib/domain/types.js').Transaction} Transaction
 * @typedef {import('./formats/common.js').StatementRow} StatementRow
 *
 * @typedef {object} PlannedMovement
 * @property {string} key the stable id without its account prefix
 * @property {number} line
 * @property {string} date
 * @property {number} amount signed minor units
 * @property {string} currency
 * @property {string} description
 * @property {Record<string, string>} detail
 * @property {'new' | 'unchanged' | 'changed'} status
 *
 * @typedef {object} BalanceCheck
 * @property {number} fileBalance the balance after the file's last movement
 * @property {string} fileDate that movement's day
 * @property {number | null} accountBalance the account's value on that day after the import; null: unknown
 * @property {number | null} difference accountBalance - fileBalance
 * @property {number} chainBreaks rows whose balance is not the one before plus the row
 *
 * @typedef {object} AccountPlan
 * @property {string | null} product
 * @property {string} name
 * @property {FinanceAccount | null} account the existing account; null: it would be created
 * @property {string} currency
 * @property {PlannedMovement[]} movements in the order they happened
 * @property {{ new: number, unchanged: number, changed: number }} counts
 * @property {number} newSum the new movements' total, minor units
 * @property {string} firstDate
 * @property {string} lastDate
 * @property {{ date: string, amount: number } | null} opening the opening balance a write records
 * @property {{ amount: number, date: string } | null} valueAfter the account's value on lastDate after the import
 * @property {BalanceCheck | null} check null when the file carries no running balance for it
 * @property {string[]} notes
 *
 * @typedef {object} StatementPlan
 * @property {{ id: string, label: string }} format
 * @property {boolean} detected
 * @property {number} lineCount
 * @property {AccountPlan[]} accounts
 * @property {import('./formats/common.js').Skip[]} skipped
 * @property {string[]} warnings
 * @property {string[]} blocking
 * @property {{ fxFee: number, cashback: number } | null} unapplied the card columns not applied, over the imported rows
 * @property {string | null} trackedSince
 */

/**
 * @param {{
 *   read: import('./read.js').ReadStatement,
 *   accountNames: { main: string | null, byProduct: Record<string, string> },
 *   accounts: FinanceAccount[],
 *   transactions: Transaction[],
 *   observations: FinanceObservation[],
 *   demoFinance: boolean,
 *   trackedSince: string | null,
 * }} input
 * @returns {StatementPlan}
 */
export function planStatement({ read, accountNames, accounts, transactions, observations, demoFinance, trackedSince }) {
  const { format } = read;
  const skipped = [...read.skipped];
  /** @type {string[]} */
  const warnings = [];
  /** @type {string[]} */
  const blocking = read.problems.map((problem) => 'line ' + problem.line + ': ' + problem.reason);
  if (demoFinance) blocking.unshift('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');

  /** @type {StatementRow[]} */
  const rows = [];
  for (const row of read.rows) {
    if (!FINANCE_CURRENCIES.includes(row.currency)) skipped.push({ line: row.line, reason: 'currency ' + (row.currency || '(none)') + ' is not tracked' });
    else if (row.amount === 0 && row.fee === 0) skipped.push({ line: row.line, reason: 'zero amount' });
    else rows.push(row);
  }
  skipped.sort((a, b) => a.line - b.line);

  /** @type {Map<string | null, StatementRow[]>} */
  const byProduct = new Map();
  for (const row of rows) byProduct.set(row.product, [...(byProduct.get(row.product) ?? []), row]);

  const names = nameProducts(format, [...byProduct.keys()], accountNames, blocking, warnings);

  const statementTransactions = transactions.filter((transaction) => transaction.origin?.source === ORIGIN_SOURCES.statement);
  /** @type {AccountPlan[]} */
  const plans = [];
  for (const [product, productRows] of byProduct) {
    const name = names.get(product);
    if (name === undefined) continue;
    const matches = accounts.filter((account) => account.name === name);
    if (matches.length > 1) {
      blocking.push('two accounts are named "' + name + '": rename one so the statement has one account');
      continue;
    }
    const account = matches[0] ?? null;
    if (account !== null) {
      const refusal =
        account.valuation !== 'balance' ? 'is valued by units: a statement moves money on an account valued by balance' :
        isSyncedAccount(account) ? 'is synced from ' + account.origin?.source + ' and belongs to it' :
        account.archivedOn !== null ? 'is archived; restore it before importing' :
        null;
      if (refusal !== null) blocking.push('the account "' + name + '" ' + refusal);
    }
    const keyed = movementKeys(productRows);
    for (const problem of keyed.problems) blocking.push('line ' + problem.line + ': ' + problem.reason);
    plans.push(
      planAccount({
        format, product, name, account, rows: productRows, keys: keyed.keys, transactions, statementTransactions, observations, warnings,
        unreadable: read.problems.length,
      })
    );
  }

  const firstDay = plans.map((plan) => plan.firstDate).sort()[0];
  if (trackedSince !== null && firstDay !== undefined && firstDay < trackedSince) {
    warnings.push(
      'tracked since is ' + trackedSince + ' and the file starts on ' + firstDay +
        ': the earlier movements count in the balances but are not drawn in the history (Finances, Settings)'
    );
  }

  return {
    format: { id: format.id, label: format.label },
    detected: read.detected,
    lineCount: read.lineCount,
    accounts: plans,
    skipped,
    warnings,
    blocking,
    unapplied: format.id === 'card-normalised' ? unappliedTotals(rows) : null,
    trackedSince,
  };
}

/**
 * The account name each product of the file goes to. A product with none
 * blocks, listing the products found; a name given for a product the file
 * does not have is a warning.
 *
 * @param {import('./formats/common.js').StatementFormat} format
 * @param {(string | null)[]} products
 * @param {{ main: string | null, byProduct: Record<string, string> }} accountNames
 * @param {string[]} blocking
 * @param {string[]} warnings
 * @returns {Map<string | null, string>}
 */
function nameProducts(format, products, accountNames, blocking, warnings) {
  /** @type {Map<string | null, string>} */
  const names = new Map();
  const extra = Object.keys(accountNames.byProduct);
  if (format.mainProduct === null) {
    if (extra.length > 0) blocking.push('--account-for is for a file with products; the format "' + format.id + '" has none: use --account');
    if (accountNames.main === null) {
      if (products.length > 0) blocking.push('name the account the statement belongs to with --account "<account name>"');
    } else for (const product of products) names.set(product, accountNames.main);
    return names;
  }

  const found = products.map(String);
  if (accountNames.main !== null && accountNames.byProduct[format.mainProduct] !== undefined) {
    blocking.push('--account and --account-for ' + format.mainProduct + ' both name the ' + format.mainProduct + ' account: use one');
  }
  for (const product of found) {
    const name = product === format.mainProduct ? accountNames.main ?? accountNames.byProduct[product] : accountNames.byProduct[product];
    if (name === undefined || name === null) {
      blocking.push(
        'no account named for the product "' + product + '" (products in the file: ' + found.join(', ') + '): ' +
          (product === format.mainProduct ? 'add --account "<account name>"' : 'add --account-for ' + product + '="<account name>"')
      );
    } else names.set(product, name);
  }
  if (accountNames.main !== null && !found.includes(format.mainProduct)) {
    warnings.push('--account names "' + accountNames.main + '" but the file has no ' + format.mainProduct + ' movements');
  }
  for (const product of extra) {
    if (!found.includes(product)) warnings.push('--account-for ' + product + ' names "' + accountNames.byProduct[product] + '" but the file has no ' + product + ' movements');
  }
  const taken = new Map();
  for (const [product, name] of names) {
    if (taken.has(name)) blocking.push('the products "' + taken.get(name) + '" and "' + product + '" both go to "' + name + '": one product, one account');
    else taken.set(name, product);
  }
  return names;
}

/**
 * @param {{
 *   format: import('./formats/common.js').StatementFormat,
 *   product: string | null,
 *   name: string,
 *   account: FinanceAccount | null,
 *   rows: StatementRow[],
 *   keys: string[],
 *   transactions: Transaction[],
 *   statementTransactions: Transaction[],
 *   observations: FinanceObservation[],
 *   warnings: string[],
 *   unreadable: number,
 * }} input
 * @returns {AccountPlan}
 */
function planAccount({ format, product, name, account, rows, keys, transactions, statementTransactions, observations, warnings, unreadable }) {
  const accountId = account?.id ?? NEW_ACCOUNT_ID;
  /** @type {Map<StatementRow, string>} */
  const keyOf = new Map(rows.map((row, at) => [row, keys[at]]));
  // The movements in the order they happened; the running balance in the
  // order the bank booked them, which for Revolut is completion, not start.
  const sequence = chronological(rows, 'when');
  const dates = rows.map((row) => row.date).sort();
  const firstDate = dates[0];
  const lastDate = /** @type {string} */ (dates.at(-1));

  /** @type {Map<string, Transaction>} */
  const imported = new Map();
  if (account !== null) {
    for (const transaction of statementTransactions) {
      if (transaction.accountId === account.id && transaction.origin !== null) imported.set(transaction.origin.externalId, transaction);
    }
  }

  /** @type {PlannedMovement[]} */
  const movements = [];
  for (const row of sequence) {
    const key = /** @type {string} */ (keyOf.get(row));
    if (row.amount !== 0) movements.push(movement(row, key, row.amount, row.description, row.detail));
    if (row.fee > 0) movements.push(movement(row, key + FEE_KEY_SUFFIX, -row.fee, 'Fee: ' + row.description, { ...row.detail, part: 'fee' }));
  }
  /** @type {Transaction[]} */
  const replaced = [];
  for (const planned of movements) {
    const existing = account === null ? undefined : imported.get(externalIdFor(accountId, planned.key));
    if (existing === undefined) continue;
    planned.status = sameSourceZone(existing, planned, accountId) ? 'unchanged' : 'changed';
    if (planned.status === 'changed') replaced.push(existing);
  }
  const counts = { new: 0, unchanged: 0, changed: 0 };
  let newSum = 0;
  for (const planned of movements) {
    counts[planned.status] += 1;
    if (planned.status === 'new') newSum += planned.amount;
  }

  const kind = account?.kind ?? 'cash';
  const mine = observations.filter((observation) => observation.accountId === accountId);
  const balances = format.runningBalance && sequence.some((row) => row.balanceAfter !== null);
  /** @type {string[]} */
  const notes = [];
  /** @type {{ date: string, amount: number } | null} */
  let opening = null;
  /** @type {{ opening: number, closing: number, chainBreaks: number } | null} */
  let running = null;
  if (balances && unreadable > 0) {
    // A line that could not be read is missing from the chain and the sum:
    // an opening balance or a difference computed without it would be a
    // wrong number printed as a finding.
    notes.push(
      'opening balance and balance check: not computed -- ' + unreadable +
        ' line(s) could not be read (listed under Blocking) and would be missing from the running balance and the sum'
    );
  } else if (balances && kind !== 'cash') {
    notes.push("the file's running balance is not used on a " + kind + ' account: record its balance on the Finances screen');
  } else if (balances) {
    running = runningBalance(chronological(rows, 'balanceWhen'));
    const anchor = mine.filter((observation) => observation.date < firstDate).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (anchor === undefined) {
      opening = { date: shiftDayKey(firstDate, -1), amount: running.opening };
    } else {
      notes.push('opening balance: not recorded -- the balance of ' + anchor.date + ' already anchors the account before the file starts');
    }
  } else if (mine.length === 0) {
    notes.push(
      'balance: unknown -- this file carries no balance and the account has none. An account with no balance is unknown, not zero: ' +
        'record one on the Finances screen (the account, then Balance), dated ' + shiftDayKey(firstDate, -1) +
        ' -- the day before its first movement here -- so every movement counts'
    );
  } else {
    const first = mine.map((observation) => observation.date).sort()[0];
    if (first >= firstDate) notes.push('movements dated on or before its first balance (' + first + ') are not counted in its value');
  }

  // The account as it would be after the import: what is stored, the
  // changed movements replaced, the new ones added, the opening balance.
  const replacedIds = new Set(replaced.map((transaction) => transaction.id));
  /** @type {any[]} */
  const after = transactions.filter((transaction) => !replacedIds.has(transaction.id));
  for (const planned of movements) {
    if (planned.status !== 'unchanged') after.push({ accountId, counterAccountId: null, date: planned.date, amount: planned.amount });
  }
  /** @type {any[]} */
  const afterObservations = [...observations];
  if (opening !== null) afterObservations.push({ accountId, date: opening.date, amount: opening.amount });
  /** @type {any} */
  const subject = account ?? { id: NEW_ACCOUNT_ID, kind: 'cash', valuation: 'balance' };
  // Not computed while lines are unreadable: they would be missing from it.
  const valueAfter =
    unreadable > 0
      ? null
      : accountValueOn(subject, { accounts: [subject], observations: afterObservations, trades: [], prices: [], transactions: after }, lastDate);

  /** @type {BalanceCheck | null} */
  const check =
    running === null
      ? null
      : {
          fileBalance: running.closing,
          fileDate: lastDate,
          accountBalance: valueAfter?.amount ?? null,
          difference: valueAfter === null ? null : valueAfter.amount - running.closing,
          chainBreaks: running.chainBreaks,
        };

  if (account !== null) {
    const handMade = transactions.filter(
      (transaction) =>
        touchesAccount(transaction, account.id) &&
        transaction.origin?.source !== ORIGIN_SOURCES.statement &&
        transaction.date >= firstDate &&
        transaction.date <= lastDate
    );
    if (handMade.length > 0) {
      warnings.push(
        handMade.length + ' movement(s) on "' + name + '" between ' + firstDate + ' and ' + lastDate +
          ' are not from a statement. For an account that has statements, the statements are its transactions (ADR 0037): ' +
          'where one is the same money as a statement line, delete it by hand, or the month counts it twice'
      );
    }
    const planned = new Set(movements.map((m) => externalIdFor(accountId, m.key)));
    const gone = statementTransactions.filter(
      (transaction) =>
        transaction.accountId === account.id &&
        transaction.date >= firstDate &&
        transaction.date <= lastDate &&
        !planned.has(transaction.origin?.externalId ?? '')
    );
    if (gone.length > 0) {
      warnings.push(
        gone.length + ' movement(s) imported on "' + name + '" between ' + firstDate + ' and ' + lastDate +
          ' are not in this file -- the bank changed or dropped them, or an earlier export differed. Nothing is removed'
      );
    }
  }

  return {
    product,
    name,
    account,
    currency: account?.currency ?? rows[0].currency,
    movements,
    counts,
    newSum,
    firstDate,
    lastDate,
    opening,
    valueAfter,
    check,
    notes,
  };
}

/**
 * @param {StatementRow} row
 * @param {string} key
 * @param {number} amount
 * @param {string} description
 * @param {Record<string, string>} detail
 * @returns {PlannedMovement}
 */
function movement(row, key, amount, description, detail) {
  return { key, line: row.line, date: row.date, amount, currency: row.currency, description, detail, status: 'new' };
}

/**
 * Whether an imported transaction already says what the statement says, in
 * the source's zone (ADR 0023) and the bank's detail.
 *
 * @param {Transaction} existing
 * @param {PlannedMovement} planned
 * @param {string} accountId
 * @returns {boolean}
 */
function sameSourceZone(existing, planned, accountId) {
  return (
    existing.date === planned.date &&
    existing.amount === planned.amount &&
    existing.currency === planned.currency &&
    existing.description === planned.description &&
    existing.accountId === accountId &&
    canonical(existing.origin?.detail ?? {}) === canonical(planned.detail)
  );
}

/**
 * @param {Record<string, string>} detail
 * @returns {string}
 */
function canonical(detail) {
  return JSON.stringify(Object.keys(detail).sort().map((key) => [key, detail[key]]));
}

/**
 * What a row did to the balance: its amount, less its fee.
 *
 * @param {StatementRow} row
 */
function netOf(row) {
  return row.amount - row.fee;
}

/**
 * Rows whose running balance is not the balance before plus the row.
 *
 * @param {StatementRow[]} sequence
 * @returns {number}
 */
function chainBreaks(sequence) {
  let breaks = 0;
  for (let at = 1; at < sequence.length; at += 1) {
    const before = sequence[at - 1].balanceAfter;
    const balance = sequence[at].balanceAfter;
    if (before !== null && balance !== null && before + netOf(sequence[at]) !== balance) breaks += 1;
  }
  return breaks;
}

/**
 * One account's rows in time order, by a timestamp (or day) the row carries:
 * `when` for the order they happened, `balanceWhen` for the order the
 * running balance follows. On a tie, the file's own direction -- a file that
 * starts with its latest row is read backwards, so several rows of one day
 * in a newest-first file are read bottom up. With a running balance, the
 * direction whose balances follow the rows wins, so a file of a single day
 * is still read in the right order.
 *
 * @param {StatementRow[]} rows
 * @param {'when' | 'balanceWhen'} by
 * @returns {StatementRow[]}
 */
export function chronological(rows, by) {
  const indexed = rows.map((row, at) => ({ row, at }));
  const byWhen = (/** @type {{ row: StatementRow }} */ a, /** @type {{ row: StatementRow }} */ b) => a.row[by].localeCompare(b.row[by]);
  const forwards = [...indexed].sort((a, b) => byWhen(a, b) || a.at - b.at).map((entry) => entry.row);
  const backwards = [...indexed].sort((a, b) => byWhen(a, b) || b.at - a.at).map((entry) => entry.row);
  const newestFirst = rows[0][by] > /** @type {StatementRow} */ (rows.at(-1))[by];
  const preferred = newestFirst ? backwards : forwards;
  const other = newestFirst ? forwards : backwards;
  return chainBreaks(other) < chainBreaks(preferred) ? other : preferred;
}

/**
 * The balance before the first row and after the last, from the running
 * balance: the first row that has one, less what it and the rows before it
 * did; the last row that has one, plus what the rows after it did.
 *
 * @param {StatementRow[]} sequence in the order they happened
 * @returns {{ opening: number, closing: number, chainBreaks: number }}
 */
export function runningBalance(sequence) {
  const first = sequence.findIndex((row) => row.balanceAfter !== null);
  const last = sequence.findLastIndex((row) => row.balanceAfter !== null);
  let opening = /** @type {number} */ (sequence[first].balanceAfter);
  for (let at = 0; at <= first; at += 1) opening -= netOf(sequence[at]);
  let closing = /** @type {number} */ (sequence[last].balanceAfter);
  for (let at = last + 1; at < sequence.length; at += 1) closing += netOf(sequence[at]);
  return { opening, closing, chainBreaks: chainBreaks(sequence) };
}
