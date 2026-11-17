/**
 * The statement import (ADR 0041) end to end: invented statements, a
 * sandbox store. The seam is the importer's entry point, as for the other
 * importers.
 */

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { accountValueOn } from '@/lib/domain/derive/finance.js';
import { cardExport, cardRow, csv, CARD_HEADER, revolutExport, signedExport, signedRows, signedSameDayRows, typedExport, typedRows } from './statement-fixture.js';

/** @type {string} */
let sandbox;
/** @type {string} */
let files;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/scripts/import-statement.js')} */
let script;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-statement-'));
  files = await mkdtemp(path.join(tmpdir(), 'personalos-statement-files-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  script = await import('@/scripts/import-statement.js');
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
 * @param {string} text
 * @param {Omit<import('@/scripts/import-statement.js').StatementOptions, 'csvPath'>} options
 */
async function runImport(text, options) {
  const csvPath = path.join(files, 'statement.csv');
  await writeFile(csvPath, text);
  /** @type {string[]} */
  const printed = [];
  const result = await script.importStatement({ csvPath, ...options, print: (line) => printed.push(line) });
  return { ...result, text: printed.join('\n') };
}

const REVOLUT = { format: 'revolut', account: 'Revolut', accountFor: { Deposito: 'Revolut deposit' } };
const SIGNED = { format: 'bank-normalised-signed', account: 'Main bank' };
const TYPED = { format: 'bank-normalised-typed', account: 'Second bank' };
const CARD = { format: 'card-normalised', account: 'Card' };

/** @param {string} name */
async function accountNamed(name) {
  const account = (await store.getAccounts()).find((row) => row.name === name);
  if (account === undefined) throw new Error('no account ' + name);
  return account;
}

/** @param {string} accountId */
async function movementsOf(accountId) {
  return (await store.getTransactions()).filter((transaction) => transaction.accountId === accountId);
}

/**
 * @param {string} accountId
 * @param {string} day
 */
async function valueOn(accountId, day) {
  const inputs = await store.getFinanceInputs();
  const account = inputs.accounts.find((row) => row.id === accountId);
  if (account === undefined) throw new Error('no account');
  return accountValueOn(account, inputs, day)?.amount ?? null;
}

describe('the dry run', () => {
  it('reports the plan and writes nothing', async () => {
    const before = await readFile(dataFile(), 'utf8');
    const { plan, blocking, text } = await runImport(revolutExport(), REVOLUT);

    expect(blocking).toEqual([]);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
    expect(await store.getAccounts()).toEqual([]);

    const [current, deposit] = plan.accounts;
    expect(current).toMatchObject({
      product: 'Attuale', name: 'Revolut', account: null, firstDate: '2026-03-01', lastDate: '2026-04-12',
      counts: { new: 7, unchanged: 0, changed: 0 }, newSum: 2132, opening: { date: '2026-02-28', amount: 20000 },
      check: { fileBalance: 22132, accountBalance: 22132, difference: 0, chainBreaks: 0 },
    });
    expect(deposit).toMatchObject({
      product: 'Deposito', name: 'Revolut deposit', counts: { new: 2 }, newSum: 12, opening: { date: '2026-04-03', amount: 300000 },
      check: { difference: 0 },
    });

    expect(text).toMatch(/dry run: nothing was written/);
    expect(text).toMatch(/Account "Revolut" \(product Attuale\): would be created \(cash, EUR\)/);
    expect(text).toMatch(/7 new, 0 already imported and unchanged, 0 changed/);
    expect(text).toMatch(/sum of the new movements: 21\.32 EUR/);
    expect(text).toMatch(/opening balance: 200\.00 on 2026-02-28/);
    expect(text).toMatch(/balance check: the file says 221\.32 after its last movement on 2026-04-12; the account would be 221\.32 -- they match/);
    expect(text).not.toMatch(/does not follow the rows/);
    expect(text).toMatch(/1 {2}cancelled/);
    expect(text).toMatch(/1 {2}not completed: IN SOSPESO/);
    expect(text).toMatch(/1 {2}currency TRY is not tracked/);
  });

  it('refuses a product with no account named, listing the products found', async () => {
    const { blocking, text } = await runImport(revolutExport(), { format: 'revolut', account: 'Revolut' });
    expect(blocking).toEqual([
      'no account named for the product "Deposito" (products in the file: Attuale, Deposito): add --account-for Deposito="<account name>"',
    ]);
    expect(text).toMatch(/would be refused/);
    await expect(runImport(revolutExport(), { format: 'revolut', account: 'Revolut', write: true })).rejects.toThrow(/nothing was written/);
    expect(await store.getAccounts()).toEqual([]);
  });

  it('refuses one account for two products', async () => {
    const { blocking } = await runImport(revolutExport(), { format: 'revolut', account: 'Revolut', accountFor: { Deposito: 'Revolut' } });
    expect(blocking).toContain('the products "Attuale" and "Deposito" both go to "Revolut": one product, one account');
  });

  it('fails loudly on a header that is not the declared format, writing nothing', async () => {
    const before = await readFile(dataFile(), 'utf8');
    await expect(runImport(signedExport(), { format: 'revolut', account: 'X' })).rejects.toThrow(/does not match the format "revolut"/);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
  });

  it('says a statement with no running balance leaves a new account unknown, and how to give it one', async () => {
    const { plan, text } = await runImport(typedExport(), TYPED);
    expect(plan.accounts[0]).toMatchObject({ opening: null, check: null, valueAfter: null, newSum: 14250 });
    expect(text).toMatch(/balance: unknown -- this file carries no balance.*record one on the Finances screen.*dated 2026-06-30/);
  });

  it('prints at most ten blocking lines, then how many more', async () => {
    const rows = Array.from({ length: 13 }, (_, at) => ['2026-06-0' + String((at % 9) + 1), '2026-06-01', 'x', 'EUR', 'C', 'Line ' + at, '1.00']);
    const { blocking, text } = await runImport(signedExport(rows), SIGNED);
    expect(blocking).toHaveLength(13);
    expect(text).toMatch(/line 11: importo "x" is not a number\n {2}and 3 more/);
    expect(text).not.toMatch(/line 12:/);
  });

  it("reports the card's foreign-exchange fees and cashback without applying them", async () => {
    const { plan, text } = await runImport(cardExport(), CARD);
    expect(plan.accounts[0]).toMatchObject({ counts: { new: 4 }, newSum: -1480 });
    expect(plan.unapplied).toEqual({ fxFee: 30, cashback: 15 });
    expect(text).toMatch(/foreign-exchange fees 0\.30, cashback 0\.15/);
    expect(text).toMatch(/1 {2}pending authorisation/);
    expect(text).toMatch(/1 {2}authorisation released/);
    expect(text).toMatch(/1 {2}not completed: Fallita/);
  });

  it('is refused while the demo finance rows are present', async () => {
    await store.resetToSeed();
    const { blocking } = await runImport(signedExport(), SIGNED);
    expect(blocking[0]).toMatch(/demo finance rows/);
  });

  it('refuses an account valued by units', async () => {
    await store.createAccount({ name: 'Main bank', kind: 'investment', valuation: 'units', currency: 'EUR' });
    const { blocking } = await runImport(signedExport(), SIGNED);
    expect(blocking).toContain('the account "Main bank" is valued by units: a statement moves money on an account valued by balance');
  });
});

describe('the balance check', () => {
  it('says the difference against a balance you typed, and never fixes either', async () => {
    const bank = await store.createAccount({ name: 'Main bank', kind: 'cash', currency: 'EUR' });
    await store.recordObservation({ accountId: bank.id, kind: 'balance', amount: 99000, date: '2026-05-01', currency: 'EUR' });
    await store.createTransaction({ accountId: bank.id, date: '2026-06-03', amount: -500, currency: 'EUR', description: 'said in the capture bar' });

    const { plan, text } = await runImport(signedExport(), SIGNED);
    // 990.00 + 9.59 imported - 5.00 typed = 994.59, against the file's 1009.59.
    expect(plan.accounts[0]).toMatchObject({ opening: null, check: { fileBalance: 100959, accountBalance: 99459, difference: -1500 } });
    expect(text).toMatch(/the account would be 994\.59 -- a difference of -15\.00/);
    expect(text).toMatch(/opening balance: not recorded -- the balance of 2026-05-01 already anchors/);
    expect(text).toMatch(/1 movement\(s\) on "Main bank" between 2026-06-01 and 2026-06-05 are not from a statement/);

    await runImport(signedExport(), { ...SIGNED, write: true });
    const balances = await store.getObservations({ accountId: bank.id });
    expect(balances.map((row) => row.amount)).toEqual([99000]);
  });

  it('balances several rows a day newest first, a zero in exponent notation included', async () => {
    const { plan, text } = await runImport(signedExport(signedSameDayRows()), SIGNED);
    expect(plan.blocking).toEqual([]);
    expect(plan.accounts[0]).toMatchObject({
      opening: { date: '2026-06-09', amount: 5000 },
      check: { fileBalance: 0, accountBalance: 0, difference: 0, chainBreaks: 0 },
    });
    expect(text).toMatch(/they match/);
  });

  it('prints no difference while a line could not be read, since that line is missing from the chain and the sum', async () => {
    const rows = signedSameDayRows();
    rows[2] = [...rows[2]];
    rows[2][2] = '1OO';
    const { plan, text } = await runImport(signedExport(rows), SIGNED);
    expect(plan.blocking).toEqual(['line 4: importo "1OO" is not a number']);
    expect(plan.accounts[0]).toMatchObject({ opening: null, check: null, valueAfter: null });
    expect(text).toMatch(/balance check: not computed -- 1 line\(s\) could not be read/);
    expect(text).not.toMatch(/difference/);
  });

  it('counts the places where the running balance does not follow the rows', async () => {
    const rows = signedRows();
    rows[2] = [...rows[2]];
    rows[2][6] = '1111.59';
    const { plan, text } = await runImport(signedExport(rows), SIGNED);
    expect(plan.accounts[0].check?.chainBreaks).toBeGreaterThan(0);
    expect(text).toMatch(/does not follow the rows/);
  });
});

describe('the write', () => {
  it('backs up, then creates the accounts, their opening balances and the movements', async () => {
    const before = await readFile(dataFile(), 'utf8');
    const { backupPath, text } = await runImport(revolutExport(), { ...REVOLUT, write: true });

    expect(backupPath).toBeDefined();
    expect(await readFile(/** @type {string} */ (backupPath), 'utf8')).toBe(before);
    expect(text).toMatch(/backed up at/);
    expect(text).toMatch(/Wrote 2 account\(s\), 2 opening balance\(s\), 9 new movement\(s\) and 0 changed one\(s\)/);

    const current = await accountNamed('Revolut');
    expect(current).toMatchObject({ kind: 'cash', valuation: 'balance', currency: 'EUR', origin: null, source: 'integration' });
    const [opening] = await store.getObservations({ accountId: current.id });
    expect(opening).toMatchObject({ amount: 20000, date: '2026-02-28', origin: { source: 'statement' } });

    const movements = await movementsOf(current.id);
    expect(movements).toHaveLength(7);
    for (const movement of movements) {
      expect(Number.isInteger(movement.amount)).toBe(true);
      expect(movement).toMatchObject({ categoryId: null, counterAccountId: null, notCounted: false, origin: { source: 'statement' } });
      expect(movement.origin?.externalId.startsWith(current.id + ':')).toBe(true);
    }
    const fee = movements.find((movement) => movement.description === 'Fee: Conversione in TRY');
    expect(fee).toMatchObject({ amount: -19, date: '2026-04-11', origin: { detail: { type: 'Cambia valuta', product: 'Attuale', part: 'fee' } } });
    expect(fee?.origin?.externalId.endsWith(':fee')).toBe(true);

    // Opening plus every movement is the last Saldo; between, each movement
    // counts on the day it started (the coffee on 1 March).
    expect(await valueOn(current.id, '2026-04-12')).toBe(22132);
    expect(await valueOn(current.id, '2026-03-01')).toBe(19760);
    expect(await valueOn(current.id, '2026-03-02')).toBe(17872);
    expect(await valueOn((await accountNamed('Revolut deposit')).id, '2026-04-04')).toBe(300012);
  });

  it('changes nothing, and takes no backup, on the same file a second time', async () => {
    await runImport(revolutExport(), { ...REVOLUT, write: true });
    const after = await readFile(dataFile(), 'utf8');
    const { plan, backupPath, text } = await runImport(revolutExport(), { ...REVOLUT, write: true });
    expect(backupPath).toBeUndefined();
    expect(text).toMatch(/Nothing to change/);
    expect(plan.accounts.map((account) => account.counts)).toEqual([
      { new: 0, unchanged: 7, changed: 0 },
      { new: 0, unchanged: 2, changed: 0 },
    ]);
    expect(await readFile(dataFile(), 'utf8')).toBe(after);
  });

  it('writes only what a later, overlapping export adds', async () => {
    await runImport(signedExport(), { ...SIGNED, write: true });
    const later = [
      ['2026-06-09', '2026-06-09', '-5.00', 'EUR', 'DISPOSIZIONE DI PAGAMENTO', 'Payment to Shop', '1004.59'],
      ...signedRows().slice(0, 3),
    ];
    const { plan } = await runImport(signedExport(later), { ...SIGNED, write: true });
    expect(plan.accounts[0]).toMatchObject({ counts: { new: 1, unchanged: 3, changed: 0 }, opening: null, check: { difference: 0 } });

    const bank = await accountNamed('Main bank');
    expect(await movementsOf(bank.id)).toHaveLength(6);
    expect(await store.getObservations({ accountId: bank.id })).toHaveLength(1);
    expect(await valueOn(bank.id, '2026-06-09')).toBe(100459);
  });

  it('keeps two identical charges of one day as two, through a re-import of the file re-ordered', async () => {
    await runImport(signedExport(), { ...SIGNED, write: true });
    const { plan } = await runImport(signedExport([...signedRows()].reverse()), { ...SIGNED, write: true });
    expect(plan.accounts[0].counts).toEqual({ new: 0, unchanged: 5, changed: 0 });
    const fees = (await movementsOf((await accountNamed('Main bank')).id)).filter((movement) => movement.description === 'Monthly card fee');
    expect(fees).toHaveLength(2);
  });

  it("leaves your zone alone when a re-import changes the source's", async () => {
    await runImport(typedExport(), { ...TYPED, write: true });
    const account = await accountNamed('Second bank');
    const [category] = (await store.getProfile()).financeCategories;
    const pizza = (await movementsOf(account.id)).find((movement) => movement.description === 'Pizza Place');
    if (pizza === undefined) throw new Error('no pizza');
    await store.updateTransaction(pizza.id, {
      categoryId: category.id, note: 'with the team', tags: ['work'], notCounted: true, countedOver: { from: '2026-01', to: '2026-03' },
    });

    const rows = typedRows();
    rows[0] = [...rows[0]];
    rows[0][3] = '-13.50';
    rows[0][7] = 'Pizza Place Centro';
    const { plan } = await runImport(typedExport(rows), { ...TYPED, write: true });
    expect(plan.accounts[0].counts).toEqual({ new: 0, unchanged: 2, changed: 1 });

    const after = await store.getTransaction(pizza.id);
    expect(after).toMatchObject({
      amount: -1350,
      description: 'Pizza Place Centro',
      categoryId: category.id,
      note: 'with the team',
      tags: ['work'],
      notCounted: true,
      // The months it is counted over are yours too (ADR 0052).
      countedOver: { from: '2026-01', to: '2026-03' },
      origin: { source: 'statement', externalId: account.id + ':id:MOV-0003', detail: { category: 'Restaurants', counterparty: 'Pizza Place' } },
    });
    expect(await movementsOf(account.id)).toHaveLength(3);
  });

  it('takes a cleaned-up name in a later card export as a change, not a new movement', async () => {
    await runImport(cardExport(), { ...CARD, write: true });
    const renamed = csv(CARD_HEADER, [cardRow({ at: '2026-05-02 12:00:00', merchant: 'BOOKS LTD', clean: 'Books Ltd', importo: '15.00', categoria: 'Shopping', sotto: 'Books', fx: '0.30', cashback: '0.15' })]);
    const { plan } = await runImport(renamed, { ...CARD, write: true });
    expect(plan.accounts[0].counts).toEqual({ new: 0, unchanged: 0, changed: 1 });
    const card = await accountNamed('Card');
    expect((await movementsOf(card.id)).map((movement) => movement.description).sort()).toEqual(['BOOKS LTD', 'Books Ltd', 'Coffee Bar', 'Coffee Bar']);
  });

  it('writes no balance for a statement that carries none, and the account stays unknown', async () => {
    await runImport(typedExport(), { ...TYPED, write: true });
    const account = await accountNamed('Second bank');
    expect(await store.getObservations({ accountId: account.id })).toEqual([]);
    expect(await valueOn(account.id, '2026-07-03')).toBeNull();
  });

  it('is refused, writing nothing and taking no backup, while anything blocks', async () => {
    await store.resetToSeed();
    const before = await readFile(dataFile(), 'utf8');
    const backups = async () => (await readdir(sandbox)).filter((name) => name.includes('statement-import')).length;
    const backupsBefore = await backups();
    await expect(runImport(signedExport(), { ...SIGNED, write: true })).rejects.toThrow(/demo finance rows/);
    expect(await readFile(dataFile(), 'utf8')).toBe(before);
    expect(await backups()).toBe(backupsBefore);
  });
});

describe("the bank's detail on an origin", () => {
  it('is flat text, checked at the store', async () => {
    const account = await store.createAccount({ name: 'A', kind: 'cash', currency: 'EUR' });
    const draft = { accountId: account.id, date: '2026-01-01', amount: -100, currency: 'EUR', description: 'x' };
    await expect(
      store.upsertTransactionByOrigin({ ...draft, origin: { source: 'statement', externalId: 'a:1', detail: { category: 3 } } })
    ).rejects.toThrow(/origin\.detail\.category must be text/);
    await expect(
      store.upsertTransactionByOrigin({ ...draft, origin: { source: 'statement', externalId: 'a:1', detail: { 'not a word': 'x' } } })
    ).rejects.toThrow(/keys are short words/);
    const saved = await store.upsertTransactionByOrigin({ ...draft, origin: { source: 'statement', externalId: 'a:1', detail: { category: 'Food' } } });
    expect(saved.origin?.detail).toEqual({ category: 'Food' });
  });
});

describe('the command line', () => {
  it('reads the file, the format, the accounts and --write', () => {
    expect(script.parseArgs(['s.csv', '--format', 'revolut', '--account', 'Revolut', '--account-for', 'Deposito=Revolut deposit', '--write'])).toEqual({
      csvPath: 's.csv',
      format: 'revolut',
      account: 'Revolut',
      accountFor: { Deposito: 'Revolut deposit' },
      write: true,
    });
  });

  it('refuses what it does not understand', () => {
    expect(() => script.parseArgs(['s.csv', '--dry'])).toThrow(/unknown option --dry/);
    expect(() => script.parseArgs(['s.csv', '--account-for', 'Deposito'])).toThrow(/<product>="<account name>"/);
    expect(() => script.parseArgs(['s.csv', '--account'])).toThrow(/needs a value/);
    expect(() => script.parseArgs([])).toThrow(/one statement file/);
  });
});
