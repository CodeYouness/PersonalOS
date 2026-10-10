#!/usr/bin/env node
/**
 * The one-off import of the finance spreadsheet (#132): its movements,
 * opening balances, transfers, investment purchases and trades, through a
 * private mapping that is the only place category and account names exist.
 *
 *   npm run data:import-sheet -- <download.xlsx> <mapping.json>
 *
 * A dry run by default (#139): it reads both files, prints what it would
 * create and every row that needs your attention, and writes nothing.
 *
 * Plain Node, relative imports only, like the other data scripts. The dry
 * run reads only the two files it is given, never the data file. The
 * mapping and the report never go into the repository: keep the mapping in
 * `.scratch/`, and read the report in the terminal.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { validateMapping } from './sheet-import/mapping.js';
import { blockingReasons, planImport } from './sheet-import/plan.js';
import { readWorkbook } from './sheet-import/read.js';

/**
 * @param {{
 *   xlsxPath: string,
 *   mappingPath: string,
 *   print?: (line: string) => void,
 * }} options
 * @returns {Promise<{ plan: import('./sheet-import/plan.js').ImportPlan, blocking: string[] }>}
 */
export async function importSheet({ xlsxPath, mappingPath, print = (line) => console.log(line) }) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(mappingPath, 'utf8'));
  } catch (error) {
    throw new Error('the mapping is not readable JSON: ' + (error instanceof Error ? error.message : String(error)));
  }
  const mapping = validateMapping(parsed);
  const { movements, trades } = await readWorkbook(xlsxPath);
  const plan = planImport({ movements, trades, mapping });
  const blocking = blockingReasons(plan);

  for (const line of describePlan(plan, blocking)) print(line);
  return { plan, blocking };
}

/**
 * The dry run's report, line by line: what would be created, then every row
 * that needs attention. Printed to the terminal only.
 *
 * @param {import('./sheet-import/plan.js').ImportPlan} plan
 * @param {string[]} blocking
 * @returns {string[]}
 */
export function describePlan(plan, blocking) {
  const { transactions, report } = plan;
  const count = (/** @type {string} */ rule) => transactions.filter((transaction) => transaction.rule === rule).length;
  const lines = [
    'Sheet import -- dry run: nothing was written.',
    '',
    'Would create:',
    '  accounts       ' + plan.accounts.length,
    '  balances       ' + plan.balances.length,
    '  transactions   ' + (count('flow') + count('refund') + count('not counted')) +
      ' (flows ' + count('flow') + ', refunds ' + count('refund') + ', not counted ' + count('not counted') + ')',
    '  transfers      ' + (count('transfer') + count('investment')) + ' (investment purchases ' + count('investment') + ')',
    '  trades         ' + plan.trades.length,
    '  tracked since  ' + (plan.trackedSince ?? 'no movement') + ', unless it is already set',
  ];

  /** @type {Map<string, number>} */
  const totals = new Map();
  for (const transaction of transactions) {
    if (transaction.category === null || transaction.notCounted) continue;
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + transaction.amount);
  }
  section(lines, 'Totals per category', [...totals].sort(([a], [b]) => a.localeCompare(b)), ([path, total]) =>
    path.padEnd(32) + ' ' + euros(total).padStart(14)
  );
  section(lines, 'Refunds -- file one elsewhere with a "rows" override', report.refunds, (entry) =>
    'line ' + entry.line + '  ' + entry.date + '  ' + euros(entry.amount) + '  ' + entry.description + '  -> ' + entry.category
  );
  section(lines, 'Investment purchases without exactly one trade -- resolve with a "rows" override', report.unmatched, (entry) =>
    'line ' + entry.line + '  ' + entry.date + '  ' + euros(entry.amount) + '  ' + entry.matches + ' matching trades'
  );
  section(lines, 'Unmapped category pairs', report.unmappedPairs, (entry) => '"' + entry.pair + '"  lines ' + entry.lines.join(', '));
  section(lines, 'Unmapped accounts', report.unmappedAccounts, (entry) => '"' + entry.name + '"  lines ' + entry.lines.join(', '));
  section(lines, 'Unmapped tickers', report.unmappedTickers, (entry) => '"' + entry.ticker + '"  lines ' + entry.lines.join(', '));
  section(lines, 'Skipped rows', report.skipped, (entry) => 'line ' + entry.line + '  ' + entry.reason);
  section(lines, 'Rows that need a "rows" override', report.needsOverride, (entry) => 'line ' + entry.line + '  ' + entry.reason);
  section(lines, 'Trades with a cell that is not a number', report.unreadableTrades, (entry) => 'line ' + entry.line + '  ' + entry.field);
  section(lines, 'Rounded', report.rounding, (entry) => entry.tab + ' line ' + entry.line + '  ' + entry.field + ' ' + entry.value);

  lines.push('');
  lines.push(blocking.length === 0 ? 'Nothing blocks the import.' : 'The import would be refused until these are resolved: ' + blocking.length + '.');
  return lines;
}

/**
 * @template T
 * @param {string[]} lines
 * @param {string} title
 * @param {T[]} entries
 * @param {(entry: T) => string} describe
 */
function section(lines, title, entries, describe) {
  if (entries.length === 0) return;
  lines.push('', title + ':');
  for (const entry of entries) lines.push('  ' + describe(entry));
}

/**
 * An amount of minor units as the report shows it: "-1,234.56". Integer
 * arithmetic only: money is never a float (ADR 0009).
 *
 * @param {number} minor
 * @returns {string}
 */
function euros(minor) {
  const sign = minor < 0 ? '-' : '';
  const magnitude = Math.abs(minor);
  const whole = Math.floor(magnitude / 100).toLocaleString('en-GB');
  return sign + whole + '.' + String(magnitude % 100).padStart(2, '0');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const paths = process.argv.slice(2);
  if (paths.length !== 2) {
    console.error('usage: npm run data:import-sheet -- <download.xlsx> <mapping.json>');
    process.exit(1);
  }
  try {
    await importSheet({ xlsxPath: paths[0], mappingPath: paths[1] });
  } catch (error) {
    console.error('import refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
