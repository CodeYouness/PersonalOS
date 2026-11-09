/**
 * The DEGIRO import (ticket #219, ADR 0031): an invented export, the fake
 * `sc` and a sandbox store. The seam is the importer's entry point.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fakeSc, nonTrade } from '../integrations/scalable-fake.js';
import { ALPHA, DELISTED, FREEBIE, NEW_FUND, OLD_FUND, US_STOCK, continuation, csv, history, row } from './degiro-fixture.js';

/** @type {string} */
let sandbox;
/** @type {string} */
let files;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/scripts/import-degiro.js')} */
let script;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-degiro-'));
  files = await mkdtemp(path.join(tmpdir(), 'personalos-degiro-files-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  script = await import('@/scripts/import-degiro.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
  await rm(files, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  await store.getProfile();
  await store.removeDemoFinance();
});

/** Scalable's side: ALPHA arrived by a transfer of 15 units worth 1720 on 22 May. */
function scalable() {
  return fakeSc({
    transactions: [
      nonTrade({
        id: 'NON_TRADE_TRANSFER_IN_1', isin: ALPHA, description: 'Alpha', amount: 1720, quantity: 15,
        non_trade_security_transaction_type: 'TRANSFER_IN', last_event_datetime: '2024-05-22T00:00:00.000Z',
      }),
    ],
    charts: {
      [ALPHA]: { point_count: 2, data_points: [{ mid_price: 110, timestamp_utc: '2024-01-31T20:00:00.000Z' }, { mid_price: 115, timestamp_utc: '2024-05-31T20:00:00.000Z' }] },
      [US_STOCK]: { point_count: 1, data_points: [{ mid_price: 150, timestamp_utc: '2024-01-31T20:00:00.000Z' }] },
      [OLD_FUND]: { point_count: 1, data_points: [{ mid_price: 40, timestamp_utc: '2024-01-31T20:00:00.000Z' }] },
      [NEW_FUND]: { point_count: 1, data_points: [{ mid_price: 45, timestamp_utc: '2024-05-31T20:00:00.000Z' }] },
      [DELISTED]: { point_count: 2, data_points: [{ mid_price: 2, timestamp_utc: '2024-01-31T20:00:00.000Z' }, { mid_price: 1.5, timestamp_utc: '2024-08-30T20:00:00.000Z' }] },
      [FREEBIE]: { point_count: 1, data_points: [{ mid_price: 1, timestamp_utc: '2024-01-31T20:00:00.000Z' }] },
    },
  });
}

async function syncedOk() {
  await store.updateSyncState('scalable', { lastRunAt: '2026-11-09T10:00:00.000Z', status: 'ok', error: '', itemCount: 1 });
}

/** @param {string} text */
async function csvFile(text) {
  const file = path.join(files, 'export.csv');
  await writeFile(file, text);
  return file;
}

/**
 * @param {string} text
 * @param {{ write?: boolean, sc?: ReturnType<typeof fakeSc> }} [options]
 */
async function runImport(text, { write = false, sc = scalable() } = {}) {
  /** @type {string[]} */
  const printed = [];
  const result = await script.importDegiro({ csvPath: await csvFile(text), write, run: sc.run, print: (line) => printed.push(line) });
  return { ...result, printed, text: printed.join('\n') };
}

/** @param {string} isin */
async function holding(isin) {
  const accounts = await store.getAccounts();
  const account = accounts.find((a) => a.origin?.source === 'degiro' && a.origin.externalId === isin);
  if (account === undefined) return null;
  const trades = await store.getTrades({ accountId: account.id });
  const prices = await store.getPrices({ accountId: account.id });
  /** @param {string} day */
  const unitsOn = (day) => trades.filter((t) => t.date <= day).reduce((sum, t) => sum + (t.direction === 'buy' ? t.units : -t.units), 0) / 1e8;
  return { account, trades, prices, unitsOn };
}

/** @param {string} isin */
async function mustHold(isin) {
  const found = await holding(isin);
  if (found === null) throw new Error('no holding for ' + isin);
  return found;
}

describe('the dry run', () => {
  it('reports holdings, trades, skipped bookkeeping rows and warnings, and writes nothing', async () => {
    await syncedOk();
    const before = await readFile(path.join(sandbox, 'personalos.json'), 'utf8');
    const result = await runImport(history());
    expect(result.blocking).toEqual([]);
    expect(result.plan.holdings).toHaveLength(5);
    expect(result.text).toMatch(/dry run/i);
    expect(result.text).toMatch(/skipped/i);
    expect(result.text).toMatch(/warning/i);
    expect(await readFile(path.join(sandbox, 'personalos.json'), 'utf8')).toBe(before);
    expect(await holding(ALPHA)).toBeNull();
  });
});

describe('the write', () => {
  it('creates one holding per ISIN, with origin and read-only trades, and a second write changes nothing', async () => {
    await syncedOk();
    const first = await runImport(history(), { write: true });
    expect(first.backupPath).toEqual(expect.stringContaining('.backup'));
    const alpha = await mustHold(ALPHA);
    expect(alpha.account.kind).toBe('investment');
    expect(alpha.account.valuation).toBe('units');
    expect(alpha.account.origin?.source).toBe('degiro');

    const snapshot = JSON.stringify([await store.getAccounts(), await store.getTrades(), await store.getPrices()]);
    const second = await runImport(history(), { write: true });
    expect(second.backupPath).toBeUndefined();
    expect(JSON.stringify([await store.getAccounts(), await store.getTrades(), await store.getPrices()])).toBe(snapshot);
  });

  it('parses Italian dates and decimal commas, joins a continuation row, and prices from the EUR value', async () => {
    await syncedOk();
    await runImport(history(), { write: true });
    const us = await mustHold(US_STOCK);
    expect(us.account.name).toBe('Invented Wrapped Product Name');
    const buy = us.trades.find((t) => t.direction === 'buy');
    // 300,00 EUR over 2 units, not the 330 USD; fee is |AutoFX| + |costs|
    expect(buy).toMatchObject({ date: '2024-01-20', units: 2 * 1e8, price: 15000, fee: 130, origin: { source: 'degiro', externalId: 'ord-0003' } });
    expect(us.unitsOn('2024-01-31')).toBe(2);
    expect(us.unitsOn('2024-02-01')).toBe(0);
  });

  it('skips zero-value rows that net to zero, on a day or across the holding', async () => {
    await syncedOk();
    const result = await runImport(history(), { write: true });
    expect((await mustHold(ALPHA)).trades.map((t) => t.origin?.externalId)).not.toContain('ord-0100');
    expect(await holding(FREEBIE)).toBeNull();
    expect(result.plan.skipped.length).toBeGreaterThanOrEqual(4);
  });

  it('blocks the write on a zero-value row that nets to nothing', async () => {
    await syncedOk();
    const text = csv([
      row({ date: '10-03-2024', isin: ALPHA, qty: '3', value: '0,00', id: 'ord-9' }),
      row({ date: '15-01-2024', isin: ALPHA, qty: '10', value: '-1000,00', id: 'ord-1' }),
    ]);
    const dry = await runImport(text);
    expect(dry.blocking).toHaveLength(1);
    await expect(runImport(text, { write: true })).rejects.toThrow(/zero/i);
    expect(await holding(ALPHA)).toBeNull();
  });

  it('leaves the holding unchanged on a change of exchange', async () => {
    await syncedOk();
    await runImport(history(), { write: true });
    const old = await mustHold(OLD_FUND);
    expect(old.unitsOn('2024-04-01')).toBe(20);
    expect(old.unitsOn('2024-04-02')).toBe(20);
    expect(old.trades).toHaveLength(2);
  });

  it('moves the units from the old fund to the new one on the merger day, at the reported values', async () => {
    await syncedOk();
    await runImport(history(), { write: true });
    const old = await mustHold(OLD_FUND);
    const next = await mustHold(NEW_FUND);
    expect(old.unitsOn('2024-06-02')).toBe(20);
    expect(old.unitsOn('2024-06-03')).toBe(0);
    expect(next.unitsOn('2024-06-02')).toBe(0);
    expect(next.unitsOn('2024-06-03')).toBe(20);
    expect(next.trades.find((t) => t.date === '2024-06-03')?.price).toBe(4500);
    expect(old.account.archivedOn).toBe('2024-06-03');
  });

  it('closes a position DEGIRO zeroed at the last chart price, with a warning', async () => {
    await syncedOk();
    const result = await runImport(history(), { write: true });
    const delisted = await mustHold(DELISTED);
    const close = delisted.trades.find((t) => t.direction === 'sell');
    expect(close).toMatchObject({ date: '2024-09-02', price: 150 });
    expect(delisted.account.archivedOn).toBe('2024-09-02');
    expect(result.plan.warnings.join('\n')).toMatch(/delist|zero value/i);
  });

  it('hands over to Scalable: the sell takes Scalable arrival day and value', async () => {
    await syncedOk();
    await runImport(history(), { write: true });
    const alpha = await mustHold(ALPHA);
    expect(alpha.unitsOn('2024-05-21')).toBe(15);
    expect(alpha.unitsOn('2024-05-22')).toBe(0);
    // 1720,00 over 15 units, half up to the cent
    expect(alpha.trades.find((t) => t.direction === 'sell')).toMatchObject({ date: '2024-05-22', price: 11467, fee: 0 });
    expect(alpha.account.archivedOn).toBe('2024-05-22');
  });

  it('refuses without a Scalable sync, and writes nothing', async () => {
    await expect(runImport(history(), { write: true })).rejects.toThrow(/scalable/i);
    expect(await holding(ALPHA)).toBeNull();
    const dry = await runImport(history());
    expect(dry.blocking.join('\n')).toMatch(/scalable/i);
  });

  it('prices every month-end from the first trade to the last day, and none after', async () => {
    await syncedOk();
    await runImport(history(), { write: true });
    const alpha = await mustHold(ALPHA);
    const dates = alpha.prices.map((p) => p.date).sort();
    expect(dates[0]).toBe('2024-01-31');
    expect(dates.at(-1)).toBe('2024-04-30');
    expect(dates).toHaveLength(4);
    const delisted = await mustHold(DELISTED);
    expect(delisted.prices.map((p) => p.date).sort().at(-1)).toBe('2024-08-31');
  });

  it('refuses to correct a trade or a price on a DEGIRO holding at the store', async () => {
    await syncedOk();
    await runImport(history(), { write: true });
    const alpha = await mustHold(ALPHA);
    await expect(store.updateTrade(alpha.trades[0].id, { units: 1 })).rejects.toThrow();
    await expect(store.deleteTrade(alpha.trades[0].id)).rejects.toThrow();
    await expect(store.deletePrice(alpha.prices[0].id)).rejects.toThrow();
    await expect(store.recordPrice({ accountId: alpha.account.id, date: '2024-02-01', price: 100 })).rejects.toThrow();
  });

  it('refuses while the demo finance rows are present', async () => {
    await syncedOk();
    await store.resetToSeed();
    await store.getProfile();
    await expect(runImport(history(), { write: true })).rejects.toThrow(/demo/i);
  });
});

describe('the parser', () => {
  it('refuses an export without the expected headers', async () => {
    await expect(runImport('Date,Product\n01-01-2024,x\n')).rejects.toThrow(/header/i);
  });

  it('reports an unreadable row and blocks', async () => {
    await syncedOk();
    const result = await runImport(csv([row({ date: '31-02-2024', isin: ALPHA, qty: '1', value: '-10,00', id: 'x' }), continuation('stray')]));
    expect(result.blocking.length).toBeGreaterThan(0);
  });

  it('gives a row without an order id a stable id, so a re-run changes nothing', async () => {
    await syncedOk();
    const text = csv([
      row({ date: '20-05-2024', isin: OLD_FUND, qty: '-4', value: '200,00' }),
      row({ date: '15-01-2024', isin: OLD_FUND, qty: '4', value: '-180,00', id: 'o1' }),
    ]);
    await runImport(text, { write: true });
    const first = (await mustHold(OLD_FUND)).trades.map((t) => t.origin?.externalId).sort();
    await runImport(text, { write: true });
    expect((await mustHold(OLD_FUND)).trades.map((t) => t.origin?.externalId).sort()).toEqual(first);
    expect(first.some((id) => id?.startsWith('row-'))).toBe(true);
  });
});
