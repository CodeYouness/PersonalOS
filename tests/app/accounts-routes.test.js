/**
 * /api/accounts and /api/accounts/[id]/observations -- adding an account and
 * recording its balance from the Finances screen (#114). The real routes
 * against a sandboxed store; every assertion read back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/accounts/route.js')} */
let accountsRoute;
/** @type {typeof import('@/app/api/accounts/[id]/observations/route.js')} */
let observationsRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-accounts-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  accountsRoute = await import('@/app/api/accounts/route.js');
  observationsRoute = await import('@/app/api/accounts/[id]/observations/route.js');
  store = await import('@/lib/store.js');
  dates = await import('@/lib/domain/dates.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {unknown} body */
function json(body) {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
}

/** @param {unknown} body */
function addAccount(body) {
  return accountsRoute.POST(new Request('http://localhost/api/accounts', json(body)));
}

/** @param {string} id @param {unknown} body */
function recordBalance(id, body) {
  return observationsRoute.POST(new Request('http://localhost/api/accounts/' + id + '/observations', json(body)), {
    params: Promise.resolve({ id }),
  });
}

const CAR_LOAN = 'account_seed_carloan';
const CURRENT = 'account_seed_current';

describe('POST /api/accounts', () => {
  it('adds an account with a name and a kind, in EUR, with no value yet', async () => {
    const response = await addAccount({ name: 'Pension fund', kind: 'investment' });
    const { account } = await response.json();

    expect(response.status).toBe(200);
    const stored = (await store.getAccounts()).find((row) => row.id === account.id);
    expect(stored).toMatchObject({ name: 'Pension fund', kind: 'investment', currency: 'EUR', source: 'user' });
    expect(await store.getObservations({ accountId: account.id })).toEqual([]);
  });

  it.each([
    ['a blank name', { name: ' ', kind: 'cash' }],
    ['an unknown kind', { name: 'Wallet', kind: 'crypto' }],
    ['a currency other than EUR', { name: 'US brokerage', kind: 'investment', currency: 'USD' }],
    ['a body that is not an object', ['Wallet']],
  ])('refuses %s', async (_label, body) => {
    const before = await store.getAccounts();

    const response = await addAccount(body);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toBeTruthy();
    expect(await store.getAccounts()).toEqual(before);
  });
});

describe('POST /api/accounts/[id]/observations', () => {
  it('records a balance on a date', async () => {
    const response = await recordBalance(CURRENT, { amount: 1300000, date: '2026-04-02' });

    expect(response.status).toBe(200);
    const balances = await store.getObservations({ accountId: CURRENT });
    expect(balances.find((row) => row.date === '2026-04-02')).toMatchObject({
      amount: 1300000, kind: 'balance', currency: 'EUR', source: 'user',
    });
  });

  it('records it today when no date is given', async () => {
    await recordBalance(CURRENT, { amount: 1300000 });

    const balances = await store.getObservations({ accountId: CURRENT });
    expect(balances.find((row) => row.amount === 1300000)?.date).toBe(dates.today());
  });

  it('records an overdraft as a negative cash balance', async () => {
    const response = await recordBalance(CURRENT, { amount: -50000, date: '2026-04-02' });

    expect(response.status).toBe(200);
  });

  it('refuses a negative liability, saying why', async () => {
    const before = await store.getObservations({ accountId: CAR_LOAN });

    const response = await recordBalance(CAR_LOAN, { amount: -700000, date: '2026-04-02' });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/positive amount owed/);
    expect(await store.getObservations({ accountId: CAR_LOAN })).toEqual(before);
  });

  it.each([
    ['a currency other than EUR', { amount: 100, date: '2026-04-02', currency: 'USD' }],
    ['a fraction of a cent', { amount: 100.5, date: '2026-04-02' }],
    ['a date that is not a day', { amount: 100, date: '2026-02-30' }],
    ['a field it does not take', { amount: 100, date: '2026-04-02', accountId: CAR_LOAN }],
  ])('refuses %s', async (_label, body) => {
    const before = await store.getObservations({});

    const response = await recordBalance(CURRENT, body);

    expect(response.status).toBe(400);
    expect(await store.getObservations({})).toEqual(before);
  });

  it('answers 404 for an account that does not exist', async () => {
    const response = await recordBalance('account_nope', { amount: 100, date: '2026-04-02' });

    expect(response.status).toBe(404);
  });
});
