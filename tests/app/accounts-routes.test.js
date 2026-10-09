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
/** @type {typeof import('@/app/api/accounts/[id]/route.js')} */
let accountRoute;
/** @type {typeof import('@/app/api/observations/[id]/route.js')} */
let observationRoute;
/** @type {typeof import('@/app/api/accounts/[id]/trades/route.js')} */
let tradesRoute;
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
  accountRoute = await import('@/app/api/accounts/[id]/route.js');
  observationRoute = await import('@/app/api/observations/[id]/route.js');
  tradesRoute = await import('@/app/api/accounts/[id]/trades/route.js');
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

/**
 * @param {{ PATCH: Function, DELETE: Function }} handler
 * @param {string} url
 * @param {string} id
 * @param {unknown} [body] PATCH with this body; DELETE without one
 * @returns {Promise<Response>}
 */
function send(handler, url, id, body) {
  const context = { params: Promise.resolve({ id }) };
  if (body === undefined) return handler.DELETE(new Request(url + id, { method: 'DELETE' }), context);
  return handler.PATCH(new Request(url + id, { ...json(body), method: 'PATCH' }), context);
}

/** @param {string} id @param {unknown} [body] */
const account = (id, body) => send(accountRoute, 'http://localhost/api/accounts/', id, body);
/** @param {string} id @param {unknown} [body] */
const balance = (id, body) => send(observationRoute, 'http://localhost/api/observations/', id, body);

/** @param {string} id @param {unknown} body */
function recordTrade(id, body) {
  return tradesRoute.POST(new Request('http://localhost/api/accounts/' + id + '/trades', json(body)), {
    params: Promise.resolve({ id }),
  });
}

const UNIT = 100_000_000;
const ETF = 'account_seed_etf';
const CAR_LOAN = 'account_seed_carloan';
const CAR_LOAN_BALANCE = 'observation_seed_4';
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

describe('PATCH /api/accounts/[id]', () => {
  it('renames an account', async () => {
    const response = await account(CAR_LOAN, { name: 'Car loan (Santander)' });

    expect(response.status).toBe(200);
    expect((await store.getAccount(CAR_LOAN))?.name).toBe('Car loan (Santander)');
  });

  it('archives an account: it keeps its balances and leaves the table', async () => {
    const before = await store.getObservations({ accountId: CAR_LOAN });

    const response = await account(CAR_LOAN, { archived: true });

    expect(response.status).toBe(200);
    expect((await store.getAccount(CAR_LOAN))?.archivedOn).toBe(dates.today());
    expect(await store.getObservations({ accountId: CAR_LOAN })).toEqual(before);
  });

  it.each([
    ['a blank name', { name: '' }],
    ['a field it does not edit', { kind: 'cash' }],
    ['an edit that changes nothing', {}],
  ])('refuses %s', async (_label, body) => {
    const before = await store.getAccount(CAR_LOAN);

    const response = await account(CAR_LOAN, body);

    expect(response.status).toBe(400);
    expect(await store.getAccount(CAR_LOAN)).toEqual(before);
  });

  it('answers 404 for an account that does not exist', async () => {
    expect((await account('account_nope', { name: 'x' })).status).toBe(404);
  });
});

describe('DELETE /api/accounts/[id]', () => {
  it('removes the account with its balances and links', async () => {
    const [task] = await store.getTasks();
    await store.createLink({ from: task.id, to: CAR_LOAN, rel: 'about' });

    const response = await account(CAR_LOAN);

    expect(response.status).toBe(200);
    expect(await store.getAccount(CAR_LOAN)).toBeNull();
    expect(await store.getObservations({ accountId: CAR_LOAN })).toEqual([]);
    expect(await store.getLinks({ to: CAR_LOAN })).toEqual([]);
  });

  it('refuses an account that transactions belong to, and keeps it', async () => {
    const response = await account(CURRENT);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/archive/);
    expect(await store.getAccount(CURRENT)).not.toBeNull();
  });

  it('answers 404 for an account that does not exist', async () => {
    expect((await account('account_nope')).status).toBe(404);
  });
});

