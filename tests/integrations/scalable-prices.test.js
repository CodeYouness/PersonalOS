/**
 * The Scalable sync's prices (ticket #215, ADR 0031): today's quote and one
 * price per month-end since the first trade, through `syncScalable` with a
 * fake `sc` and the real store on a throwaway DATA_DIR. The clock is pinned
 * (Date only) so "today" and "month-end" are the same on every machine.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fakeSc, nonTrade, savingsPlanBuy } from './scalable-fake.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/integrations/scalable/sync.js')} */
let sync;

const ISIN_A = 'XX0000000001';
const TODAY = new Date('2026-04-15T09:00:00.000Z');

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-scalable-prices-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  const dates = await import('@/lib/domain/dates.js');
  dates.setDefaultTimezone('Europe/Rome');
  sync = await import('@/lib/integrations/scalable/sync.js');
});

beforeEach(async () => {
  await store.resetToSeed();
  await store.removeDemoFinance();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** @param {string} at @param {number} mid */
const point = (at, mid) => ({ mid_price: mid, timestamp_utc: at });
/** @param {number} mid */
const quoteOf = (mid) => ({ quote_mid_price: mid, quote_timestamp_utc: '2026-04-14T21:59:58.371Z' });

const chart = {
  point_count: 4,
  data_points: [
    point('2025-12-30T20:00:00.000Z', 90),
    point('2026-01-30T20:00:00.000Z', 100),
    point('2026-03-31T19:00:00.000Z', 120.456),
    point('2026-04-14T21:59:58.000Z', 125),
  ],
};

/** @param {Record<string, unknown>} [extra] */
const scenario = (extra = {}) => ({
  transactions: [
    savingsPlanBuy({ id: 'p1', isin: ISIN_A, description: 'Example ETF 1', amount: -200, quantity: 2, last_event_datetime: '2026-01-05T08:00:00.000Z' }),
  ],
  charts: { [ISIN_A]: chart },
  quotes: { [ISIN_A]: quoteOf(126.5) },
  ...extra,
});

/** @param {Record<string, unknown>} s @param {{ dryRun?: boolean }} [options] */
const runSync = (s, options = {}) => sync.syncScalable({ run: fakeSc(s).run, store, dryRun: options.dryRun ?? false });

const holdingOf = async () => (await store.getAccounts()).find((a) => a.origin?.source === 'scalable' && a.origin.externalId === ISIN_A);

const pricesOf = async () => {
  const account = await holdingOf();
  return (await store.getPrices({ accountId: account?.id })).map((p) => [p.date, p.price]).sort();
};

describe('the Scalable sync: prices', () => {
  it('prices today and every month-end from the first trade, the last point on or before it, none before', async () => {
    await runSync(scenario());
    // Dec 2025 is before the first trade (Jan 5); Feb has no point of its own and takes January's.
    expect(await pricesOf()).toEqual([
      ['2026-01-31', 10000],
      ['2026-02-28', 10000],
      ['2026-03-31', 12046],
      ['2026-04-15', 12650],
    ]);
  });

  it('leaves exactly one price per holding per day on a second run, and writes nothing', async () => {
    await runSync(scenario());
    const second = await runSync(scenario());
    expect((await pricesOf()).length).toBe(4);
    expect(second.written).toBe(0);
  });

  it('corrects a day in place when the broker sends another price', async () => {
    await runSync(scenario());
    await runSync(scenario({ quotes: { [ISIN_A]: quoteOf(130) } }));
    const prices = await pricesOf();
    expect(prices.length).toBe(4);
    expect(prices.at(-1)).toEqual(['2026-04-15', 13000]);
  });

  it('values a holding with no trades for months by the month-end prices, not flat', async () => {
    await runSync(scenario());
    const inputs = {
      accounts: await store.getAccounts(), observations: [], trades: await store.getTrades(),
      prices: await store.getPrices(), transactions: [],
    };
    const account = /** @type {any} */ (inputs.accounts.find((a) => a.origin?.source === 'scalable'));
    const finance = await import('@/lib/domain/derive/finance.js');
    expect(finance.accountValueOn(account, inputs, '2026-02-28')).toMatchObject({ amount: 20000 });
    expect(finance.accountValueOn(account, inputs, '2026-03-31')).toMatchObject({ amount: 24092 });
  });

  it('skips a security with no chart data with a warning; its trades still count', async () => {
    const done = await runSync(scenario({ charts: { [ISIN_A]: { point_count: 0, data_points: [] } } }));
    const account = await holdingOf();
    expect((await store.getTrades({ accountId: account?.id })).length).toBe(1);
    expect(done.warnings.some((w) => w.includes(ISIN_A) && w.includes('chart'))).toBe(true);
    expect(await pricesOf()).toEqual([['2026-04-15', 12650]]);
  });

  it('prices a holding only to the day this run empties it, with no quote (tickets #215, #220)', async () => {
    const out = nonTrade({ id: 'o1', isin: ISIN_A, description: 'Example ETF 1', amount: -250, quantity: 2, last_event_datetime: '2026-03-02T00:00:00.000Z', non_trade_security_transaction_type: 'TRANSFER_OUT' });
    await runSync(scenario({ transactions: [...scenario().transactions, out] }));
    expect((await holdingOf())?.archivedOn).toBe('2026-03-02');
    expect((await pricesOf()).map(([date]) => date)).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('prices a holding through today on the run its units come back (tickets #215, #220)', async () => {
    const out = nonTrade({ id: 'o1', isin: ISIN_A, description: 'Example ETF 1', amount: -250, quantity: 2, last_event_datetime: '2026-03-02T00:00:00.000Z', non_trade_security_transaction_type: 'TRANSFER_OUT' });
    await runSync(scenario({ transactions: [...scenario().transactions, out] }));
    const back = nonTrade({ id: 'i1', isin: ISIN_A, description: 'Example ETF 1', amount: 300, quantity: 2, last_event_datetime: '2026-04-01T00:00:00.000Z', non_trade_security_transaction_type: 'TRANSFER_IN' });
    await runSync(scenario({ transactions: [...scenario().transactions, out, back] }));
    expect((await holdingOf())?.archivedOn).toBeNull();
    expect((await pricesOf()).map(([date]) => date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-15']);
  });

  it('--dry-run reports the prices it would write and writes none', async () => {
    const done = await runSync(scenario(), { dryRun: true });
    expect(done.report.some((line) => line.includes('prices') && line.includes('4 new'))).toBe(true);
    expect(await store.getPrices()).toEqual([]);
  });

  it('a quote the broker refuses fails the run before anything is written', async () => {
    await expect(runSync(scenario({ quotes: {} }))).rejects.toThrow();
    expect((await store.getAccounts()).filter((a) => a.origin?.source === 'scalable')).toEqual([]);
  });
});
