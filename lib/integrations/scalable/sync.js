/**
 * The Scalable sync's core (spec #212, ADR 0031): reads everything from `sc`
 * first, maps it with no store write, then applies. The command runner is
 * injected, so the core never spawns a process; tests hand it a fake.
 *
 * Stages, in order, over one `SyncContext`:
 *
 *   1. fetch       every part reads what it needs from `sc` (nothing written)
 *   2. contribute  parts map rows into `ctx.holdings` (trades per ISIN) and
 *                  claim the row groups they handle; unclaimed rows are warned
 *   3. plan        the core resolves accounts and diffs trades; parts plan
 *                  their own writes and count any account they would create
 *   4. apply       holdings first (accounts, then each holding's trades as
 *                  one set), then each part's own writes, in order
 *
 * A failure in stages 1-3 throws with nothing written. A part is an object
 * of `SyncPart`; adding one is a module plus one line in `PARTS`.
 */

import { fetchHoldings, fetchTransactions } from './client.js';
import { applyHoldings, planHoldings } from './holdings.js';
import { BASE_CURRENCY, GROUP_LABELS, partitionRows } from './map.js';
import { cashPart } from './cash.js';
import { tradesPart } from './trades.js';

/**
 * @typedef {object} PlannedHolding
 * @property {string} isin
 * @property {string} name
 * @property {string | null} accountId null when the run would create it
 * @property {import('./map.js').SyncedTrade[]} trades the whole set
 * @property {{ created: number, updated: number, removed: number, unchanged: number }} diff
 */

/**
 * The state one run carries from stage to stage.
 *
 * @typedef {object} SyncContext
 * @property {import('./client.js').ScRunner} run
 * @property {typeof import('../../store.js')} store
 * @property {boolean} dryRun
 * @property {{ items: any[], cryptoItems: any[] }} holdingsList `sc broker holdings`
 * @property {any[]} rows every transaction row, newest first
 * @property {Record<import('./map.js').RowGroup, any[]>} groups the rows by kind
 * @property {Set<import('./map.js').RowGroup>} claimed groups some part handles
 * @property {Map<string, Record<string, any>>} details single orders' `security_trade`, by transaction id
 * @property {Map<string, string>} holdingNames ISIN -> the broker's name for it
 * @property {Set<string>} foreignIsins holdings the broker reports outside EUR
 * @property {Map<string, { name: string, trades: import('./map.js').SyncedTrade[] }>} holdings
 *   what the parts want written, per ISIN (see contributeTrades)
 * @property {PlannedHolding[]} plannedHoldings stage 3's result
 * @property {Map<string, string>} accountIds ISIN -> account id, for every
 *   holding that exists (planned) or was just created (applied)
 * @property {number} createsAccounts accounts the run would create; above
 *   zero, the first real run takes a backup. Parts add theirs in `plan`.
 * @property {string[]} warnings
 * @property {string[]} report the dry run's plan, line by line
 */

/**
 * @typedef {object} SyncPart
 * @property {string} name
 * @property {(ctx: SyncContext) => Promise<void>} [fetch] stage 1: read from `sc`, write nothing
 * @property {(ctx: SyncContext) => void} [contribute] stage 2: map rows into `ctx.holdings`, claim groups
 * @property {(ctx: SyncContext) => Promise<void> | void} [plan] stage 3: after holdings are planned
 * @property {(ctx: SyncContext) => Promise<number>} [apply] stage 4: after holdings are written;
 *   returns the number of records written
 */

/** The parts, in order. #215 prices, #217 cash, #220 swaps and transfers join here. */
export const PARTS = Object.freeze(/** @type {SyncPart[]} */ ([tradesPart, cashPart]));

/**
 * @typedef {object} SyncReport
 * @property {number} written records written (0 on a dry run and on an idempotent re-run)
 * @property {number} skipped transaction rows left alone
 * @property {string[]} warnings
 * @property {string} syncedAt
 * @property {string[]} report the plan, line by line
 * @property {string | null} backupPath where the data file was copied first, or null
 */

