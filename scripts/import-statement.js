#!/usr/bin/env node
/**
 * Imports a bank or card statement as the transactions of its account
 * (roadmap stage 2, ADR 0037, ADR 0041). For an account that has statements,
 * the statements are its transactions.
 *
 *   npm run data:import-statement -- <file.csv> [--format <id>] --account "<name>"
 *     [--account-for <product>="<name>" ...] [--write]
 *
 * A dry run by default: it prints the format, each account (and whether it
 * would be created), the date range, how many movements are new, already
 * imported and unchanged, or changed in the source's zone, the skipped lines
 * by reason, the sum of the new movements, the opening balance a running
 * balance makes known and the balance check -- the file's last balance
 * against the account's balance after the import, with the difference,
 * never "fixed" -- and writes nothing. `--format` names one of the formats in
 * `scripts/statement-import/formats/`; without it the header chooses, and a
 * header that does not match the declared format is refused.
 *
 * With --write, after a backup, it writes what the dry run printed: it
 * refuses, writing nothing, while anything in the report blocks or the demo
 * finance rows are present; a second run of the same file changes nothing
 * and takes no backup. Stop `npm run serve` (and `dev`, if running) before
 * --write: like every data script it does not take the writer lock (ADR
 * 0032). The statement is personal: keep it out of the repository.
 *
 * Categorising is the next step; the bank's own category, merchant and
 * movement type are kept on each transaction's origin for it.
 */

import '../lib/config/env.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { getAccounts, getLinks, getObservations, getProfile, getTransactions, hasDemoFinance } from '../lib/store.js';
import { FORMATS } from './statement-import/formats/index.js';
import { formatMinor } from './statement-import/money.js';
import { planStatement } from './statement-import/plan.js';
import { readStatement } from './statement-import/read.js';
import { writePlan } from './statement-import/write.js';

/**
 * @typedef {object} StatementOptions
 * @property {string} csvPath
 * @property {string | null} [format] a format id; null or absent: the header chooses
 * @property {string | null} [account] the account `--account` names
 * @property {Record<string, string>} [accountFor] product to account name, from `--account-for`
 * @property {boolean} [write]
 * @property {(line: string) => void} [print]
 */

/**
 * @param {StatementOptions} options
 * @returns {Promise<{ plan: import('./statement-import/plan.js').StatementPlan, blocking: string[], backupPath?: string }>}
 */
export async function importStatement({ csvPath, format = null, account = null, accountFor = {}, write = false, print = (line) => console.log(line) }) {
  const read = readStatement(await readFile(csvPath, 'utf8'), format);
  const [accounts, transactions, observations, profile, demoFinance, links] = await Promise.all([
    getAccounts(),
    getTransactions(),
    getObservations({}),
    getProfile(),
    hasDemoFinance(),
    getLinks({ rel: 'refund_of' }),
  ]);
  const plan = planStatement({
    read,
    accountNames: { main: account, byProduct: accountFor },
    accounts,
    transactions,
    observations,
    demoFinance,
    trackedSince: profile.financeTrackedSince,
    links,
  });

  if (!write) {
    for (const line of describePlan(plan, 'dry run: nothing was written.')) print(line);
    return { plan, blocking: plan.blocking };
  }
  const { backupPath, written } = await writePlan(plan, print);
  if (backupPath !== undefined) {
    for (const line of describePlan(plan, 'written.')) print(line);
    print('');
    print(
      'Wrote ' + written.accounts + ' account(s), ' + written.balances + ' opening balance(s), ' + written.created +
        ' new movement(s) and ' + written.updated + ' changed one(s).'
    );
  }
  return { plan, blocking: plan.blocking, backupPath };
}

/** The blocking lines the report prints before "and N more": enough to see the pattern. */
const MAX_BLOCKING_SHOWN = 10;

/**
 * The report, line by line. Printed to the terminal only: it holds your
 * account names and amounts.
 *
 * @param {import('./statement-import/plan.js').StatementPlan} plan
 * @param {string} outcome
 * @returns {string[]}
 */
