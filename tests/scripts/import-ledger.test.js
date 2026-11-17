/**
 * The ledger import (ADR 0042) end to end: an invented ledger, invented
 * statement movements written straight through the store, a sandbox store.
 * The seam is the importer's entry point, as for the other importers.
 */

import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { accountValueOn, totalsBetween } from '@/lib/domain/derive/finance.js';
import { ledger, MOVEMENTS_HEADER } from './ledger-fixture.js';
import { csv } from './statement-fixture.js';

/** @type {string} */
let sandbox;
/** @type {string} */
let files;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/scripts/import-ledger.js')} */
let script;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-ledger-'));
  files = await mkdtemp(path.join(tmpdir(), 'personalos-ledger-files-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  script = await import('@/scripts/import-ledger.js');
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

const dataFile = () => path.join(sandbox, 'personalos.json');

/**
 * @param {{ movements: string, categories: string, accounts: string }} texts
 * @param {Omit<import('@/scripts/import-ledger.js').LedgerOptions, 'movementsPath' | 'categoriesPath' | 'accountsPath'>} [options]
 */
async function runImport(texts, options = {}) {
  const paths = {
    movementsPath: path.join(files, 'movimenti.csv'),
    categoriesPath: path.join(files, 'categorie.csv'),
    accountsPath: path.join(files, 'conti.csv'),
  };
  await writeFile(paths.movementsPath, texts.movements);
  await writeFile(paths.categoriesPath, texts.categories);
  await writeFile(paths.accountsPath, texts.accounts);
  /** @type {string[]} */
  const printed = [];
  const result = await script.importLedger({ ...paths, ...options, print: (line) => printed.push(line) });
  return { ...result, text: printed.join('\n') };
}

/**
 * An account with statements: a balance the day before February, then the
 * statement movements given, as `data:import-statement` would have written them.
 *
 * @param {string} name
 * @param {number} opening minor units on 2026-01-31
 * @param {[string, number][]} rows day and signed minor units
 */
async function statementAccount(name, opening, rows) {
  const account = await store.createAccount({ name, kind: 'cash', valuation: 'balance', source: 'integration' });
  await store.recordObservation({ accountId: account.id, kind: 'balance', amount: opening, date: '2026-01-31', source: 'integration' });
  const movements = [];
  for (const [at, [date, amount]] of rows.entries()) {
    movements.push(
      await store.upsertTransactionByOrigin({
        date,
        amount,
        description: 'BANK LINE ' + at,
        accountId: account.id,
        origin: { source: 'statement', externalId: account.id + ':row' + at },
        source: 'integration',
      })
    );
  }
  return { account, movements };
}

/** @param {string} name */
async function accountNamed(name) {
  const account = (await store.getAccounts()).find((row) => row.name === name);
  if (account === undefined) throw new Error('no account ' + name);
  return account;
}

/** @param {string} id */
async function transaction(id) {
  const row = await store.getTransaction(id);
  if (row === null) throw new Error('no transaction ' + id);
  return row;
}

/** @param {string} accountId @param {string} day */
async function valueOn(accountId, day) {
  const inputs = await store.getFinanceInputs();
  const account = /** @type {import('@/lib/domain/types.js').FinanceAccount} */ (inputs.accounts.find((row) => row.id === accountId));
  return accountValueOn(account, inputs, day)?.amount ?? null;
}

/** February's spending and income on the accounts named, as the screens compute them. */
async function february(/** @type {string[]} */ ...accountIds) {
  const [transactions, profile] = await Promise.all([store.getTransactions(), store.getProfile()]);
  const own = transactions.filter((row) => accountIds.includes(row.accountId));
  const { spending, income } = totalsBetween(own, profile.financeCategories, '2026-02-01', '2026-02-28');
  return { spending, income };
}

/** @param {string} label 'Parent > Child' or 'Parent' */
async function categoryId(label) {
  const categories = (await store.getProfile()).financeCategories;
  const [parentName, childName] = label.split(' > ');
  const parent = categories.find((row) => row.parentId === null && row.name === parentName);
  if (parent === undefined) throw new Error('no category ' + parentName);
  if (childName === undefined) return parent.id;
  const child = categories.find((row) => row.parentId === parent.id && row.name === childName);
  if (child === undefined) throw new Error('no category ' + label);
  return child.id;
}

describe('the dry run', () => {
  it('reports the plan and writes nothing', async () => {
    await statementAccount('Conto', 100000, [['2026-02-03', -1250]]);
    const before = await readFile(dataFile(), 'utf8');
    const { plan, blocking, text } = await runImport(
      ledger([{ id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Conto', note: 'pane e latte' }])
    );

    expect(blocking).toEqual([]);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0]).toMatchObject({ ledgerId: 'T0001', distance: 0, patch: { note: 'pane e latte' } });
    expect(text).toMatch(/dry run: nothing was written/);
    expect(text).toMatch(/Categories: 1 with 1 subcategories -- 2 to create, 0 already there/);
    expect(text).toMatch(/"Conto": exists, has statements -- matched, not imported/);
    expect(text).toMatch(/matched: 1 \(0 day\(s\) apart: 1\)/);
    expect(text).toMatch(/categories applied: 1/);
    expect(text).toMatch(/Nothing blocks the import/);
  });

  it('fails loudly on a header that is not the ledger\'s, writing nothing', async () => {
    const files = ledger([{ id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Conto' }]);
    const header = MOVEMENTS_HEADER.map((name) => (name === 'importo' ? 'amount' : name));
    const before = await readFile(dataFile(), 'utf8');
    await expect(runImport({ ...files, movements: csv(header, []) })).rejects.toThrow(/movements file's header is not the ledger's; missing: importo; not expected: amount/);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
  });

  it('blocks on a row it cannot read, and on a sign that disagrees with the type', async () => {
    const files = ledger([{ id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Conto' }]);
    const bad = files.movements.replace('-12.50', '12.50') + 'T0002,2026-02-31,,uscita,Spesa,,Supermercato,1.00,-1.00,Conto,,,,,si\n';
    const { blocking } = await runImport({ ...files, movements: bad });
    expect(blocking).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/movements line 2: importo_con_segno 12.50 does not agree with a uscita of 12.50/),
        expect.stringMatching(/movements line 3: data is not a YYYY-MM-DD day/),
      ])
    );
  });

  it('is refused while the demo finance rows are present', async () => {
    await store.resetToSeed();
    const { blocking } = await runImport(ledger([{ id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '1.00', da: 'Contanti' }]));
    expect(blocking[0]).toMatch(/demo finance rows/);
  });
});

describe('the categories', () => {
  it('creates the tree, a subcategory name under two categories as two, and nothing on a second run', async () => {
    const files = ledger(
      [
        { id: 'T0001', data: '2026-02-02', tipo: 'saldo_iniziale', importo: '100.00', a: 'Contanti' },
        { id: 'T0002', data: '2026-02-03', tipo: 'uscita', importo: '40.00', da: 'Contanti', categoria: 'Casa', sottocategoria: 'Altro' },
        { id: 'T0003', data: '2026-02-04', tipo: 'uscita', importo: '9.00', da: 'Contanti', categoria: 'Svago', sottocategoria: 'Altro' },
        { id: 'T0004', data: '2026-02-05', tipo: 'entrata', importo: '15.00', a: 'Contanti', categoria: 'Entrate', sottocategoria: 'Regali' },
      ],
      { extraCategories: [['Casa', 'Affitto']], recurring: ['Casa>Altro'] }
    );
    await runImport(files, { write: true });

    const categories = (await store.getProfile()).financeCategories;
    const top = (/** @type {string} */ name) => categories.find((row) => row.parentId === null && row.name === name);
    expect(top('Casa')?.kind).toBe('expense');
    expect(top('Svago')?.kind).toBe('expense');
    expect(top('Entrate')?.kind).toBe('income');
    const altro = categories.filter((row) => row.name === 'Altro');
    expect(altro.map((row) => row.parentId).sort()).toEqual([top('Casa')?.id, top('Svago')?.id].sort());
    expect(altro.find((row) => row.parentId === top('Casa')?.id)?.fixedCost).toBe(true);
    expect(altro.find((row) => row.parentId === top('Svago')?.id)?.fixedCost).toBe(false);
    expect(categories.some((row) => row.name === 'Affitto' && row.parentId === top('Casa')?.id)).toBe(true);

    const count = categories.length;
    const again = await runImport(files, { write: true });
    expect(again.backupPath).toBeUndefined();
    expect(again.text).toMatch(/Nothing to change: the ledger is already imported/);
    expect((await store.getProfile()).financeCategories).toHaveLength(count);
  });

  it('refuses a category that exists with the other kind', async () => {
    // The seed's demo set has "Consulting" as income.
    const { blocking } = await runImport(
      ledger([{ id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '5.00', da: 'Contanti', categoria: 'Consulting', sottocategoria: 'Tools' }])
    );
    expect(blocking).toContainEqual(expect.stringMatching(/"Consulting" already exists as income; the ledger files it as expense/));
  });
});

describe('matching', () => {
  it('matches on the same day before a day apart, and never claims a statement movement twice', async () => {
    const { movements } = await statementAccount('Conto', 100000, [['2026-02-12', -2000]]);
    const { plan, text } = await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-11', tipo: 'uscita', importo: '20.00', da: 'Conto', note: 'a day early' },
        { id: 'T0002', data: '2026-02-12', tipo: 'uscita', importo: '20.00', da: 'Conto', note: 'same day' },
      ])
    );
    expect(plan.updates.map((update) => [update.ledgerId, update.transaction.id, update.distance])).toEqual([['T0002', movements[0].id, 0]]);
    expect(plan.accounts[0].unmatched.map((row) => row.ledgerId)).toEqual(['T0001']);
    expect(text).toMatch(/ledger rows with no statement movement: 1\n {4}T0001 {2}2026-02-11 {8}-20\.00 {2}Spesa > Supermercato {2}"a day early"/);
  });

  it('breaks a tie between two movements as far apart by the earlier one, the same way every run', async () => {
    const { movements } = await statementAccount('Conto', 100000, [['2026-02-21', -700], ['2026-02-19', -700]]);
    const files = ledger([{ id: 'T0001', data: '2026-02-20', tipo: 'uscita', importo: '7.00', da: 'Conto' }]);
    const first = await runImport(files);
    const second = await runImport(files);
    expect(first.plan.updates[0].transaction.id).toBe(movements[1].id);
    expect(second.plan.updates[0].transaction.id).toBe(movements[1].id);
  });

  it('matches within the window, and lists what lies outside it unless the window is widened', async () => {
    await statementAccount('Carta', 0, [['2026-02-05', -1500], ['2026-02-14', -900]]);
    const files = ledger([
      { id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '15.00', da: 'Carta' },
      { id: 'T0002', data: '2026-02-10', tipo: 'uscita', importo: '9.00', da: 'Carta' },
    ]);
    const narrow = await runImport(files);
    expect(narrow.plan.updates.map((update) => [update.ledgerId, update.distance])).toEqual([['T0001', 2]]);
    expect(narrow.plan.accounts[0].unmatched.map((row) => row.ledgerId)).toEqual(['T0002']);
    expect(narrow.text).toMatch(/matched: 1 \(2 day\(s\) apart: 1\)/);

    const wide = await runImport(files, { window: 4 });
    expect(wide.plan.updates.map((update) => [update.ledgerId, update.distance])).toEqual([['T0001', 2], ['T0002', 4]]);
  });

  it('matches money in only with money in, and money out only with money out', async () => {
    const { movements } = await statementAccount('Conto', 100000, [['2026-02-27', -3000], ['2026-02-27', 3000]]);
    const { plan } = await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-27', tipo: 'entrata', importo: '30.00', a: 'Conto' },
        { id: 'T0002', data: '2026-02-27', tipo: 'uscita', importo: '30.00', da: 'Conto', categoria: 'Svago', sottocategoria: 'Cinema' },
      ])
    );
    const byLedger = Object.fromEntries(plan.updates.map((update) => [update.ledgerId, update.transaction.id]));
    expect(byLedger).toEqual({ T0001: movements[1].id, T0002: movements[0].id });
  });

  it('never imports a ledger row as a transaction on an account with statements', async () => {
    await statementAccount('Conto', 100000, [['2026-02-03', -1250]]);
    await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Conto' },
        { id: 'T0002', data: '2026-02-08', tipo: 'uscita', importo: '99.00', da: 'Conto', note: 'not on the statement' },
      ]),
      { write: true }
    );
    const transactions = await store.getTransactions();
    expect(transactions.map((row) => row.origin?.source)).toEqual(['statement']);
  });
});

