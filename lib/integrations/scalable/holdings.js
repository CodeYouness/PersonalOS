/**
 * The holdings stage of the Scalable sync: turns what the parts contributed
 * (`ctx.holdings`, one entry per ISIN with the whole set of its trades) into
 * accounts and trades. Accounts are found by origin and created when missing,
 * never adopted and never renamed (ADR 0031); a holding's trades are written
 * as one set, so the below-zero refusal is judged once and a trade the broker
 * stopped reporting is removed.
 */

import { firstDayUnitsGoNegative } from '../../domain/derive/finance.js';

export const SCALABLE_SOURCE = 'scalable';

/**
 * @param {import('../../domain/types.js').FinanceAccount[]} accounts
 * @param {string} isin
 */
export function findHolding(accounts, isin) {
  return accounts.find((account) => account.origin?.source === SCALABLE_SOURCE && account.origin.externalId === isin);
}

/**
 * Compares a holding's wanted set with what the store holds, for the dry run
 * and the report. The store's replaceSyncedTrades does the same comparison
 * when it writes.
 *
 * @param {import('../../domain/types.js').Trade[]} stored the account's trades
 * @param {import('./map.js').SyncedTrade[]} wanted
 */
export function diffTrades(stored, wanted) {
  const mine = new Map(stored.filter((t) => t.origin?.source === SCALABLE_SOURCE).map((t) => [t.origin?.externalId, t]));
  const counts = { created: 0, updated: 0, removed: 0, unchanged: 0 };
  for (const want of wanted) {
    const old = mine.get(want.externalId);
    if (old === undefined) counts.created += 1;
    else if (old.date === want.date && old.direction === want.direction && old.units === want.units && old.price === want.price && old.fee === want.fee) counts.unchanged += 1;
    else counts.updated += 1;
  }
  counts.removed = [...mine.keys()].filter((id) => !wanted.some((w) => w.externalId === id)).length;
  return counts;
}

/**
 * Plans every holding: resolves its account, diffs its trades, and sets
 * aside (with a warning) one whose trades would take it below zero units --
 * for instance a sell of units that arrived by a transfer a later part has
 * not mapped yet. Fills `ctx.plannedHoldings`, `ctx.accountIds` for the
 * accounts that exist, and counts the accounts the run would create.
 *
 * @param {import('./sync.js').SyncContext} ctx
 */
export async function planHoldings(ctx) {
  const accounts = await ctx.store.getAccounts();
  const trades = await ctx.store.getTrades();
  const known = new Set();

  for (const [isin, wanted] of ctx.holdings) {
    known.add(isin);
    const account = findHolding(accounts, isin);
    const stored = account === undefined ? [] : trades.filter((t) => t.accountId === account.id);
    const others = stored.filter((t) => t.origin?.source !== SCALABLE_SOURCE);
    const negativeOn = firstDayUnitsGoNegative([...others, .../** @type {any[]} */ (wanted.trades)]);
    if (negativeOn !== null) {
      ctx.warnings.push(
        wanted.name + ' (' + isin + ') was left alone: its trades would take it below zero units on ' + negativeOn +
          ' (units that arrived by a swap or a transfer are not mapped yet)'
      );
      continue;
    }
    if (account !== undefined) ctx.accountIds.set(isin, account.id);
    else ctx.createsAccounts += 1;
    ctx.plannedHoldings.push({ isin, name: wanted.name, accountId: account?.id ?? null, trades: wanted.trades, diff: diffTrades(stored, wanted.trades) });
  }

  // A holding the broker no longer reports any trade for: its synced trades go.
  for (const account of accounts) {
    if (account.origin?.source !== SCALABLE_SOURCE || account.valuation !== 'units') continue;
    const isin = account.origin.externalId;
    if (known.has(isin)) continue;
    const stored = trades.filter((t) => t.accountId === account.id);
    const diff = diffTrades(stored, []);
    if (diff.removed === 0) continue;
    ctx.accountIds.set(isin, account.id);
    ctx.plannedHoldings.push({ isin, name: account.name, accountId: account.id, trades: [], diff });
  }

  for (const holding of ctx.plannedHoldings) ctx.report.push(describeHolding(holding));
}

/**
 * @param {import('./sync.js').PlannedHolding} holding
 * @returns {string}
 */
function describeHolding(holding) {
  const { diff } = holding;
  const units = holding.trades.reduce((sum, t) => sum + (t.direction === 'buy' ? t.units : -t.units), 0) / 1e8;
  const head = (holding.accountId === null ? 'create holding ' : 'holding ') + '"' + holding.name + '" (' + holding.isin + ')';
  const changes = diff.created + diff.updated + diff.removed;
  return (
    head + ': ' + holding.trades.length + ' trade(s), ' + units + ' unit(s); ' +
    (changes === 0 ? 'nothing to change' : diff.created + ' new, ' + diff.updated + ' changed, ' + diff.removed + ' removed')
  );
}

/**
 * Writes the planned holdings. Returns the number of records written.
 *
 * @param {import('./sync.js').SyncContext} ctx
 * @returns {Promise<number>}
 */
export async function applyHoldings(ctx) {
  let written = 0;
  for (const holding of ctx.plannedHoldings) {
    let accountId = holding.accountId;
    if (accountId === null) {
      const account = await ctx.store.createAccount({
        name: holding.name,
        kind: 'investment',
        valuation: 'units',
        currency: 'EUR',
        source: 'integration',
        origin: { source: SCALABLE_SOURCE, externalId: holding.isin, syncedAt: new Date().toISOString(), sourceUpdatedAt: null },
      });
      accountId = account.id;
      written += 1;
    }
    ctx.accountIds.set(holding.isin, accountId);
    const result = await ctx.store.replaceSyncedTrades({ accountId, source: SCALABLE_SOURCE, trades: holding.trades });
    written += result.created + result.updated + result.removed;
  }
  return written;
}
