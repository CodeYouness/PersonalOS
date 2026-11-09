/**
 * Mergers, transfers, cancellations, removal and archiving in the Scalable
 * sync (ticket #220, ADR 0031), through `syncScalable` with a fake `sc` and
 * the real store. Every payload is invented.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fakeSc, nonTrade, savingsPlanBuy } from './scalable-fake.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/integrations/scalable/sync.js')} */
let sync;

const OLD = 'XX0000000001';
const NEW = 'XX0000000002';

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-scalable-movements-'));
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
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

/** @param {string} id @param {string} isin @param {number} amount @param {number} quantity @param {string} at */
const buy = (id, isin, amount, quantity, at) =>
  savingsPlanBuy({ id, isin, description: 'Example ETF ' + isin.slice(-1), amount, quantity, last_event_datetime: at });

/** @param {string} id @param {string} kind @param {string} isin @param {number} amount @param {number} quantity @param {string} at @param {Record<string, unknown>} [extra] */
const move = (id, kind, isin, amount, quantity, at, extra = {}) =>
  nonTrade({
    id, isin, description: 'Example ETF ' + isin.slice(-1), amount, quantity, last_event_datetime: at,
    non_trade_security_transaction_type: kind, ...extra,
  });

/** @param {import('./scalable-fake.js').Scenario} scenario @param {boolean} [dryRun] */
const runSync = (scenario, dryRun = false) => sync.syncScalable({ run: fakeSc(scenario).run, store, dryRun });

/** @param {string} isin */
const holdingOf = async (isin) => (await store.getAccounts()).find((a) => a.origin?.source === 'scalable' && a.origin.externalId === isin);

/** @param {string} isin */
const tradesOf = async (isin) =>
  (await store.getTrades({ accountId: (await holdingOf(isin))?.id })).sort((a, b) => a.date.localeCompare(b.date));

const mergerRows = [
  move('NON_TRADE_SWAP_IN_1', 'SWAP_IN', NEW, 1200, 6, '2026-05-04T08:00:00.000Z'),
  move('NON_TRADE_SWAP_OUT_1', 'SWAP_OUT', OLD, -1200, 10, '2026-05-04T08:00:00.000Z'),
  buy('p1', OLD, -1000, 10, '2026-01-05T08:00:00.000Z'),
];

describe('the Scalable sync: mergers and transfers', () => {
  it('moves a merger\'s units from the old holding to the new one on its day and archives the old one that day', async () => {
    await runSync({ transactions: mergerRows });

    const old = await holdingOf(OLD);
    expect(old?.archivedOn).toBe('2026-05-04');
    expect(await tradesOf(OLD)).toEqual([
      expect.objectContaining({ direction: 'buy', units: 10e8 }),
      expect.objectContaining({ direction: 'sell', units: 10e8, price: 12000, fee: 0, date: '2026-05-04' }),
    ]);
    expect(await tradesOf(NEW)).toEqual([expect.objectContaining({ direction: 'buy', units: 6e8, price: 20000, fee: 0, date: '2026-05-04' })]);
    expect((await holdingOf(NEW))?.archivedOn).toBeNull();
  });

  it('turns a transfer in into a buy and a transfer out into a sell, at the reported value', async () => {
    await runSync({
      transactions: [
        move('NON_TRADE_TRANSFER_OUT_1', 'TRANSFER_OUT', OLD, -500, 4, '2026-03-02T00:00:00.000Z'),
        move('NON_TRADE_TRANSFER_IN_1', 'TRANSFER_IN', OLD, 1500, 15, '2026-02-25T00:00:00.000Z'),
      ],
    });
    expect(await tradesOf(OLD)).toEqual([
      expect.objectContaining({ direction: 'buy', units: 15e8, price: 10000, date: '2026-02-25' }),
      expect.objectContaining({ direction: 'sell', units: 4e8, price: 12500, date: '2026-03-02' }),
    ]);
    expect((await holdingOf(OLD))?.archivedOn).toBeNull();
  });

  it('writes nothing for a cancellation pair', async () => {
    const result = await runSync({
      transactions: [
        move('C1', 'TRANSFER_IN', OLD, -1500, 15, '2026-02-26T00:00:00.000Z', { is_cancellation: true }),
        move('NON_TRADE_TRANSFER_IN_1', 'TRANSFER_IN', OLD, 1500, 15, '2026-02-25T00:00:00.000Z'),
      ],
    });
    expect(await holdingOf(OLD)).toBeUndefined();
    // the cash part's own account and balance are the only writes
    expect(result.written).toBe(2);
    expect((await store.getTrades()).length).toBe(0);
  });

  it('removes a trade the broker no longer reports, and warns', async () => {
    const rows = [
      move('NON_TRADE_TRANSFER_OUT_1', 'TRANSFER_OUT', OLD, -500, 4, '2026-03-02T00:00:00.000Z'),
      move('NON_TRADE_TRANSFER_IN_1', 'TRANSFER_IN', OLD, 1500, 15, '2026-02-25T00:00:00.000Z'),
    ];
    await runSync({ transactions: rows });
    const again = await runSync({ transactions: [{ ...rows[0], status: 'CANCELLED', amount: 0 }, rows[1]] });

    expect(await tradesOf(OLD)).toHaveLength(1);
    expect(again.warnings.join('\n')).toMatch(/no longer reported.*removed/);
  });

  it('restores a holding that gets units again', async () => {
    await runSync({ transactions: mergerRows });
    expect((await holdingOf(OLD))?.archivedOn).toBe('2026-05-04');

    await runSync({ transactions: [buy('p2', OLD, -500, 5, '2026-06-01T08:00:00.000Z'), ...mergerRows] });
    expect((await holdingOf(OLD))?.archivedOn).toBeNull();
  });

  it('still sets aside a holding that would go below zero, judged after all of the run\'s trades', async () => {
    const out = await runSync({ transactions: [move('NON_TRADE_TRANSFER_OUT_1', 'TRANSFER_OUT', OLD, -500, 4, '2026-03-02T00:00:00.000Z')] });
    expect(out.warnings.join('\n')).toMatch(/below zero/);
    expect(await holdingOf(OLD)).toBeUndefined();
  });

  it('changes nothing on a second run', async () => {
    await runSync({ transactions: mergerRows });
    const accounts = await store.getAccounts();
    const trades = await store.getTrades();
    const again = await runSync({ transactions: mergerRows });
    expect(again.written).toBe(0);
    expect(await store.getAccounts()).toEqual(accounts);
    expect(await store.getTrades()).toEqual(trades);
  });

  it('writes nothing on a dry run and says what it would archive', async () => {
    const result = await runSync({ transactions: mergerRows }, true);
    expect(await holdingOf(OLD)).toBeUndefined();
    expect(result.report.join('\n')).toMatch(/archive.*2026-05-04/);
  });

  it('writes nothing and throws on a movement with no usable amount', async () => {
    const rows = [buy('p1', OLD, -1000, 10, '2026-01-05T08:00:00.000Z'), { ...move('NON_TRADE_SWAP_OUT_1', 'SWAP_OUT', OLD, -1200, 10, '2026-05-04T08:00:00.000Z'), amount: undefined }];
    await expect(runSync({ transactions: rows })).rejects.toThrow(/amount/);
    expect((await store.getAccounts()).filter((a) => a.origin !== null)).toEqual([]);
  });
});