describe("your zone", () => {
  it('fills only what is empty, leaves what you set, and a second run touches nothing', async () => {
    const { account, movements } = await statementAccount('Conto', 100000, [['2026-02-03', -1250], ['2026-02-04', -800], ['2026-02-06', 2500]]);
    const groceries = await categoryId('Groceries');
    await store.updateTransaction(movements[0].id, { note: 'mine' });
    await store.updateTransaction(movements[1].id, { categoryId: groceries });
    const files = ledger([
      { id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Conto', note: 'from the ledger', tag: 'Viaggio Roma' },
      { id: 'T0002', data: '2026-02-04', tipo: 'uscita', importo: '8.00', da: 'Conto', categoria: 'Svago', sottocategoria: 'Bar', note: 'caffè' },
      { id: 'T0003', data: '2026-02-06', tipo: 'entrata', importo: '25.00', a: 'Conto', categoria: 'Spesa', sottocategoria: 'Rimborso', conteggiato: 'no' },
    ]);
    const { text } = await runImport(files, { write: true });

    const first = await transaction(movements[0].id);
    expect(first).toMatchObject({ note: 'mine', tags: ['viaggio roma'], categoryId: await categoryId('Spesa > Supermercato') });
    const second = await transaction(movements[1].id);
    expect(second).toMatchObject({ categoryId: groceries, note: 'caffè' });
    const refund = await transaction(movements[2].id);
    expect(refund).toMatchObject({ notCounted: true, categoryId: await categoryId('Spesa > Rimborso') });
    expect(text).toMatch(/fields left alone, already set in the app: category 1, note 1/);
    expect(text).toMatch(/fields filled: category 2, note 1, tags 1, not counted 1/);

    // Yours from now on: a category changed by hand survives a second run.
    await store.updateTransaction(movements[0].id, { categoryId: groceries });
    const again = await runImport(files, { write: true });
    expect(again.backupPath).toBeUndefined();
    expect(again.text).toMatch(/Nothing to change/);
    expect((await transaction(movements[0].id)).categoryId).toBe(groceries);
    expect(await valueOn(account.id, '2026-02-28')).toBe(100000 - 1250 - 800 + 2500);
  });
});

describe('an account without statements', () => {
  it('takes the ledger as its source: created, its opening balance the day before its first movement, its rows as transactions', async () => {
    await statementAccount('Conto', 100000, [['2026-02-20', -100]]);
    const { text } = await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '100.00', a: 'Contanti' },
        { id: 'T0002', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '250.00', a: 'Conto' },
        { id: 'T0003', data: '2026-02-03', tipo: 'uscita', importo: '5.00', da: 'Contanti', categoria: 'Svago', sottocategoria: 'Bar', note: 'caffè', tag: 'lavoro' },
        { id: 'T0004', data: '2026-02-04', tipo: 'entrata', importo: '20.00', a: 'Contanti', categoria: 'Entrate', sottocategoria: 'Regali' },
      ]),
      { write: true }
    );
    const cash = await accountNamed('Contanti');
    expect(cash).toMatchObject({ kind: 'cash', valuation: 'balance', origin: null });
    expect((await store.getObservations({ accountId: cash.id })).map((row) => [row.date, row.amount])).toEqual([['2026-01-31', 10000]]);
    const rows = (await store.getTransactions()).filter((row) => row.accountId === cash.id);
    expect(rows.map((row) => [row.origin?.source, row.origin?.externalId, row.amount, row.description]).sort()).toEqual([
      ['sheet', 'T0003', -500, 'caffè'],
      ['sheet', 'T0004', 2000, 'Regali'],
    ]);
    expect(rows.find((row) => row.amount === -500)).toMatchObject({ categoryId: await categoryId('Svago > Bar'), tags: ['lavoro'] });
    expect(await valueOn(cash.id, '2026-02-28')).toBe(10000 - 500 + 2000);
    expect(await february(cash.id)).toEqual({ spending: 500, income: 2000 });
    expect(text).toMatch(/"Conto": 250\.00 on 2026-02-01 \(T0002\) -- ignored, the statement knows better/);
    expect((await store.getObservations({ accountId: (await accountNamed('Conto')).id })).map((row) => row.amount)).toEqual([100000]);
  });
});

