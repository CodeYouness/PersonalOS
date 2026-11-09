#!/usr/bin/env node
/**
 * The one-off import of DEGIRO's transactions export (spec #212, ticket #219,
 * ADR 0031): the holdings you had there, with their trades and month-end
 * prices, each ending on the day its units arrived at Scalable.
 *
 *   npm run data:import-degiro -- <transactions.csv>           dry run
 *   npm run data:import-degiro -- <transactions.csv> --write   back up, then write
 *
 * A dry run by default: it prints the plan, every skipped row, every warning
 * and every row that blocks the write, and writes nothing. With --write it
 * refuses, writing nothing, while the demo finance rows are present or
 * anything blocks. A second --write changes nothing and takes no backup.
 *
 * It reads `sc` (Scalable's CLI, logged in read-only) for the Scalable
 * transfers in, whose day and value end the handed-over holdings, and for the
 * charts the delisting close and the month-end prices come from. The Scalable
 * sync must have run first. The export is personal: keep it out of the
 * repository. Stop `npm run dev` before --write (ADR 0011).
 *
 * The run order: remove the demo rows, `npm run sync:scalable`, this dry run,
 * read the report, this with --write, then the sheet import.
 */

import '../lib/config/env.js';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { today } from '../lib/domain/dates.js';
import { ScCommandError, callSc, fetchTransactions } from '../lib/integrations/scalable/client.js';
import { SCALABLE_SYNC_SOURCE } from '../lib/domain/derive/sync-staleness.js';
import { partitionRows } from '../lib/integrations/scalable/map.js';
import { dropCancellationPairs, mapMovementRow } from '../lib/integrations/scalable/movements.js';
import { chartPoints } from '../lib/integrations/scalable/prices.js';
import { makeScRunner } from '../lib/integrations/scalable/run-sc.js';
import { getSyncStates } from '../lib/store.js';
import { parseDegiro } from './degiro-import/parse.js';
import { planDegiro } from './degiro-import/plan.js';
import { writePlan } from './degiro-import/write.js';

/**
 * @param {{
 *   csvPath: string,
 *   write?: boolean,
 *   run?: import('../lib/integrations/scalable/client.js').ScRunner,
 *   print?: (line: string) => void,
 * }} options
 * @returns {Promise<{ plan: import('./degiro-import/plan.js').DegiroPlan, blocking: string[], backupPath?: string }>}
 */
export async function importDegiro({ csvPath, write = false, run = makeScRunner(), print = (line) => console.log(line) }) {
  const { rows, problems } = parseDegiro(await readFile(csvPath, 'utf8'));

  const { groups } = partitionRows(await fetchTransactions(run));
  const arrivals = dropCancellationPairs(groups.transfer).rows.filter((row) => String(row.non_trade_security_transaction_type).endsWith('_IN') && typeof row.isin === 'string');
  const transfersIn = arrivals.map((row) => {
    const trade = mapMovementRow(row);
    return { isin: /** @type {string} */ (row.isin), date: trade.date, units: trade.units, price: trade.price };
  });

  /** @type {Map<string, { day: string, price: number }[]>} */
  const charts = new Map();
  for (const isin of new Set(rows.map((row) => row.isin))) {
    try {
      charts.set(isin, chartPoints(await callSc(run, ['broker', 'chart', '--isin', isin, '--timeframe', 'max'])));
    } catch (error) {
      // Scalable does not know the security (exit 10): no prices for it. Any
      // other failure (session, network) is a failed run.
      if (!(error instanceof ScCommandError) || error.exitCode !== 10) throw error;
      charts.set(isin, []);
    }
  }

  const scalableSynced = (await getSyncStates()).some((state) => state.integration === SCALABLE_SYNC_SOURCE && state.lastRunAt !== null);
  const plan = planDegiro({ rows, problems, transfersIn, charts, today: today(), scalableSynced });

  if (!write) {
    for (const line of describePlan(plan)) print(line);
    return { plan, blocking: plan.blocking };
  }
  const { backupPath } = await writePlan(plan, print);
  return { plan, blocking: plan.blocking, backupPath };
}

/**
 * The dry run's report, line by line. Printed to the terminal only.
 *
 * @param {import('./degiro-import/plan.js').DegiroPlan} plan
 * @returns {string[]}
 */
export function describePlan(plan) {
  const lines = [
    'DEGIRO import -- dry run: nothing was written.',
    '',
    'Would create:',
    '  holdings  ' + plan.holdings.length,
    '  trades    ' + plan.holdings.reduce((sum, h) => sum + h.trades.length, 0),
    '  prices    ' + plan.holdings.reduce((sum, h) => sum + h.prices.length, 0),
    '',
    'Holdings:',
  ];
  for (const h of plan.holdings) {
    lines.push(
      '  ' + h.name + ' (' + h.isin + '): ' + h.trades.length + ' trade(s), ' + h.prices.length + ' price(s), ' +
        (h.archivedOn === null ? 'still open' : 'ends ' + h.archivedOn)
    );
  }
  section(lines, 'Skipped rows', plan.skipped.map((s) => (s.line === null ? '' : 'line ' + s.line + '  ') + s.reason));
  section(lines, 'Warnings', plan.warnings.map((w) => 'warning: ' + w));
  section(lines, 'Blocking -- the write is refused until these are resolved', plan.blocking);
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const paths = args.filter((arg) => arg !== '--write');
  if (paths.length !== 1) {
    console.error('usage: npm run data:import-degiro -- <transactions.csv> [--write]');
    process.exit(1);
  }
  try {
    await importDegiro({ csvPath: paths[0], write: args.includes('--write') });
  } catch (error) {
    console.error('import refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
