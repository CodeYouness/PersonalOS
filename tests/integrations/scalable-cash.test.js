/**
 * The Scalable sync's cash part (ticket #217, ADR 0031), driven through
 * `syncScalable` with the fake `sc` and the real store on a throwaway
 * DATA_DIR. Every value is invented.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { cashRow, fakeSc } from './scalable-fake.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/integrations/scalable/sync.js')} */
let sync;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-scalable-cash-'));
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
  vi.setSystemTime(new Date('2026-05-04T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** @param {import('./scalable-fake.js').Scenario} scenario @param {{ dryRun?: boolean }} [options] */
const runSync = (scenario, options = {}) => sync.syncScalable({ run: fakeSc(scenario).run, store, dryRun: options.dryRun ?? false });

const cashAccount = async () => (await store.getAccounts()).find((a) => a.origin?.source === 'scalable' && a.kind === 'cash');

describe('the Scalable cash balance', () => {
  it('creates "Scalable cash" keyed by the portfolio id and records today\'s balance', async () => {
    await runSync({ cashBalance: 123.45 });

    const account = await cashAccount();
    expect(account).toMatchObject({ name: 'Scalable cash', kind: 'cash', valuation: 'balance', currency: 'EUR', origin: { source: 'scalable', externalId: 'pf-0001' } });
    expect(await store.getObservations({ accountId: account?.id })).toEqual([
      expect.objectContaining({ kind: 'balance', amount: 12345, date: '2026-05-04', currency: 'EUR' }),
    ]);
  });

  it('records no second balance on a second run the same day, and writes nothing', async () => {
    await runSync({ cashBalance: 123.45 });
    const again = await runSync({ cashBalance: 123.45 });

    expect(again.written).toBe(0);
    expect(await store.getObservations({ accountId: (await cashAccount())?.id })).toHaveLength(1);
    expect((await store.getAccounts()).filter((a) => a.kind === 'cash' && a.origin !== null)).toHaveLength(1);
  });

  it('corrects the day\'s balance in place when the broker\'s figure moved', async () => {
    await runSync({ cashBalance: 123.45 });
    await runSync({ cashBalance: 100.1 });
    expect(await store.getObservations({ accountId: (await cashAccount())?.id })).toEqual([expect.objectContaining({ amount: 10010 })]);
  });

  it('records a later day\'s balance and keeps the history', async () => {
    await runSync({ cashBalance: 123.45 });
    vi.setSystemTime(new Date('2026-05-05T10:00:00Z'));
    await runSync({ cashBalance: 200 });

    const account = await cashAccount();
    const rows = await store.getObservations({ accountId: account?.id });
    expect(rows.map((r) => [r.date, r.amount]).sort()).toEqual([['2026-05-04', 12345], ['2026-05-05', 20000]]);
  });

  it('records a balance of 0 as 0, never skipped', async () => {
    await runSync({ cashBalance: 0 });
    expect(await store.getObservations({ accountId: (await cashAccount())?.id })).toEqual([expect.objectContaining({ amount: 0 })]);
  });

  it('rounds the euro figure to the cent without float drift', async () => {
    await runSync({ cashBalance: 0.29 });
    expect(await store.getObservations({ accountId: (await cashAccount())?.id })).toEqual([expect.objectContaining({ amount: 29 })]);
  });

  it('writes nothing on a dry run and says what it would do', async () => {
    const result = await runSync({ cashBalance: 123.45 }, { dryRun: true });
    expect(await cashAccount()).toBeUndefined();
    expect(result.report.join('\n')).toMatch(/Scalable cash/);
  });

  it('takes a backup before creating the account', async () => {
    const result = await runSync({ cashBalance: 5 });
    expect(result.backupPath).not.toBeNull();
  });

  it('refuses a hand-typed balance on the synced account afterwards', async () => {
    await runSync({ cashBalance: 5 });
    const account = await cashAccount();
    await expect(store.recordObservation({ accountId: account?.id, amount: 1, date: '2026-05-04' })).rejects.toThrow(/scalable/);
  });

  it('does not adopt a hand-made account of the same name', async () => {
    const hand = await store.createAccount({ name: 'Scalable cash', kind: 'cash' });
    await runSync({ cashBalance: 5 });
    expect(await store.getObservations({ accountId: hand.id })).toEqual([]);
    expect(await cashAccount()).toBeDefined();
  });

  it('fails the run, writing nothing, when the breakdown is not a number', async () => {
    const fake = fakeSc({ cashBalance: 5 });
    const run = async (/** @type {string[]} */ args) => {
      const out = /** @type {any} */ (await fake.run(args));
      if (args[1] === 'cash-breakdown') out.data.result.cash_balance = null;
      return out;
    };
    await expect(sync.syncScalable({ run, store })).rejects.toThrow(/cash/);
    expect(await cashAccount()).toBeUndefined();
  });

  it('still leaves cash movements alone, with a warning', async () => {
    const result = await runSync({ cashBalance: 5, transactions: [cashRow({ id: 'CASH_1', cash_transaction_type: 'DEPOSIT', amount: 50, description: 'Deposit', last_event_datetime: '2026-05-01T08:00:00.000Z' })] });
    expect(result.warnings.join('\n')).toMatch(/cash/i);
    expect(await store.getTransactions({})).toEqual([]);
  });
});