describe('transfers', () => {
  it('between two accounts with statements: both rows not counted, each balance moved once', async () => {
    const bank = await statementAccount('Conto', 100000, [['2026-02-05', -20000]]);
    const savings = await statementAccount('Risparmio', 50000, [['2026-02-05', 20000]]);
    const { text } = await runImport(ledger([{ id: 'T0001', data: '2026-02-05', tipo: 'trasferimento', importo: '200.00', da: 'Conto', a: 'Risparmio' }]), { write: true });

    for (const row of [bank.movements[0], savings.movements[0]]) {
      expect(await transaction(row.id)).toMatchObject({ notCounted: true, counterAccountId: null });
    }
    expect(await valueOn(bank.account.id, '2026-02-28')).toBe(80000);
    expect(await valueOn(savings.account.id, '2026-02-28')).toBe(70000);
    expect(await february(bank.account.id, savings.account.id)).toEqual({ spending: 0, income: 0 });
    expect(text).toMatch(/1 {2}both ends statement rows, both not counted/);
  });

  it('from an account with statements to one the ledger feeds: the statement row is the transfer', async () => {
    const bank = await statementAccount('Conto', 100000, [['2026-02-06', -5000]]);
    await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '10.00', a: 'Contanti' },
        { id: 'T0002', data: '2026-02-06', tipo: 'trasferimento', importo: '50.00', da: 'Conto', a: 'Contanti', note: 'prelievo' },
      ]),
      { write: true }
    );
    const cash = await accountNamed('Contanti');
    expect(await transaction(bank.movements[0].id)).toMatchObject({ counterAccountId: cash.id, categoryId: null, note: 'prelievo' });
    expect((await store.getTransactions()).filter((row) => row.accountId === cash.id)).toEqual([]);
    expect(await valueOn(bank.account.id, '2026-02-28')).toBe(95000);
    expect(await valueOn(cash.id, '2026-02-28')).toBe(6000);
    expect(await february(bank.account.id, cash.id)).toEqual({ spending: 0, income: 0 });
  });

  it('between two accounts the ledger feeds: one transaction with a counter account', async () => {
    await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '80.00', a: 'Contanti' },
        { id: 'T0002', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '100.00', a: 'Banca due' },
        { id: 'T0003', data: '2026-02-09', tipo: 'trasferimento', importo: '30.00', da: 'Contanti', a: 'Banca due' },
      ]),
      { write: true }
    );
    const cash = await accountNamed('Contanti');
    const other = await accountNamed('Banca due');
    const rows = await store.getTransactions();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountId: cash.id, counterAccountId: other.id, amount: -3000, categoryId: null });
    expect(await valueOn(cash.id, '2026-02-28')).toBe(5000);
    expect(await valueOn(other.id, '2026-02-28')).toBe(13000);
    expect(await february(cash.id, other.id)).toEqual({ spending: 0, income: 0 });
  });

  it('a card topped up from the bank, whose statement lists only spending: the card receives it once', async () => {
    const bank = await statementAccount('Conto', 100000, [['2026-02-07', -10000]]);
    const card = await statementAccount('Carta', 0, [['2026-02-09', -2500]]);
    const { text } = await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-07', tipo: 'trasferimento', importo: '100.00', da: 'Conto', a: 'Carta' },
        { id: 'T0002', data: '2026-02-08', tipo: 'uscita', importo: '25.00', da: 'Carta', categoria: 'Svago', sottocategoria: 'Libri' },
      ]),
      { write: true }
    );
    expect(await transaction(bank.movements[0].id)).toMatchObject({ counterAccountId: card.account.id, categoryId: null });
    expect(await valueOn(bank.account.id, '2026-02-28')).toBe(90000);
    expect(await valueOn(card.account.id, '2026-02-28')).toBe(7500);
    expect(await february(bank.account.id, card.account.id)).toEqual({ spending: 2500, income: 0 });
    expect(text).toMatch(/1 {2}one end's statement row carries it, the other statement has no row \(a card top-up\)/);
    expect(text).toMatch(/T0001 {2}2026-02-07 {8}100\.00 {2}Conto -> Carta/);
  });
});

