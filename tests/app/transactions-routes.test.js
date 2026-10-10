/**
 * /api/transactions and /api/transactions/[id] -- recording, correcting and
 * deleting a movement from the Finances screen (#134). The real routes
 * against a sandboxed store; every assertion read back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/transactions/route.js')} */
let collection;
/** @type {typeof import('@/app/api/transactions/[id]/route.js')} */
let item;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-transactions-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  collection = await import('@/app/api/transactions/route.js');
  item = await import('@/app/api/transactions/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

const CURRENT = 'account_seed_current';
const SAVINGS = 'account_seed_savings';

/** @param {string} method @param {unknown} body */
function json(method, body) {
  return { method, headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) };
}

/** @param {unknown} body */
function create(body) {
  return collection.POST(new Request('http://localhost/api/transactions', json('POST', body)));
}

/** @param {string} month */
function list(month) {
  return collection.GET(new Request('http://localhost/api/transactions?month=' + month));
}

/** @param {string} id @param {unknown} body */
function correct(id, body) {
  return item.PATCH(new Request('http://localhost/api/transactions/' + id, json('PATCH', body)), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} id */
function remove(id) {
  return item.DELETE(new Request('http://localhost/api/transactions/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /api/transactions', () => {
  it("lists a month's transactions, newest first", async () => {
    const response = await list('2026-01');

    expect(response.status).toBe(200);
    const { transactions } = await response.json();
    expect(transactions.map((/** @type {any} */ t) => t.date)).toEqual([
      '2026-01-04', '2026-01-04', '2026-01-03', '2026-01-03', '2026-01-02',
    ]);
  });

  it('lists nothing for a month with nothing in it', async () => {
    expect((await (await list('2025-07')).json()).transactions).toEqual([]);
  });

  it('refuses a month that is not YYYY-MM', async () => {
    const response = await list('January');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 'error' });
  });
});

describe('POST /api/transactions', () => {
  it('records a movement with every field it carries', async () => {
    const response = await create({
      date: '2026-04-02', amount: -1840, accountId: CURRENT, categoryId: 'cat_groceries',
      description: 'Supermarket', note: 'for the weekend', tags: ['home'], notCounted: false,
    });

    expect(response.status).toBe(200);
    const { transaction } = await response.json();
    expect(await store.getTransaction(transaction.id)).toMatchObject({
      date: '2026-04-02', amount: -1840, accountId: CURRENT, categoryId: 'cat_groceries', counterAccountId: null,
      description: 'Supermarket', note: 'for the weekend', tags: ['home'], notCounted: false, source: 'user',
    });
  });

  it('records a transfer with its counter account', async () => {
    const { transaction } = await (await create({
      date: '2026-04-02', amount: -50000, accountId: CURRENT, counterAccountId: SAVINGS,
    })).json();

    expect((await store.getTransaction(transaction.id))?.counterAccountId).toBe(SAVINGS);
  });

  it.each([
    ['a zero amount', { amount: 0 }, /zero/],
    ['a transfer to itself', { counterAccountId: CURRENT }, /itself/],
    ['a category on a transfer', { counterAccountId: SAVINGS, categoryId: 'cat_rent' }, /category/],
    ['an unknown counter account', { counterAccountId: 'account_nowhere' }, /account/],
    ['a field it does not take', { source: 'integration' }, /source/],
  ])('refuses %s, with the reason, and records nothing', async (_label, fields, reason) => {
    const before = (await store.getTransactions()).length;

    const response = await create({ date: '2026-04-02', amount: -500, accountId: CURRENT, ...fields });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe('error');
    expect(body.message).toMatch(reason);
    expect(await store.getTransactions()).toHaveLength(before);
  });

  it('refuses a movement on an account archived before its date', async () => {
    await store.updateAccount(SAVINGS, { archived: true });

    const response = await create({ date: '2099-01-01', amount: -500, accountId: SAVINGS });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/archived/);
  });

  it('refuses a body that is not a JSON object', async () => {
    expect((await create('[1]')).status).toBe(400);
  });
});

describe('PATCH /api/transactions/[id]', () => {
  it('corrects any field in place', async () => {
    const response = await correct('transaction_seed_4', {
      date: '2026-01-05', amount: -7000, description: 'Market', note: 'fish', tags: ['food'], notCounted: true, categoryId: 'cat_eating_out',
    });

    expect(response.status).toBe(200);
    expect(await store.getTransaction('transaction_seed_4')).toMatchObject({
      date: '2026-01-05', amount: -7000, description: 'Market', note: 'fish', tags: ['food'], notCounted: true, categoryId: 'cat_eating_out',
    });
  });

  it('turns a movement into a transfer by choosing its counter account', async () => {
    await correct('transaction_seed_4', { counterAccountId: SAVINGS });

    expect(await store.getTransaction('transaction_seed_4')).toMatchObject({ counterAccountId: SAVINGS, categoryId: null });
  });

  it('refuses what the store refuses, leaving the transaction as it was', async () => {
    const before = await store.getTransaction('transaction_seed_5');

    const response = await correct('transaction_seed_5', { categoryId: 'cat_rent' });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/category/);
    expect(await store.getTransaction('transaction_seed_5')).toEqual(before);
  });

  it('refuses a field it does not edit, and an empty patch', async () => {
    expect((await correct('transaction_seed_4', { origin: null })).status).toBe(400);
    expect((await correct('transaction_seed_4', {})).status).toBe(400);
  });

  it('answers 404 for a transaction that does not exist', async () => {
    expect((await correct('transaction_nowhere', { note: 'x' })).status).toBe(404);
  });
});

describe('DELETE /api/transactions/[id]', () => {
  it('deletes a transaction', async () => {
    const response = await remove('transaction_seed_4');

    expect(response.status).toBe(200);
    expect(await store.getTransaction('transaction_seed_4')).toBeNull();
  });

  it('answers 404 for a transaction that does not exist', async () => {
    expect((await remove('transaction_nowhere')).status).toBe(404);
  });
});