export function describePlan(plan, outcome) {
  const lines = [
    'Statement import -- ' + outcome,
    '',
    'Format: ' + plan.format.id + (plan.detected ? ' (detected from the header)' : '') + ' -- ' + plan.format.label,
    'Lines read: ' + plan.lineCount,
  ];
  for (const account of plan.accounts) {
    lines.push(
      '',
      'Account "' + account.name + '"' + (account.product === null ? '' : ' (product ' + account.product + ')') + ': ' +
        (account.account === null ? 'would be created (cash, ' + account.currency + ')' : 'exists'),
      '  from ' + account.firstDate + ' to ' + account.lastDate,
      '  movements: ' + account.counts.new + ' new, ' + account.counts.unchanged + ' already imported and unchanged, ' +
        account.counts.changed + ' changed in the source\'s zone',
      '  sum of the new movements: ' + formatMinor(account.newSum) + ' ' + account.currency
    );
    if (account.opening !== null) {
      lines.push(
        '  opening balance: ' + formatMinor(account.opening.amount) + ' on ' + account.opening.date +
          ', the balance before the first movement, read from the running balance'
      );
    }
    for (const note of account.notes) lines.push('  ' + note);
    if (account.check !== null) {
      const { check } = account;
      lines.push(
        '  balance check: the file says ' + formatMinor(check.fileBalance) + ' after its last movement on ' + check.fileDate + '; ' +
          (check.accountBalance === null || check.difference === null
            ? 'the account would still be unknown then'
            : 'the account would be ' + formatMinor(check.accountBalance) + ' -- ' +
              (check.difference === 0 ? 'they match' : 'a difference of ' + formatMinor(check.difference)))
      );
      if (check.chainBreaks > 0) {
        lines.push('  the running balance does not follow the rows at ' + check.chainBreaks + ' place(s): lines are missing or out of order');
      }
    } else if (account.valueAfter !== null) {
      lines.push('  after the import the account would be ' + formatMinor(account.valueAfter.amount) + ' on ' + account.lastDate + ' (no running balance to check it against)');
    }
  }

  /** @type {Map<string, number>} */
  const reasons = new Map();
  for (const skip of plan.skipped) reasons.set(skip.reason, (reasons.get(skip.reason) ?? 0) + 1);
  if (reasons.size > 0) {
    lines.push('', 'Skipped lines, by reason:');
    for (const [reason, count] of reasons) lines.push('  ' + String(count).padStart(5) + '  ' + reason);
  }
  if (plan.unapplied !== null) {
    lines.push(
      '',
      'Not applied to the amounts (kept on each movement for the next step): foreign-exchange fees ' + formatMinor(plan.unapplied.fxFee) +
        ', cashback ' + formatMinor(plan.unapplied.cashback)
    );
  }
  section(lines, 'Warnings', plan.warnings.map((warning) => 'warning: ' + warning));
  section(
    lines,
    'Blocking -- --write is refused until these are resolved',
    plan.blocking.length > MAX_BLOCKING_SHOWN
      ? [...plan.blocking.slice(0, MAX_BLOCKING_SHOWN), 'and ' + (plan.blocking.length - MAX_BLOCKING_SHOWN) + ' more']
      : plan.blocking
  );
  lines.push('', plan.blocking.length === 0 ? 'Nothing blocks the import.' : 'The import would be refused: ' + plan.blocking.length + ' problem(s).');
  return lines;
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
 * @returns {StatementOptions}
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const paths = [];
  /** @type {StatementOptions} */
  const options = { csvPath: '', format: null, account: null, accountFor: {}, write: false };
  const accountFor = /** @type {Record<string, string>} */ (options.accountFor);
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    const value = () => {
      const next = args[at + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(arg + ' needs a value');
      at += 1;
      return next;
    };
    if (arg === '--write') options.write = true;
    else if (arg === '--format') options.format = value();
    else if (arg === '--account') options.account = value();
    else if (arg === '--account-for') {
      const pair = value();
      const equals = pair.indexOf('=');
      const product = pair.slice(0, equals).trim();
      const name = pair.slice(equals + 1).trim();
      if (equals === -1 || product === '' || name === '') throw new Error('--account-for takes <product>="<account name>", received ' + pair);
      if (product in accountFor) throw new Error('--account-for names ' + product + ' twice');
      accountFor[product] = name;
    } else if (arg.startsWith('--')) throw new Error('unknown option ' + arg);
    else paths.push(arg);
  }
  if (paths.length !== 1) throw new Error('name one statement file');
  options.csvPath = paths[0];
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error instanceof Error ? error.message : String(error)) + '\n');
    console.error('usage: npm run data:import-statement -- <file.csv> [--format <id>] --account "<account name>" [--account-for <product>="<account name>" ...] [--write]');
    console.error('formats: ' + FORMATS.map((format) => format.id).join(', '));
    process.exit(1);
  }
  try {
    await importStatement(options);
  } catch (error) {
    console.error('import refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