describe('an account the ledger feeds ends where the ledger does', () => {
  it("writes the ledger account's leg when the statement row is not found, and removes it once a statement row carries it", async () => {
    const bank = await statementAccount('Conto', 100000, [['2026-02-10', -5000]]);
    const files = ledger([
      { id: 'T0001', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '10.00', a: 'Contanti' },
      { id: 'T0002', data: '2026-02-06', tipo: 'trasferimento', importo: '50.00', da: 'Conto', a: 'Contanti', note: 'prelievo' },
    ]);

    const first = await runImport(files, { write: true });
    const cash = await accountNamed('Contanti');
    const legs = (await store.getTransactions()).filter((row) => row.accountId === cash.id);
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ amount: 5000, notCounted: true, counterAccountId: null, origin: { source: 'sheet', externalId: 'T0002:leg' } });
    expect(await transaction(bank.movements[0].id)).toMatchObject({ counterAccountId: null });
    expect(await valueOn(cash.id, '2026-02-28')).toBe(6000);
    expect(await valueOn(bank.account.id, '2026-02-28')).toBe(95000);
    // The bank row the ledger did not find is still an uncategorised movement of the bank's.
    expect(await february(cash.id)).toEqual({ spending: 0, income: 0 });
    expect(first.text).toMatch(/1 {2}statement row not found; the ledger account's leg written/);
    expect(first.text).toMatch(/ledger balance check on 2026-02-06: 60\.00 after the import, the ledger implies 60\.00 -- they match/);

    // A wider window finds the row: it becomes the transfer, and the leg goes.
    const second = await runImport(files, { write: true, window: 5 });
    expect(second.blocking).toEqual([]);
    expect(second.text).toMatch(/removed 1 leg\(s\) a statement row now carries/);
    expect(await transaction(bank.movements[0].id)).toMatchObject({ counterAccountId: cash.id });
    expect((await store.getTransactions()).filter((row) => row.accountId === cash.id)).toEqual([]);
    expect(await valueOn(cash.id, '2026-02-28')).toBe(6000);
    expect(await valueOn(bank.account.id, '2026-02-28')).toBe(95000);
    expect(await february(bank.account.id, cash.id)).toEqual({ spending: 0, income: 0 });
    expect(second.text).toMatch(/ledger balance check on 2026-02-10: 60\.00 after the import, the ledger implies 60\.00 -- they match/);

    const third = await runImport(files, { write: true, window: 5 });
    expect(third.backupPath).toBeUndefined();
    expect(third.text).toMatch(/Nothing to change/);
  });

  it("keeps the ledger's totals: money in counted in a spending category is a refund, said in the report, and a refund left out does not turn a category", async () => {
    const { blocking, text } = await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '50.00', a: 'Contanti' },
        { id: 'T0002', data: '2026-02-03', tipo: 'uscita', importo: '40.00', da: 'Contanti', categoria: 'Svago', sottocategoria: 'Cena' },
        { id: 'T0003', data: '2026-02-04', tipo: 'entrata', importo: '17.50', a: 'Contanti', categoria: 'Svago', sottocategoria: 'Cena', note: 'my share back' },
        { id: 'T0004', data: '2026-02-05', tipo: 'entrata', importo: '100.00', a: 'Contanti', categoria: 'Entrate', sottocategoria: 'Regali' },
        { id: 'T0005', data: '2026-02-06', tipo: 'uscita', importo: '10.00', da: 'Contanti', categoria: 'Entrate', sottocategoria: 'Regali', conteggiato: 'no' },
      ]),
      { write: true }
    );
    expect(blocking).toEqual([]);
    expect((await store.getProfile()).financeCategories.find((row) => row.name === 'Entrate')?.kind).toBe('income');
    const cash = await accountNamed('Contanti');
    expect(await february(cash.id)).toEqual({ spending: 2250, income: 10000 });
    expect(await valueOn(cash.id, '2026-02-28')).toBe(5000 - 4000 + 1750 + 10000 - 1000);
    expect(text).toMatch(/Contanti: 17\.50 the ledger counts as income or spending sits in a category of the other kind.*spending 22\.50, income 100\.00/);
    expect(text).toMatch(/ledger balance check on 2026-02-06: 117\.50 after the import, the ledger implies 117\.50 -- they match/);
  });

  it('blocks when its balance or its totals would not be the ledger\'s', async () => {
    const files = ledger([
      { id: 'T0001', data: '2026-02-01', tipo: 'saldo_iniziale', importo: '50.00', a: 'Contanti' },
      { id: 'T0002', data: '2026-02-03', tipo: 'uscita', importo: '4.00', da: 'Contanti' },
    ]);
    await runImport(files, { write: true });
    const cash = await accountNamed('Contanti');
    await store.createTransaction({ date: '2026-02-02', amount: -300, accountId: cash.id, description: 'typed by hand' });
    const { blocking } = await runImport(files);
    expect(blocking).toContainEqual(expect.stringMatching(/"Contanti" would end at 43\.00 on 2026-02-03, the ledger implies 46\.00 .* a difference of -3\.00/));
    expect(blocking).toContainEqual(expect.stringMatching(/"Contanti": spending 7\.00 and income 0\.00 after the import, the ledger has 4\.00 and 0\.00/));
  });
});

