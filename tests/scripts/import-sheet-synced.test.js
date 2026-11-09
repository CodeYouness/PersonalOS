/**
 * The sheet import next to the broker sync (#218): a ticker mapped to a
 * synced account imports no trade, and its purchases become transfers to
 * that account, matched against the synced trades. The workbook is invented,
 * the data is a sandbox.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { mapping, writeSheet } from './sheet-fixture.js';

const ISIN = 'IE00INVENTED1';

/** @type {string} */
let sandbox;
/** @type {string} */
let files;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/scripts/import-sheet.js')} */
let script;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-import-synced-'));
  files = await mkdtemp(path.join(tmpdir(), 'personalos-import-synced-files-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  script = await import('@/scripts/import-sheet.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
  await rm(files, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  await store.getProfile();
});

/** The fixture's mapping with its holding pointed at a synced account. */
function syncedMapping() {
  const base = mapping();
  return { ...base, accounts: { ...base.accounts, Broker: { origin: { source: 'scalable', externalId: ISIN } } } };
}

/**
 * The synced holding as the sync leaves it: an account with an origin and
 * its synced trades.
 *
 * @param {{ externalId: string, date: string, units: number, price: number }[]} trades
 */
async function syncedHolding(trades) {
  const account = await store.createAccount({
    name: 'Broker name',
    kind: 'investment',
    valuation: 'units',
    source: 'integration',
    origin: { source: 'scalable', externalId: ISIN, syncedAt: '2024-02-01T00:00:00.000Z', sourceUpdatedAt: null },
  });
  await store.replaceSyncedTrades({
    accountId: account.id,
    source: 'scalable',
    trades: trades.map((t) => ({ ...t, direction: 'buy', fee: 0, currency: 'EUR' })),
  });
  return account;
}

/** @param {unknown} theMapping */
async function dryRun(theMapping) {
  const paths = await writeSheet(files, { mapping: theMapping });
  /** @type {string[]} */
  const printed = [];
  const result = await script.importSheet({ ...paths, print: (line) => printed.push(line) });
  return { ...result, printed: printed.join('\n') };
}

const MATCHING = { externalId: 'tx-1', date: '2024-01-16', units: 250_000_000, price: 10000 };

describe('a holding the broker sync owns', () => {
  it('imports no trade for the ticker and lists the rows it left to the sync', async () => {
    await syncedHolding([MATCHING]);

    const { plan, blocking, printed } = await dryRun(syncedMapping());

    expect(blocking).toEqual([]);
    expect(plan.trades).toEqual([]);
    expect(plan.report.syncedTrades.map((t) => t.ticker)).toEqual(['WRLD', 'WRLD']);
    expect(printed).toMatch(/Trades left to the broker sync/);
    expect(plan.accounts).not.toContain('Broker');
  });

  it('files the purchase as a transfer to the synced account, matched to its synced trade', async () => {
    await syncedHolding([MATCHING]);

    const { plan } = await dryRun(syncedMapping());

    expect(plan.transactions.find((t) => t.rule === 'investment')).toMatchObject({ account: 'Conto', counter: 'Broker', amount: -25000 });
  });

  it('blocks the write on a purchase that matches no synced trade', async () => {
    await syncedHolding([{ ...MATCHING, date: '2024-03-01' }]);

    const { blocking, printed } = await dryRun(syncedMapping());

    expect(blocking).toEqual(['the purchase on line 9 matches 0 trades']);
    expect(printed).toMatch(/0 matching trades/);
  });

  it('blocks the write on a purchase that matches two synced trades', async () => {
    await syncedHolding([MATCHING, { ...MATCHING, externalId: 'tx-2', date: '2024-01-17' }]);

    const { blocking } = await dryRun(syncedMapping());

    expect(blocking).toEqual(['the purchase on line 9 matches 2 trades']);
  });

  it('blocks the write while the synced account does not exist yet, and says to run the sync', async () => {
    const { blocking } = await dryRun(syncedMapping());

    expect(blocking.join(' ')).toMatch(/sync:scalable/);
  });

  it('writes the transfer to the synced account and creates neither a trade nor a second account', async () => {
    await store.removeDemoFinance();
    const account = await syncedHolding([MATCHING]);
    const paths = await writeSheet(files, { mapping: syncedMapping() });

    await script.importSheet({ ...paths, write: true, print: () => {} });

    const purchase = (await store.getTransactions()).find((t) => t.counterAccountId === account.id);
    expect(purchase).toMatchObject({ amount: -25000 });
    expect((await store.getTrades({ accountId: account.id })).map((t) => t.origin?.source)).toEqual(['scalable']);
    expect((await store.getAccounts()).filter((a) => a.valuation === 'units')).toHaveLength(1);
  });

  it('refuses the write, changing nothing, while the synced account is missing', async () => {
    await store.removeDemoFinance();
    const paths = await writeSheet(files, { mapping: syncedMapping() });

    await expect(script.importSheet({ ...paths, write: true, print: () => {} })).rejects.toThrow(/sync:scalable/);
    expect(await store.getTransactions()).toEqual([]);
  });

  it('refuses a synced account whose source is not the broker sync', async () => {
    const bad = syncedMapping();
    bad.accounts.Broker = { origin: { source: 'sheet', externalId: ISIN } };

    await expect(dryRun(bad)).rejects.toThrow(/origin\.source must be "scalable"/);
  });
});
