#!/usr/bin/env node
/**
 * Gives the statements the categories of the ledger you kept by hand
 * (roadmap stage 2, ADR 0042), and makes the ledger the source of the
 * accounts that have no statement.
 *
 *   npm run data:import-ledger -- --movements <file.csv> --categories <file.csv>
 *     --accounts <file.csv> [--window <days>] [--account-map "<ledger name>=<account name>" ...] [--write]
 *
 * A dry run by default: the categories it would create and those that exist;
 * each ledger account and the account it goes to; per account with
 * statements, the ledger rows, the matches by days apart, the fields filled
 * and those left alone because you set them, and the ledger rows with no
 * statement movement; per account without, its transactions and opening
 * balance; the transfers by case; the statement movements in the ledger's
 * range still uncategorised; and the totals check -- spending and income as
 * the ledger counted them against what PersonalOS computes for the same
 * period after the import, with the difference, never adjusted. It writes
 * nothing.
 *
 * With --write, after a backup, it writes exactly that; it refuses, writing
 * nothing, while anything blocks or the demo finance rows are present, and a
 * second run changes nothing and takes no backup. Stop `npm run serve` (and
 * `dev`, if running) before --write: like every data script it does not take
 * the writer lock (ADR 0032). The ledger is personal: keep it out of the
 * repository, and read the report in the terminal.
 *
 * This replaces the one-off spreadsheet import (`data:import-sheet`), which
 * read the same ledger as an xlsx through a private mapping.
 */

import '../lib/config/env.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { getAccounts, getObservations, getProfile, getTransactions, hasDemoFinance } from '../lib/store.js';
import { DEFAULT_WINDOW_DAYS, ZONE_FIELDS, planLedger } from './ledger-import/plan.js';
import { readLedger } from './ledger-import/read.js';
import { pendingChanges, writePlan } from './ledger-import/write.js';
import { formatMinor } from './statement-import/money.js';

/**
 * @typedef {object} LedgerOptions
 * @property {string} movementsPath
 * @property {string} categoriesPath
 * @property {string} accountsPath
 * @property {number} [window] days a statement movement may be from the ledger's
 * @property {Record<string, string>} [accountMap] ledger account name to account name
 * @property {boolean} [write]
 * @property {(line: string) => void} [print]
 */

/** The largest window accepted: past a month, a match is a guess. */
const MAX_WINDOW_DAYS = 31;

/** The unmatched rows the report prints per account before "and N more". */
const MAX_UNMATCHED_SHOWN = 30;

/** The blocking lines the report prints before "and N more". */
const MAX_BLOCKING_SHOWN = 10;

/**
 * @param {LedgerOptions} options
 * @returns {Promise<{ plan: import('./ledger-import/plan.js').LedgerPlan, blocking: string[], backupPath?: string }>}
 */
export async function importLedger({
  movementsPath,
  categoriesPath,
  accountsPath,
  window = DEFAULT_WINDOW_DAYS,
  accountMap = {},
  write = false,
  print = (line) => console.log(line),
}) {
  const [movements, categories, accountsText] = await Promise.all([
    readFile(movementsPath, 'utf8'),
    readFile(categoriesPath, 'utf8'),
    readFile(accountsPath, 'utf8'),
  ]);
  const read = readLedger({ movements, categories, accounts: accountsText });
  const [accounts, transactions, observations, profile, demoFinance] = await Promise.all([
    getAccounts(),
    getTransactions(),
    getObservations({}),
    getProfile(),
    hasDemoFinance(),
  ]);
  const plan = planLedger({ read, accountMap, window, accounts, transactions, observations, categories: profile.financeCategories, demoFinance });

  if (!write) {
    for (const line of describePlan(plan, 'dry run: nothing was written.')) print(line);
    return { plan, blocking: plan.blocking };
  }
  const { backupPath, written } = await writePlan(plan, print);
  if (backupPath !== undefined) {
    for (const line of describePlan(plan, 'written.')) print(line);
    print('');
    print(
      'Wrote ' + written.accounts + ' account(s), ' + written.categories + ' categories, ' + written.openings + ' opening balance(s), ' +
        written.transactions + ' ledger transaction(s), filled ' + written.updates + ' statement movement(s) and removed ' + written.removals +
        ' leg(s) a statement row now carries.'
    );
  }
  return { plan, blocking: plan.blocking, backupPath };
}

/**
 * The report, line by line. Printed to the terminal only: it holds your
 * account names, categories, notes and amounts.
 *
 * @param {import('./ledger-import/plan.js').LedgerPlan} plan
 * @param {string} outcome
 * @returns {string[]}
 */
