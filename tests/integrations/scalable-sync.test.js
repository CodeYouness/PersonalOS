/**
 * The Scalable sync's core (ticket #214, ADR 0031), driven through
 * `syncScalable` with a fake `sc` that answers from invented payloads and
 * the real store on a throwaway DATA_DIR. It asserts on what the store
 * holds afterwards, never on which internal call made it.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cashRow, fakeSc, savingsPlanBuy, singleBuy, singleDetails } from './scalable-fake.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/integrations/scalable/sync.js')} */
let sync;
/** @type {typeof import('@/lib/integrations/scalable/client.js')} */
let client;

const ISIN_A = 'XX0000000001';
const ISIN_B = 'XX0000000002';

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-scalable-sync-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  const dates = await import('@/lib/domain/dates.js');
  dates.setDefaultTimezone('Europe/Rome');
  sync = await import('@/lib/integrations/scalable/sync.js');
  client = await import('@/lib/integrations/scalable/client.js');
});

beforeEach(async () => {
  await store.resetToSeed();
  await store.removeDemoFinance();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** @param {string} id @param {string} isin @param {number} amount @param {number} quantity @param {string} at @param {Record<string, unknown>} [extra] */
const plan = (id, isin, amount, quantity, at, extra = {}) =>
  savingsPlanBuy({ id, isin, description: 'Example ETF ' + isin.slice(-1), amount, quantity, last_event_datetime: at, ...extra });

/** @param {import('./scalable-fake.js').Scenario} scenario @param {{ dryRun?: boolean }} [options] */
const runSync = (scenario, options = {}) => {
  const fake = fakeSc(scenario);
  return { fake, result: sync.syncScalable({ run: fake.run, store, dryRun: options.dryRun ?? false }) };
};

/** @param {string} isin */
const holdingOf = async (isin) =>
  (await store.getAccounts()).find((a) => a.origin?.source === 'scalable' && a.origin.externalId === isin);

describe('the Scalable sync: holdings and trades', () => {
  it('creates one holding per ISIN whose units are the sum of its buys and sells, to 10^-8', async () => {
    const { result } = runSync({
      pageSize: 2,
      details: { s3: singleDetails(50, 0) },
      holdings: [{ kind: 'security', isin: ISIN_A, name: 'Example World ETF', quantity: 3.123457, quote_currency: 'EUR', valuation_currency: 'EUR' }],
      transactions: [
        singleBuy({ id: 's3', isin: ISIN_A, description: 'Example World ETF', amount: 50, quantity: 0.5, side: 'SELL', last_event_datetime: '2026-03-10T10:00:00.000Z' }),
        plan('p2', ISIN_A, -100, 1.123457, '2026-02-03T08:00:00.000Z'),
        plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z'),
        plan('b1', ISIN_B, -90, 3, '2026-01-06T08:00:00.000Z'),
      ],
    });
    const done = await result;

    const a = await holdingOf(ISIN_A);
    expect(a).toMatchObject({ name: 'Example World ETF', kind: 'investment', valuation: 'units', currency: 'EUR' });
    const trades = await store.getTrades({ accountId: a?.id });
    const units = trades.reduce((sum, t) => sum + (t.direction === 'buy' ? t.units : -t.units), 0);
    expect(units).toBe(250000000 + 112345700 - 50000000);
    expect(await holdingOf(ISIN_B)).toMatchObject({ name: 'Example ETF 2' });
    expect(done.written).toBeGreaterThan(0);
  });

  it('writes nothing the second time', async () => {
    const scenario = { transactions: [plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z'), plan('p2', ISIN_B, -90, 3, '2026-01-06T08:00:00.000Z')] };
    await runSync(scenario).result;
    const before = JSON.stringify([await store.getAccounts(), await store.getTrades()]);
    const second = await runSync(scenario).result;

    expect(second.written).toBe(0);
    expect(second.backupPath).toBeNull();
    expect(JSON.stringify([await store.getAccounts(), await store.getTrades()])).toBe(before);
  });

  it('keeps the name you gave a synced holding', async () => {
    const scenario = { transactions: [plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z')] };
    await runSync(scenario).result;
    const account = await holdingOf(ISIN_A);
    await store.updateAccount(account?.id ?? '', { name: 'My world fund' });
    await runSync(scenario).result;

    expect((await holdingOf(ISIN_A))?.name).toBe('My world fund');
  });

  it('never adopts a hand-made account, even one with the broker\'s name', async () => {
    const mine = await store.createAccount({ name: 'Example ETF 1', kind: 'investment', valuation: 'units' });
    await runSync({ transactions: [plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z')] }).result;

    expect(await store.getTrades({ accountId: mine.id })).toEqual([]);
    expect((await store.getAccounts()).filter((a) => a.name === 'Example ETF 1')).toHaveLength(2);
  });

  it('rounds the price half up to the cent for a savings plan, with fee 0', async () => {
    // 1.01 EUR for 2 units is 50.5 cents a unit: half up is 51.
    await runSync({ transactions: [plan('p1', ISIN_A, -1.01, 2, '2026-01-05T08:00:00.000Z')] }).result;
    const [trade] = await store.getTrades();
    expect(trade).toMatchObject({ price: 51, fee: 0, units: 200000000, direction: 'buy' });
  });

  it('takes a single order\'s fee and market price from its details, so units x price + fee is the amount', async () => {
    const { fake, result } = runSync({
      transactions: [singleBuy({ id: 'one', isin: ISIN_A, description: 'Example ETF', amount: -1000.99, quantity: 10, last_event_datetime: '2026-01-15T09:30:00.123Z' })],
      details: { one: singleDetails(1000, 0.99) },
    });
    await result;
    const [trade] = await store.getTrades();
    expect(trade).toMatchObject({ price: 10000, fee: 99, units: 1000000000 });
    expect(fake.calls.filter((c) => c[1] === 'transaction')).toHaveLength(1);
  });

  it('asks for details only for single orders', async () => {
    const { fake, result } = runSync({ transactions: [plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z')] });
    await result;
    expect(fake.calls.some((c) => c[1] === 'transaction')).toBe(false);
  });

  it('dates a trade by its day in the user timezone, not in UTC', async () => {
    await runSync({ transactions: [plan('p1', ISIN_A, -100, 1, '2026-12-31T23:30:00.000Z')] }).result;
    expect((await store.getTrades())[0]?.date).toBe('2027-01-01');
  });

  it('ignores a cancelled order and removes a trade the broker no longer reports', async () => {
    const kept = plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z');
    const gone = plan('p2', ISIN_A, -100, 1, '2026-02-05T08:00:00.000Z');
    await runSync({ transactions: [gone, kept] }).result;
    expect(await store.getTrades()).toHaveLength(2);

    const cancelled = singleBuy({ id: 'c1', isin: ISIN_A, description: 'x', amount: 0, quantity: 4, status: 'CANCELLED', last_event_datetime: '2026-03-05T08:00:00.000Z' });
    await runSync({ transactions: [cancelled, kept] }).result;
    expect((await store.getTrades()).map((t) => t.origin?.externalId)).toEqual(['p1']);
  });

  it('drops a security cancellation row together with the order it cancels', async () => {
    const order = plan('p1', ISIN_A, -100, 1, '2026-02-05T08:00:00.000Z');
    const cancel = plan('CANCEL-p1', ISIN_A, 100, 1, '2026-02-06T08:00:00.000Z', { is_cancellation: true, side: 'BUY' });
    const kept = plan('p2', ISIN_A, -50, 1, '2026-01-05T08:00:00.000Z');
    await runSync({ transactions: [cancel, order, kept] }).result;
    expect((await store.getTrades()).map((t) => t.origin?.externalId)).toEqual(['p2']);
  });
});

describe('the Scalable sync: what it leaves alone, out loud', () => {
  it('skips non-EUR rows, crypto with units and lists other kinds as warnings, writing none of them', async () => {
    const { result } = runSync({
      cryptoItems: [
        { kind: 'crypto', name: 'ExampleCoin', ticker: 'EXC', position: { filled: 0, pending: 0, sellable: 0 }, etp_positions: [] },
        { kind: 'crypto', name: 'OtherCoin', ticker: 'OTC', position: { filled: 2, pending: 0, sellable: 2 }, etp_positions: [] },
      ],
      transactions: [
        cashRow({ id: 'CASH_1', amount: 500, cash_transaction_type: 'DEPOSIT', last_event_datetime: '2026-01-01T10:00:00.000Z' }),
        plan('pending', ISIN_B, -100, 2, '2026-02-01T08:00:00.000Z', { status: 'PENDING' }),
        plan('usd', ISIN_B, -50, 1, '2026-01-07T08:00:00.000Z', { currency: 'USD' }),
        plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z'),
      ],
    });
    const done = await result;

    expect((await store.getAccounts()).map((a) => a.origin?.externalId)).toEqual([ISIN_A]);
    const text = done.warnings.join('\n');
    expect(text).toMatch(/OtherCoin/);
    expect(text).not.toMatch(/ExampleCoin/);
    expect(text).toMatch(/USD/);
    expect(text).toMatch(/cash/i);
    expect(text).toMatch(/not yet settled/i);
  });

  it('skips the holdings the broker reports in another currency', async () => {
    await runSync({
      holdings: [{ kind: 'security', isin: ISIN_B, name: 'Dollar fund', quantity: 1, quote_currency: 'USD', valuation_currency: 'USD' }],
      transactions: [plan('p1', ISIN_B, -50, 1, '2026-01-05T08:00:00.000Z')],
    }).result.then((done) => expect(done.warnings.join('\n')).toMatch(/USD/));
    expect(await holdingOf(ISIN_B)).toBeUndefined();
  });

  it('leaves a holding alone, with a warning, when a sell has nothing to draw on yet', async () => {
    // The units arrived by a transfer, which a later ticket maps.
    const sell = singleBuy({ id: 's1', isin: ISIN_A, description: 'Orphan', side: 'SELL', amount: 100, quantity: 1, last_event_datetime: '2026-02-05T08:00:00.000Z' });
    const { result } = runSync({
      transactions: [sell, plan('p9', ISIN_B, -50, 1, '2026-01-05T08:00:00.000Z')],
      details: { s1: singleDetails(100, 0) },
    });
    const done = await result;
    expect(await holdingOf(ISIN_A)).toBeUndefined();
    expect(await holdingOf(ISIN_B)).toBeDefined();
    expect(done.warnings.join('\n')).toMatch(/Orphan|XX0000000001/);
  });
});

describe('the Scalable sync: failing and refusing', () => {
  /** @param {import('./scalable-fake.js').Scenario} extra */
  const withTx = (extra) => ({ transactions: [plan('p1', ISIN_A, -200, 2.5, '2026-01-05T08:00:00.000Z')], ...extra });
  const snapshot = async () => JSON.stringify([await store.getAccounts(), await store.getTrades(), await store.getPrices(), await store.getObservations()]);

  it.each([20, 30, 1])('writes nothing and throws when sc exits %i', async (code) => {
    const before = await snapshot();
    const { result } = runSync(withTx({ onCall: (args) => { if (args[1] === 'transactions') throw new client.ScCommandError(code, 'boom'); } }));
    await expect(result).rejects.toThrow(/boom/);
    expect(await snapshot()).toBe(before);
  });

  it('writes nothing when sc answers with something that is not JSON from the runner', async () => {
    const before = await snapshot();
    await expect(sync.syncScalable({ run: async () => 'not json', store, dryRun: false })).rejects.toThrow(/sc/);
    await expect(sync.syncScalable({ run: async () => ({ ok: false, error: { code: 'x', message: 'refused' } }), store, dryRun: false })).rejects.toThrow(/refused/);
    expect(await snapshot()).toBe(before);
  });

  it('writes nothing when a details call fails after the transactions were read', async () => {
    const before = await snapshot();
    const { result } = runSync({
      transactions: [
        plan('p1', ISIN_B, -50, 1, '2026-01-05T08:00:00.000Z'),
        singleBuy({ id: 'one', isin: ISIN_A, description: 'x', amount: -101, quantity: 1, last_event_datetime: '2026-01-15T09:30:00.123Z' }),
      ],
      details: {},
    });
    await expect(result).rejects.toThrow();
    expect(await snapshot()).toBe(before);
  });

  it('refuses while the demo finance rows are present', async () => {
    await store.resetToSeed();
    const { fake, result } = runSync(withTx({}));
    await expect(result).rejects.toThrow(/demo finance/);
    expect(fake.calls).toEqual([]);
  });

  it('reports a dry run and writes nothing, not even a backup', async () => {
    const before = await snapshot();
    const { result } = runSync(withTx({}), { dryRun: true });
    const done = await result;

    expect(await snapshot()).toBe(before);
    expect(done.backupPath).toBeNull();
    expect(done.report.join('\n')).toMatch(/XX0000000001/);
    expect(done.report.join('\n')).toMatch(/create/i);
  });

  it('takes a backup before the first run that creates an account, and says where', async () => {
    const first = await runSync(withTx({})).result;
    expect(first.backupPath).toEqual(expect.stringContaining('scalable-sync'));
    const again = await runSync(withTx({})).result;
    expect(again.backupPath).toBeNull();
  });
});
