/**
 * `npm run data:import-sheet` (#139): the dry run. The script's entry point
 * runs against a spreadsheet the test builds from made-up rows, and a
 * sandboxed DATA_DIR that it must leave exactly as it found it.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MOVEMENTS, mapping, TRADES, writeSheet } from './sheet-fixture.js';

/** @type {string} */
let sandbox;
/** @type {string} */
let files;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/scripts/import-sheet.js')} */
let script;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-import-sheet-'));
  files = await mkdtemp(path.join(tmpdir(), 'personalos-import-sheet-files-'));
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

/** @param {Parameters<typeof writeSheet>[1]} [options] */
async function dryRun(options) {
  const paths = await writeSheet(files, options);
  /** @type {string[]} */
  const printed = [];
  const result = await script.importSheet({ ...paths, print: (line) => printed.push(line) });
  return { ...result, printed: printed.join('\n') };
}

describe('the dry run', () => {
  it('leaves the data file byte for byte as it was', async () => {
    const dataFile = path.join(sandbox, 'personalos.json');
    const before = await readFile(dataFile);

    await dryRun();

    expect((await readFile(dataFile)).equals(before)).toBe(true);
  });

  it('plans every row by the rules, stopping at the first row with no date', async () => {
    const { plan, blocking } = await dryRun();

    expect(blocking).toEqual([]);
    expect(plan.transactions.map((t) => [t.rule, t.account, t.counter, t.amount, t.category, t.notCounted])).toEqual([
      ['flow', 'Conto', null, 250000, 'Work/Salary', false],
      ['flow', 'Conto', null, -80000, 'Home/Rent', false],
      ['flow', 'Carta', null, -1840, 'Food/Groceries', false],
      ['transfer', 'Conto', 'Risparmi', -30000, null, false],
      ['investment', 'Conto', 'Broker', -25000, null, false],
      ['refund', 'Carta', null, 3000, 'Shopping', false],
      ['not counted', 'Conto', null, 5000, 'Gifts', true],
    ]);
  });

  it('sums the opening balances of an account and dates them the day before its first movement', async () => {
    const { plan } = await dryRun();

    expect(plan.balances.map(({ account, date, amount }) => ({ account, date, amount }))).toEqual([
      { account: 'Conto', date: '2024-01-02', amount: 100000 },
      { account: 'Risparmi', date: '2024-01-27', amount: 500000 },
    ]);
  });

  it('carries the note as the description, the subcategory when there is none, and the tags after their renames', async () => {
    const { plan } = await dryRun();
    const groceries = plan.transactions.find((t) => t.category === 'Food/Groceries');
    const rent = plan.transactions.find((t) => t.category === 'Home/Rent');

    expect(groceries).toMatchObject({ description: 'Supermarket', tags: ['weekends'], externalId: '2024-01-05T12:30:00.000Z' });
    expect(rent?.description).toBe('Affitto');
  });

  it('converts trades to integer units, cents and fees, and keeps the ones before tracking began', async () => {
    const { plan } = await dryRun();

    expect(plan.trades).toEqual([
      expect.objectContaining({ account: 'Broker', date: '2024-01-16', direction: 'buy', units: 250_000_000, price: 10000, fee: 0 }),
      expect.objectContaining({ account: 'Broker', date: '2023-06-01', direction: 'buy', units: 100_000_000, price: 9000, fee: 150 }),
    ]);
    // The first movement, not the opening balances dated before it.
    expect(plan.trackedSince).toBe('2024-01-03');
  });

  it('prints the counts, the totals per category, every refund and every skipped row', async () => {
    const { printed } = await dryRun();

    expect(printed).toContain('dry run: nothing was written');
    expect(printed).toMatch(/accounts\s+5/);
    expect(printed).toMatch(/balances\s+2/);
    expect(printed).toMatch(/transactions\s+5 \(flows 3, refunds 1, not counted 1\)/);
    expect(printed).toMatch(/transfers\s+2 \(investment purchases 1\)/);
    expect(printed).toMatch(/trades\s+2/);
    expect(printed).toMatch(/Home\/Rent\s+-800\.00/);
    expect(printed).toMatch(/line \d+\s+2024-01-20\s+30\.00\s+Shoes back\s+-> Shopping/);
    expect(printed).toMatch(/zero amount/);
    expect(printed).toMatch(/no account/);
    expect(printed).toContain('Nothing blocks the import.');
  });

  it('reports unmapped pairs and accounts, and a purchase with no matching trade, as blocking', async () => {
    const { blocking, printed } = await dryRun({
      movements: [
        ...MOVEMENTS,
        { at: '2024-01-12T10:00:00.000Z', date: '2024-01-12', category: 'Svago', subcategory: 'Cinema', amount: 9.99, from: 'Carta' },
        { at: '2024-01-13T10:00:00.000Z', date: '2024-01-13', category: 'Cibo', subcategory: 'Spesa', amount: 5, from: 'Portafoglio' },
        { at: '2024-01-14T10:00:00.000Z', date: '2024-01-14', category: 'Investimenti', subcategory: 'ETF', amount: 777, from: 'Conto' },
      ],
    });

    expect(blocking).toHaveLength(3);
    expect(printed).toMatch(/Unmapped category pairs:\n\s+"Svago\|Cinema"/);
    expect(printed).toMatch(/Unmapped accounts:\n\s+"Portafoglio"/);
    expect(printed).toMatch(/2024-01-14\s+777\.00\s+0 matching trades/);
    expect(printed).toContain('refused until these are resolved: 3');
  });

  it('resolves a purchase and a refund by a per-row override', async () => {
    const overrides = mapping();
    overrides.rows = {
      '2024-01-14T10:00:00.000Z': { holding: 'WRLD' },
      '2024-01-20T10:00:00.000Z': { category: 'Food/Groceries' },
    };
    const { plan, blocking } = await dryRun({
      mapping: overrides,
      movements: [...MOVEMENTS, { at: '2024-01-14T10:00:00.000Z', date: '2024-01-14', category: 'Investimenti', subcategory: 'ETF', amount: 777, from: 'Conto' }],
    });

    expect(blocking).toEqual([]);
    expect(plan.transactions.find((t) => t.date === '2024-01-14')).toMatchObject({ rule: 'investment', counter: 'Broker' });
    expect(plan.transactions.find((t) => t.rule === 'refund')?.category).toBe('Food/Groceries');
  });

  it('reports an amount, a quantity or a price that is not a number, and refuses the write for a trade', async () => {
    const { plan, blocking, printed } = await dryRun({
      movements: [...MOVEMENTS, { at: '2024-01-12T10:00:00.000Z', date: '2024-01-12', category: 'Cibo', subcategory: 'Spesa', amount: /** @type {any} */ ('12,50'), from: 'Carta' }],
      trades: [...TRADES, { date: '2024-02-02', ticker: 'WRLD', quantity: /** @type {any} */ ('two'), price: 10, fee: /** @type {any} */ (null) }],
    });

    expect(printed).toMatch(/line \d+\s+Importo is not a number/);
    expect(plan.trades).toHaveLength(2);
    expect(blocking).toEqual([expect.stringMatching(/trade on line \d+ has a Quantità that is not a number/)]);
  });

  it('reads a trade with no fee as one that cost nothing', async () => {
    const { plan } = await dryRun({ trades: [{ date: '2024-01-16', ticker: 'WRLD', quantity: 2.5, price: 100, fee: /** @type {any} */ (null) }] });

    expect(plan.trades[0].fee).toBe(0);
  });

  it('lets a category override come first, even on an investment pair', async () => {
    const overrides = mapping();
    overrides.rows = { '2024-01-15T10:00:00.000Z': { category: 'Shopping' } };

    const { plan } = await dryRun({ mapping: overrides });

    expect(plan.transactions.find((t) => t.date === '2024-01-15')).toMatchObject({ rule: 'flow', category: 'Shopping', amount: -25000 });
  });

  it('refuses a refund overridden into an income category: a refund is never income', async () => {
    const overrides = mapping();
    overrides.rows = { '2024-01-20T10:00:00.000Z': { category: 'Gifts' } };

    const { blocking } = await dryRun({ mapping: overrides });

    expect(blocking).toEqual([expect.stringMatching(/refund on line \d+ is overridden into an income category/)]);
  });

  it('asks for an override for money in on an investment pair, rather than calling the pair unmapped', async () => {
    const { blocking, printed } = await dryRun({
      movements: [...MOVEMENTS, { at: '2024-01-25T10:00:00.000Z', date: '2024-01-25', category: 'Investimenti', subcategory: 'ETF', amount: 120, to: 'Conto' }],
    });

    expect(blocking).toEqual([expect.stringMatching(/line \d+ needs a "rows" override: money in on an investment pair/)]);
    expect(printed).not.toMatch(/Unmapped category pairs/);
  });

  it('still reports the pair of a row whose account is unmapped', async () => {
    const { printed } = await dryRun({
      movements: [...MOVEMENTS, { at: '2024-01-12T10:00:00.000Z', date: '2024-01-12', category: 'Svago', subcategory: 'Cinema', amount: 9.99, from: 'Portafoglio' }],
    });

    expect(printed).toMatch(/Unmapped category pairs:\n\s+"Svago\|Cinema"/);
    expect(printed).toMatch(/Unmapped accounts:\n\s+"Portafoglio"/);
  });

  it('leaves two purchases unresolved when they would both claim one trade', async () => {
    const { plan, blocking } = await dryRun({
      movements: [...MOVEMENTS, { at: '2024-01-16T11:00:00.000Z', date: '2024-01-16', category: 'Investimenti', subcategory: 'ETF', amount: 250, from: 'Conto' }],
    });

    expect(plan.transactions.filter((t) => t.rule === 'investment')).toEqual([]);
    expect(blocking).toHaveLength(2);
  });

  it('reports a quantity, a price or a fee it had to round', async () => {
    const { plan, printed } = await dryRun({ trades: [...TRADES, { date: '2024-02-02', ticker: 'WRLD', quantity: 0.123456789, price: 10.005, fee: 0 }] });

    expect(plan.trades.at(-1)).toMatchObject({ units: 12_345_679, price: 1001 });
    expect(printed).toMatch(/trades line \d+\s+Quantità 0\.123456789/);
    expect(printed).toMatch(/trades line \d+\s+Prezzo d'acquisto 10\.005/);
  });
});

describe('the mapping', () => {
  it.each([
    ['a refund fallback that is income', (/** @type {any} */ m) => ({ ...m, refundFallback: 'Gifts' }), /refundFallback must be a spending category/],
    ['a pair mapped to a category it does not list', (/** @type {any} */ m) => ({ ...m, pairs: { ...m.pairs, 'Cibo|Spesa': 'Food/Snacks' } }), /names no category/],
    ['a subcategory under a parent it does not list', (/** @type {any} */ m) => ({ ...m, categories: [...m.categories, { name: 'Cinema', parent: 'Fun' }] }), /no top-level category/],
    ['an account of a kind outside the vocabulary', (/** @type {any} */ m) => ({ ...m, accounts: { ...m.accounts, Conto: { name: 'X', kind: 'wallet' } } }), /kind must be one of/],
    ['a holding that is not valued by units', (/** @type {any} */ m) => ({ ...m, holdings: { WRLD: 'Conto' } }), /valued by units/],
    ['a row override with a field it does not know', (/** @type {any} */ m) => ({ ...m, rows: { x: { amount: 3 } } }), /unknown amount/],
  ])('refuses %s, with the reason', async (_label, change, reason) => {
    await expect(dryRun({ mapping: change(mapping()) })).rejects.toThrow(reason);
  });

  it('refuses a file that is not JSON', async () => {
    const paths = await writeSheet(files);
    await (await import('node:fs/promises')).writeFile(paths.mappingPath, '{ not json');

    await expect(script.importSheet({ ...paths, print: () => {} })).rejects.toThrow(/not readable JSON/);
  });
});