describe('a payment to a broker', () => {
  it('is matched, categorised and kept out of spending, with no holding or trade', async () => {
    const bank = await statementAccount('Conto', 100000, [['2026-02-15', -30000], ['2026-02-16', -1000]]);
    const accountsBefore = (await store.getAccounts()).length;
    const { text } = await runImport(
      ledger([
        { id: 'T0001', data: '2026-02-15', tipo: 'investimento', importo: '300.00', da: 'Conto' },
        { id: 'T0002', data: '2026-02-16', tipo: 'uscita', importo: '10.00', da: 'Conto' },
      ]),
      { write: true }
    );
    expect(await transaction(bank.movements[0].id)).toMatchObject({
      categoryId: await categoryId('Investimenti > Versamento broker'),
      notCounted: true,
      counterAccountId: null,
    });
    expect(await february(bank.account.id)).toEqual({ spending: 1000, income: 0 });
    expect(await valueOn(bank.account.id, '2026-02-28')).toBe(69000);
    expect(await store.getAccounts()).toHaveLength(accountsBefore);
    expect(await store.getTrades()).toEqual([]);
    expect(text).toMatch(/Totals check, 2026-02-15 to 2026-02-16/);
    expect(text).toMatch(/\n {2}Conto +10\.00 +10\.00 +0\.00 +0\.00 +0\.00 +0\.00\n/);
  });
});