export function describePlan(plan, outcome) {
  const lines = ['Ledger import -- ' + outcome, ''];
  lines.push(
    plan.range === null ? 'The ledger has no movement.' : 'The ledger runs from ' + plan.range.from + ' to ' + plan.range.to + '; matching window ' + plan.window + ' day(s).'
  );

  // Categories.
  const tops = plan.categories.filter((category) => category.parentKey === null);
  const subs = plan.categories.filter((category) => category.parentKey !== null);
  const toCreate = plan.categories.filter((category) => category.existing === null);
  lines.push(
    '',
    'Categories: ' + tops.length + ' with ' + subs.length + ' subcategories -- ' + toCreate.length + ' to create, ' +
      (plan.categories.length - toCreate.length) + ' already there'
  );
  for (const top of tops) {
    const children = subs.filter((sub) => sub.parentKey === top.key);
    const fresh = children.filter((child) => child.existing === null).length;
    const fixed = children.filter((child) => child.fixedCost).length;
    lines.push(
      '  ' + top.name + ' (' + (top.kind === 'income' ? 'income' : 'spending') + ', ' + (top.existing === null ? 'new' : 'exists') + '): ' +
        children.length + ' subcategories, ' + fresh + ' new' + (fixed > 0 ? ', ' + fixed + ' fixed cost' : '')
    );
  }

  // Accounts.
  lines.push('', 'Accounts:');
  for (const account of plan.accounts) {
    lines.push(
      '  "' + account.ledgerName + '"' + (account.name === account.ledgerName ? '' : ' -> "' + account.name + '"') + ': ' +
        (account.account === null ? 'would be created (cash)' : 'exists') + ', ' +
        (account.statements ? 'has statements -- matched, not imported' : 'no statements -- the ledger is its source')
    );
  }

  for (const account of plan.accounts) {
    lines.push('', 'Account "' + account.name + '"' + (account.statements ? ' (statements)' : ' (from the ledger)') + ':');
    lines.push('  ledger rows: ' + account.sides + (account.openingRows > 0 ? ', and ' + account.openingRows + ' opening balance row(s)' : ''));
    if (account.statements) {
      const matched = Object.values(account.byDistance).reduce((sum, count) => sum + count, 0);
      const distances = Object.keys(account.byDistance).map(Number).sort((a, b) => a - b);
      lines.push(
        '  matched: ' + matched + (distances.length === 0 ? '' : ' (' + distances.map((days) => days + ' day(s) apart: ' + account.byDistance[days]).join(', ') + ')')
      );
      lines.push('  categories applied: ' + (account.applied.category ?? 0));
      lines.push('  fields filled: ' + fieldCounts(account.applied));
      lines.push('  fields left alone, already set in the app: ' + fieldCounts(account.leftAlone));
      if (account.already > 0) lines.push('  matched with nothing left to fill: ' + account.already);
      lines.push('  ledger rows with no statement movement: ' + account.unmatched.length);
      for (const row of account.unmatched.slice(0, MAX_UNMATCHED_SHOWN)) {
        lines.push(
          '    ' + row.ledgerId + '  ' + row.date + '  ' + formatMinor(row.amount).padStart(12) + '  ' + row.pair +
            (row.note === '' ? '' : '  "' + row.note + '"') + (row.reason === 'no statement movement' ? '' : '  -- ' + row.reason)
        );
      }
      if (account.unmatched.length > MAX_UNMATCHED_SHOWN) lines.push('    and ' + (account.unmatched.length - MAX_UNMATCHED_SHOWN) + ' more');
      lines.push("  statement movements in the ledger's range still uncategorised: " + account.uncategorised);
    } else {
      const counts = account.ledgerTransactions;
      lines.push('  transactions: ' + counts.new + ' new, ' + counts.unchanged + ' already imported and unchanged, ' + counts.changed + ' changed in the ledger');
      const removed = plan.removals.filter((removal) => removal.transaction.accountId === account.id).length;
      if (removed > 0) lines.push('  transfer legs removed, their statement row now carries them: ' + removed);
      if (account.ledgerBalance !== null) {
        lines.push(
          '  ledger balance check on ' + account.checkDay + ': ' +
            (account.valueAfter === null
              ? 'unknown after the import; the ledger implies ' + formatMinor(account.ledgerBalance)
              : formatMinor(account.valueAfter.amount) + ' after the import, the ledger implies ' + formatMinor(account.ledgerBalance) +
                ' -- ' + (account.valueAfter.amount === account.ledgerBalance ? 'they match' : 'a difference of ' + formatMinor(account.valueAfter.amount - account.ledgerBalance)))
        );
      }
    }
    if (account.valueAfter !== null) {
      lines.push(
        '  balance on ' + account.checkDay + ' after the import: ' + formatMinor(account.valueAfter.amount) +
          (account.dashboard === null ? '' : "; the ledger's dashboard says " + formatMinor(account.dashboard) + ', a difference of ' + formatMinor(account.valueAfter.amount - account.dashboard))
      );
    } else {
      lines.push('  balance after the import: unknown -- no balance anchors it' + (account.dashboard === null ? '' : "; the ledger's dashboard says " + formatMinor(account.dashboard)));
    }
  }

  // Transfers.
  /** @type {Record<string, string>} */
  const caseLabels = {
    'both statements': 'both ends statement rows, both not counted',
    'one statement row': "one end's statement row carries it, the other statement has no row (a card top-up)",
    'statement and ledger': 'the statement row carries it to an account the ledger feeds',
    'leg written': "statement row not found; the ledger account's leg written",
    'ledger only': 'one ledger transaction between two accounts the ledger feeds',
    unmatched: 'no statement movement -- listed above, nothing written',
  };
  if (plan.transfers.length > 0) {
    lines.push('', 'Transfers: ' + plan.transfers.length);
    for (const [key, label] of Object.entries(caseLabels)) {
      const count = plan.transfers.filter((transfer) => transfer.case === key).length;
      if (count > 0) lines.push('  ' + String(count).padStart(5) + '  ' + label);
    }
    const carried = plan.transfers.filter((transfer) => transfer.case === 'one statement row');
    if (carried.length > 0) {
      lines.push('  carried by one statement row -- check the other statement really has none:');
      for (const transfer of carried.slice(0, MAX_UNMATCHED_SHOWN)) {
        lines.push('    ' + transfer.ledgerId + '  ' + transfer.date + '  ' + formatMinor(transfer.amount).padStart(12) + '  ' + transfer.from + ' -> ' + transfer.to);
      }
      if (carried.length > MAX_UNMATCHED_SHOWN) lines.push('    and ' + (carried.length - MAX_UNMATCHED_SHOWN) + ' more');
    }
  }

  // Opening balances.
  if (plan.openings.length > 0 || plan.ignoredOpenings.length > 0) {
    lines.push('', 'Opening balances:');
    for (const opening of plan.openings) {
      lines.push(
        '  "' + opening.account + '": ' + formatMinor(opening.amount) + ' on ' + opening.date + ' -- ' +
          (opening.status === 'new' ? 'would be recorded, the day before its first movement' :
            opening.status === 'recorded' ? 'already recorded' :
            'not recorded: the balance of ' + opening.anchoredOn + ' already anchors the account')
      );
    }
    for (const ignored of plan.ignoredOpenings) {
      lines.push('  "' + ignored.account + '": ' + formatMinor(ignored.amount) + ' on ' + ignored.date + ' (' + ignored.ledgerId + ') -- ignored, the statement knows better');
    }
  }

  // Totals check.
  if (plan.range !== null) {
    lines.push('', 'Totals check, ' + plan.range.from + ' to ' + plan.range.to + ' -- counted as the ledger has them, and as PersonalOS computes them after the import:');
    lines.push('  ' + 'account'.padEnd(28) + 'spending: ledger'.padStart(18) + 'PersonalOS'.padStart(14) + 'difference'.padStart(14) + '   income: ledger'.padStart(18) + 'PersonalOS'.padStart(14) + 'difference'.padStart(14));
    /** @param {string} label @param {import('./ledger-import/plan.js').AccountPlan[]} group */
    const row = (label, group) => {
      const sum = (/** @type {(account: import('./ledger-import/plan.js').AccountPlan) => number} */ pick) => group.reduce((total, account) => total + pick(account), 0);
      const ledgerSpending = sum((account) => account.ledgerTotals.spending);
      const spending = sum((account) => account.computedTotals.spending);
      const ledgerIncome = sum((account) => account.ledgerTotals.income);
      const income = sum((account) => account.computedTotals.income);
      lines.push(
        '  ' + label.padEnd(28) + formatMinor(ledgerSpending).padStart(18) + formatMinor(spending).padStart(14) + formatMinor(spending - ledgerSpending).padStart(14) +
          formatMinor(ledgerIncome).padStart(18) + formatMinor(income).padStart(14) + formatMinor(income - ledgerIncome).padStart(14)
      );
    };
    for (const account of plan.accounts) row(account.name.slice(0, 27), [account]);
    row('accounts with statements', plan.accounts.filter((account) => account.statements));
    row('accounts from the ledger', plan.accounts.filter((account) => !account.statements));
    row('all', plan.accounts);
    lines.push('  On an account with statements, PersonalOS counts every statement movement, uncategorised ones by their sign; the ledger counts its own rows.');
    for (const account of plan.accounts.filter((row) => row.refiled !== 0)) {
      lines.push(
        '  ' + account.name + ': ' + formatMinor(account.refiled) + ' the ledger counts as income or spending sits in a category of the other kind, ' +
          'so PersonalOS files it as a refund or a chargeback -- spending and income are each that much lower, what is left is the same. ' +
          'As PersonalOS files the ledger: spending ' + formatMinor(account.ledgerFiled.spending) + ', income ' + formatMinor(account.ledgerFiled.income)
      );
    }
  }

  section(lines, 'Warnings', plan.warnings.map((warning) => 'warning: ' + warning));
  section(
    lines,
    'Blocking -- --write is refused until these are resolved',
    plan.blocking.length > MAX_BLOCKING_SHOWN ? [...plan.blocking.slice(0, MAX_BLOCKING_SHOWN), 'and ' + (plan.blocking.length - MAX_BLOCKING_SHOWN) + ' more'] : plan.blocking
  );
  const pending = pendingChanges(plan);
  lines.push(
    '',
    plan.blocking.length > 0 ? 'The import would be refused: ' + plan.blocking.length + ' problem(s).' :
      Object.values(pending).every((count) => count === 0) ? 'Nothing to change: the ledger is already imported.' :
      'Nothing blocks the import.'
  );
  return lines;
}

