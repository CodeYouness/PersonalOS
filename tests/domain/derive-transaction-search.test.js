/**
 * Searching the movements by text (ADR 0058): the Transactions card's search
 * field finds, over all time, the movements whose words or amount match what
 * was typed -- case and accents ignored, an amount typed as a person types
 * it. Every row here is invented.
 */

import { describe, expect, it } from 'vitest';

import { amountQuery, foldText, searchTransactions, transactionMatches } from '@/lib/domain/derive/search.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: 'expense', parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_home', name: 'Maison' }),
  category({ id: 'cat_furniture', name: 'Meubles', parentId: 'cat_home' }),
  category({ id: 'cat_cafe', name: 'Café' }),
];
/** @returns {any} */
const account = (/** @type {any} */ o) => ({ kind: 'cash', currency: 'EUR', ...o });
const accounts = [account({ id: 'account_a', name: 'Everyday' }), account({ id: 'account_b', name: 'Rainy day pot' })];
const context = { categories, accounts };

/** @returns {Transaction} */
const transaction = (/** @type {any} */ o) => ({
  id: 'tx', date: '2026-03-02', amount: -1250, currency: 'EUR', description: '', accountId: 'account_a',
  counterAccountId: null, categoryId: null, notCounted: false, countedOver: null, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user', ...o,
});

describe('folding text to compare it (foldText)', () => {
  it('drops case, accents and repeated spaces', () => {
    expect(foldText('  Crème   BRÛLÉE ')).toBe('creme brulee');
    expect(foldText('Ångström Ça')).toBe('angstrom ca');
  });
});

describe('an amount typed as a person types it (amountQuery)', () => {
  it('reads whole units and cents with a point or a comma', () => {
    expect(amountQuery('12.50')).toBe(1250);
    expect(amountQuery('12,50')).toBe(1250);
    expect(amountQuery('12,5')).toBe(1250);
    expect(amountQuery('250')).toBe(25000);
    expect(amountQuery('0.99')).toBe(99);
  });

  it('reads a thousands separator, either way round, and ignores a sign or the euro', () => {
    expect(amountQuery('1.250,00')).toBe(125000);
    expect(amountQuery('1,250.00')).toBe(125000);
    expect(amountQuery('1.250')).toBe(125000);
    expect(amountQuery('−12.50')).toBe(1250);
    expect(amountQuery('-12.50')).toBe(1250);
    expect(amountQuery('+12.50')).toBe(1250);
    expect(amountQuery('€12.50')).toBe(1250);
    expect(amountQuery('12.50€')).toBe(1250);
  });

  it('is no amount for words, three decimals out of place, or nothing', () => {
    expect(amountQuery('lunch')).toBeNull();
    expect(amountQuery('12.5.0')).toBeNull();
    expect(amountQuery('12.')).toBeNull();
    expect(amountQuery('1,2345')).toBeNull();
    expect(amountQuery('')).toBeNull();
    expect(amountQuery('0')).toBeNull();
  });
});

describe('what a movement matches (transactionMatches)', () => {
  it('matches its description, ignoring case and accents', () => {
    const lunch = transaction({ description: 'Déjeuner au Marché' });
    expect(transactionMatches(lunch, 'marche', context)).toBe(true);
    expect(transactionMatches(lunch, 'DEJEUNER', context)).toBe(true);
    expect(transactionMatches(lunch, 'dinner', context)).toBe(false);
  });

  it('matches its note and its tags', () => {
    const row = transaction({ description: 'Card 1234', note: 'Birthday present for a cousin', tags: ['spring trip'] });
    expect(transactionMatches(row, 'birthday', context)).toBe(true);
    expect(transactionMatches(row, 'spring trip', context)).toBe(true);
  });

  it('matches its category by name and its parent by name', () => {
    const chair = transaction({ description: 'Chair', categoryId: 'cat_furniture' });
    expect(transactionMatches(chair, 'meubles', context)).toBe(true);
    expect(transactionMatches(chair, 'maison', context)).toBe(true);
    expect(transactionMatches(transaction({ categoryId: 'cat_cafe' }), 'cafe', context)).toBe(true);
  });

  it('matches the account it is on, and the other end of a transfer', () => {
    const moved = transaction({ description: 'Put aside', counterAccountId: 'account_b' });
    expect(transactionMatches(moved, 'everyday', context)).toBe(true);
    expect(transactionMatches(moved, 'rainy', context)).toBe(true);
    expect(transactionMatches(transaction({}), 'rainy', context)).toBe(false);
  });

  it('wants every word somewhere, each on any field', () => {
    const row = transaction({ description: 'Bakery', categoryId: 'cat_cafe' });
    expect(transactionMatches(row, 'bakery café', context)).toBe(true);
    expect(transactionMatches(row, 'bakery pharmacy', context)).toBe(false);
  });

  it('matches an amount exactly, whichever way the money moved', () => {
    expect(transactionMatches(transaction({ amount: -1250 }), '12,50', context)).toBe(true);
    expect(transactionMatches(transaction({ amount: 1250 }), '12.50', context)).toBe(true);
    expect(transactionMatches(transaction({ amount: -25000 }), '250', context)).toBe(true);
    expect(transactionMatches(transaction({ amount: -250 }), '250', context)).toBe(false);
    expect(transactionMatches(transaction({ amount: -1251 }), '12.50', context)).toBe(false);
  });

  it('takes an amount beside a word: both must hold', () => {
    const row = transaction({ description: 'Bakery', amount: -1250 });
    expect(transactionMatches(row, 'bakery 12.50', context)).toBe(true);
    expect(transactionMatches(row, 'bakery 13', context)).toBe(false);
  });

  it('matches a number written in the description as text too', () => {
    expect(transactionMatches(transaction({ description: 'Order 250 from the shop', amount: -999 }), '250', context)).toBe(true);
  });

  it('matches nothing on an empty query', () => {
    expect(transactionMatches(transaction({ description: 'Bakery' }), '   ', context)).toBe(false);
  });
});

describe('the movements a search finds (searchTransactions)', () => {
  it('keeps the order it is handed, newest first, over every month, refunded and not counted alike', () => {
    const rows = [
      transaction({ id: 'tx_3', date: '2026-05-01', description: 'Bakery' }),
      transaction({ id: 'tx_2', date: '2025-11-20', description: 'Pharmacy' }),
      transaction({ id: 'tx_1', date: '2024-01-03', description: 'bakery', notCounted: true }),
    ];
    expect(searchTransactions(rows, 'BAKERY', context).map((row) => row.id)).toEqual(['tx_3', 'tx_1']);
  });

  it('finds nothing for an empty query', () => {
    expect(searchTransactions([transaction({ description: 'Bakery' })], '', context)).toEqual([]);
  });
});