describe('the write', () => {
  it('backs up first, and a second run changes nothing and takes no backup', async () => {
    await statementAccount('Conto', 100000, [['2026-02-03', -1250]]);
    const files = ledger([
      { id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Conto' },
      { id: 'T0002', data: '2026-02-04', tipo: 'uscita', importo: '3.00', da: 'Contanti' },
    ]);
    const before = await readFile(dataFile(), 'utf8');
    const { backupPath, text } = await runImport(files, { write: true });
    expect(backupPath).toBeDefined();
    expect(await readFile(/** @type {string} */ (backupPath), 'utf8')).toBe(before);
    expect((await stat(/** @type {string} */ (backupPath))).isFile()).toBe(true);
    expect(text).toMatch(/Wrote 1 account\(s\), 2 categories, 0 opening balance\(s\), 1 ledger transaction\(s\), filled 1 statement movement\(s\) and removed 0 leg\(s\)/);

    const written = await readFile(dataFile(), 'utf8');
    const again = await runImport(files, { write: true });
    expect(again.backupPath).toBeUndefined();
    expect(again.text).toBe('Nothing to change: the ledger is already imported.');
    expect(await readFile(dataFile(), 'utf8')).toBe(written);
  });

  it('is refused, writing nothing and taking no backup, while anything blocks', async () => {
    await store.createTransaction({
      date: '2026-02-01', amount: -100, accountId: (await store.createAccount({ name: 'Contanti' })).id,
      origin: { source: 'sheet', externalId: '2026-02-01T10:00:00.000Z' },
    });
    const before = await readFile(dataFile(), 'utf8');
    await expect(
      runImport(ledger([{ id: 'T0001', data: '2026-02-04', tipo: 'uscita', importo: '3.00', da: 'Contanti' }]), { write: true })
    ).rejects.toThrow(/1 movement\(s\) on "Contanti" came from a spreadsheet or ledger import and are not in this ledger/);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
  });
});

describe('--account-map', () => {
  it('sends a ledger account to an account of another name, and refuses two onto one', async () => {
    const bank = await statementAccount('Conto corrente', 100000, [['2026-02-03', -1250]]);
    const files = ledger([
      { id: 'T0001', data: '2026-02-03', tipo: 'uscita', importo: '12.50', da: 'Banca' },
      { id: 'T0002', data: '2026-02-05', tipo: 'uscita', importo: '1.00', da: 'Banca vecchia' },
    ]);
    const { plan, text } = await runImport(files, { accountMap: { Banca: 'Conto corrente' } });
    expect(plan.updates.map((update) => update.transaction.id)).toEqual([bank.movements[0].id]);
    expect(text).toMatch(/"Banca" -> "Conto corrente": exists, has statements/);
    expect(text).toMatch(/"Banca vecchia": would be created \(cash\), no statements/);

    const both = await runImport(files, { accountMap: { Banca: 'Conto corrente', 'Banca vecchia': 'Conto corrente' } });
    expect(both.blocking).toContainEqual(expect.stringMatching(/"Banca" and "Banca vecchia" both go to "Conto corrente"/));
  });
});

describe('the command line', () => {
  it('reads the files, the window, the account map and --write', () => {
    expect(
      script.parseArgs([
        '--movements', 'm.csv', '--categories', 'c.csv', '--accounts', 'a.csv', '--window', '5', '--account-map', 'Banca=Conto corrente', '--write',
      ])
    ).toEqual({ movementsPath: 'm.csv', categoriesPath: 'c.csv', accountsPath: 'a.csv', window: 5, accountMap: { Banca: 'Conto corrente' }, write: true });
    expect(script.parseArgs(['--movements', 'm.csv', '--categories', 'c.csv', '--accounts', 'a.csv']).window).toBe(3);
  });

  it('refuses what it does not understand', () => {
    const files = ['--movements', 'm.csv', '--categories', 'c.csv', '--accounts', 'a.csv'];
    expect(() => script.parseArgs(['--movements', 'm.csv'])).toThrow(/--categories, --accounts/);
    expect(() => script.parseArgs([...files, '--window', '-1'])).toThrow(/whole number/);
    expect(() => script.parseArgs([...files, '--window', 'two'])).toThrow(/whole number/);
    expect(() => script.parseArgs([...files, '--account-map', 'Banca'])).toThrow(/<ledger name>=<account name>/);
    expect(() => script.parseArgs([...files, '--colour'])).toThrow(/unknown option --colour/);
    expect(() => script.parseArgs([...files, 'extra.csv'])).toThrow(/unexpected argument/);
  });
});