/**
 * @param {{ run: import('./client.js').ScRunner, store: typeof import('../../store.js'), dryRun?: boolean, parts?: readonly SyncPart[] }} options
 * @returns {Promise<SyncReport>}
 */
export async function syncScalable({ run, store, dryRun = false, parts = PARTS }) {
  if (await store.hasDemoFinance()) {
    throw new Error('the demo finance rows are still in your data: run `npm run data:remove-demo-finance` first');
  }

  const ctx = await readEverything(run, store, dryRun, parts);
  for (const part of parts) part.contribute?.(ctx);
  warnAboutUnclaimed(ctx);
  await planHoldings(ctx);
  for (const part of parts) await part.plan?.(ctx);

  let written = 0;
  /** @type {string | null} */
  let backupPath = null;
  if (!dryRun) {
    if (ctx.createsAccounts > 0) backupPath = (await store.backupData('scalable-sync')).backupPath;
    written += await applyHoldings(ctx);
    for (const part of parts) written += (await part.apply?.(ctx)) ?? 0;
  }

  const skipped = Object.entries(ctx.groups).filter(([group]) => group !== 'trade').reduce((sum, [, rows]) => sum + rows.length, 0);
  return { written, skipped, warnings: ctx.warnings, syncedAt: new Date().toISOString(), report: ctx.report, backupPath };
}

/**
 * Stage 1, and the empty context: the shared reads (holdings, transactions),
 * then each part's own.
 *
 * @param {import('./client.js').ScRunner} run
 * @param {typeof import('../../store.js')} store
 * @param {boolean} dryRun
 * @param {readonly SyncPart[]} parts
 * @returns {Promise<SyncContext>}
 */
async function readEverything(run, store, dryRun, parts) {
  const holdingsList = await fetchHoldings(run);
  const rows = await fetchTransactions(run);
  const { groups, warnings } = partitionRows(rows);

  /** @type {Map<string, string>} */
  const holdingNames = new Map();
  /** @type {Set<string>} */
  const foreignIsins = new Set();
  for (const item of holdingsList.items) {
    if (typeof item.isin !== 'string') continue;
    if (typeof item.name === 'string') holdingNames.set(item.isin, item.name);
    const currency = item.valuation_currency ?? item.quote_currency;
    if (currency !== undefined && currency !== BASE_CURRENCY) {
      foreignIsins.add(item.isin);
      warnings.push((item.name ?? item.isin) + ' (' + item.isin + ') is reported in ' + currency + ', not ' + BASE_CURRENCY + ': skipped');
    }
  }
  for (const item of holdingsList.cryptoItems) {
    const position = item.position ?? {};
    if ((position.filled ?? 0) > 0 || (position.pending ?? 0) > 0) {
      warnings.push('crypto position ' + (item.name ?? item.ticker) + ' is not synced: crypto is out of scope');
    }
  }

  /** @type {SyncContext} */
  const ctx = {
    run, store, dryRun, holdingsList, rows, groups,
    claimed: new Set(), details: new Map(), holdingNames, foreignIsins,
    holdings: new Map(), plannedHoldings: [], accountIds: new Map(),
    createsAccounts: 0, warnings, report: [],
  };
  for (const part of parts) await part.fetch?.(ctx);
  return ctx;
}

/** @param {SyncContext} ctx */
function warnAboutUnclaimed(ctx) {
  for (const [group, label] of Object.entries(GROUP_LABELS)) {
    const rows = ctx.groups[/** @type {import('./map.js').RowGroup} */ (group)];
    if (rows.length === 0 || ctx.claimed.has(/** @type {any} */ (group))) continue;
    ctx.warnings.push(rows.length + ' ' + label + ' row(s) left alone: not synced yet');
  }
}