describe('PATCH /api/observations/[id]', () => {
  it('corrects a balance\'s amount and date', async () => {
    const response = await balance(CAR_LOAN_BALANCE, { amount: 700000, date: '2026-01-04' });

    expect(response.status).toBe(200);
    const [stored] = await store.getObservations({ accountId: CAR_LOAN });
    expect(stored).toMatchObject({ amount: 700000, date: '2026-01-04' });
  });

  it.each([
    ['a debt corrected to a negative amount', { amount: -700000 }],
    ['a fraction of a cent', { amount: 1.5 }],
    ['a move to another account', { accountId: CURRENT }],
    ['an edit that changes nothing', {}],
  ])('refuses %s', async (_label, body) => {
    const before = await store.getObservations({});

    const response = await balance(CAR_LOAN_BALANCE, body);

    expect(response.status).toBe(400);
    expect(await store.getObservations({})).toEqual(before);
  });

  it('answers 404 for a balance that does not exist', async () => {
    expect((await balance('observation_nope', { amount: 1 })).status).toBe(404);
  });
});

describe('DELETE /api/observations/[id]', () => {
  it('deletes a balance; the account goes back to unknown', async () => {
    const response = await balance(CAR_LOAN_BALANCE);

    expect(response.status).toBe(200);
    expect(await store.getObservations({ accountId: CAR_LOAN })).toEqual([]);
    expect(await store.getAccount(CAR_LOAN)).not.toBeNull();
  });

  it('answers 404 for a balance that does not exist', async () => {
    expect((await balance('observation_nope')).status).toBe(404);
  });
});

describe('holdings', () => {
  it('adds an investment valued by units', async () => {
    const response = await addAccount({ name: 'Bitcoin', kind: 'investment', valuation: 'units' });
    const { account: created } = await response.json();

    expect(response.status).toBe(200);
    expect((await store.getAccount(created.id))?.valuation).toBe('units');
  });

  it('refuses units on an account that is not an investment', async () => {
    const response = await addAccount({ name: 'Wallet', kind: 'cash', valuation: 'units' });

    expect(response.status).toBe(400);
  });

  it('records a buy with its date, units, price per unit and fee', async () => {
    const response = await recordTrade(ETF, {
      date: '2026-02-02', direction: 'buy', units: 2.5 * UNIT, price: 11050, fee: 100,
    });

    expect(response.status).toBe(200);
    const trades = await store.getTrades({ accountId: ETF });
    expect(trades.find((t) => t.date === '2026-02-02')).toMatchObject({
      direction: 'buy', units: 2.5 * UNIT, price: 11050, fee: 100, currency: 'EUR', source: 'user',
    });
  });

  it('records a sell, and refuses one that would take the units below zero', async () => {
    expect((await recordTrade(ETF, { date: '2026-02-02', direction: 'sell', units: 5 * UNIT, price: 11000 })).status).toBe(200);

    const before = await store.getTrades({ accountId: ETF });
    const response = await recordTrade(ETF, { date: '2026-02-03', direction: 'sell', units: 21 * UNIT, price: 11000 });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/below zero/);
    expect(await store.getTrades({ accountId: ETF })).toEqual(before);
  });

  it('refuses a balance on a holding and a trade on an account valued by balance', async () => {
    expect((await recordBalance(ETF, { amount: 100, date: '2026-02-02' })).status).toBe(400);
    expect((await recordTrade(CURRENT, { date: '2026-02-02', direction: 'buy', units: UNIT, price: 1 })).status).toBe(400);
  });

  it.each([
    ['a currency other than EUR', { currency: 'USD' }],
    ['a fraction of a 10^-8 unit', { units: 0.5 }],
    ['a fraction of a cent', { price: 10.5 }],
    ['a field it does not take', { accountId: CURRENT }],
  ])('refuses a trade with %s', async (_label, extra) => {
    const response = await recordTrade(ETF, { date: '2026-02-02', direction: 'buy', units: UNIT, price: 100, ...extra });

    expect(response.status).toBe(400);
  });

  it('answers 404 for a trade on an account that does not exist', async () => {
    expect((await recordTrade('account_nope', { date: '2026-02-02', direction: 'buy', units: 1, price: 1 })).status).toBe(404);
  });

  it('changes the valuation of an account with no data, and refuses it once there is some', async () => {
    const { account: fresh } = await (await addAccount({ name: 'Pension', kind: 'investment' })).json();

    expect((await account(fresh.id, { valuation: 'units' })).status).toBe(200);
    expect((await store.getAccount(fresh.id))?.valuation).toBe('units');

    const response = await account(ETF, { valuation: 'balance' });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/valuation/);
  });

  it('deletes a holding with its trades', async () => {
    expect((await account(ETF)).status).toBe(200);
    expect(await store.getTrades({ accountId: ETF })).toEqual([]);
  });
});