/**
 * @param {Record<string, number>} counts by field
 * @returns {string}
 */
function fieldCounts(counts) {
  const parts = ZONE_FIELDS.filter((field) => (counts[field] ?? 0) > 0).map((field) => (field === 'counter' ? 'counter account' : field === 'notCounted' ? 'not counted' : field) + ' ' + counts[field]);
  return parts.length === 0 ? 'none' : parts.join(', ');
}

/**
 * @param {string[]} lines
 * @param {string} title
 * @param {string[]} entries
 */
function section(lines, title, entries) {
  if (entries.length === 0) return;
  lines.push('', title + ':');
  for (const entry of entries) lines.push('  ' + entry);
}

/**
 * The command line, read strictly: an unknown flag or a missing value is an
 * error, never ignored.
 *
 * @param {string[]} args
 * @returns {LedgerOptions}
 */
export function parseArgs(args) {
  /** @type {LedgerOptions} */
  const options = { movementsPath: '', categoriesPath: '', accountsPath: '', window: DEFAULT_WINDOW_DAYS, accountMap: {}, write: false };
  const accountMap = /** @type {Record<string, string>} */ (options.accountMap);
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    const value = () => {
      const next = args[at + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(arg + ' needs a value');
      at += 1;
      return next;
    };
    if (arg === '--write') options.write = true;
    else if (arg === '--movements') options.movementsPath = value();
    else if (arg === '--categories') options.categoriesPath = value();
    else if (arg === '--accounts') options.accountsPath = value();
    else if (arg === '--window') {
      const text = value();
      if (!/^\d+$/.test(text) || Number(text) > MAX_WINDOW_DAYS) throw new Error('--window takes a whole number of days from 0 to ' + MAX_WINDOW_DAYS + ', received ' + text);
      options.window = Number(text);
    } else if (arg === '--account-map') {
      const pair = value();
      const equals = pair.indexOf('=');
      const ledgerName = pair.slice(0, equals).trim();
      const name = pair.slice(equals + 1).trim();
      if (equals === -1 || ledgerName === '' || name === '') throw new Error('--account-map takes "<ledger name>=<account name>", received ' + pair);
      if (ledgerName in accountMap) throw new Error('--account-map names "' + ledgerName + '" twice');
      accountMap[ledgerName] = name;
    } else throw new Error(arg.startsWith('--') ? 'unknown option ' + arg : 'unexpected argument ' + arg + ': name each file with its option');
  }
  const missing = [
    ['--movements', options.movementsPath],
    ['--categories', options.categoriesPath],
    ['--accounts', options.accountsPath],
  ].filter(([, path]) => path === '').map(([flag]) => flag);
  if (missing.length > 0) throw new Error('name the ledger files: ' + missing.join(', '));
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error instanceof Error ? error.message : String(error)) + '\n');
    console.error(
      'usage: npm run data:import-ledger -- --movements <file.csv> --categories <file.csv> --accounts <file.csv> ' +
        '[--window <days>] [--account-map "<ledger name>=<account name>" ...] [--write]'
    );
    process.exit(1);
  }
  try {
    await importLedger(options);
  } catch (error) {
    console.error('import refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
