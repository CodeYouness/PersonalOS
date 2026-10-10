/**
 * /api/finance-settings -- the Finances screen's settings (#138): "tracked
 * since". The real route against a sandboxed store; every assertion read
 * back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/finance-settings/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-finance-settings-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/finance-settings/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {unknown} body */
function change(body) {
  return route.PATCH(
    new Request('http://localhost/api/finance-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

describe('PATCH /api/finance-settings', () => {
  it('sets "tracked since" and clears it', async () => {
    expect((await change({ financeTrackedSince: '2025-11-03' })).status).toBe(200);
    expect((await store.getProfile()).financeTrackedSince).toBe('2025-11-03');

    expect((await change({ financeTrackedSince: null })).status).toBe(200);
    expect((await store.getProfile()).financeTrackedSince).toBeNull();
  });

  it('sets the default account and clears it (ADR 0026)', async () => {
    expect((await change({ defaultAccountId: 'account_seed_current' })).status).toBe(200);
    expect((await store.getProfile()).defaultAccountId).toBe('account_seed_current');

    expect((await change({ defaultAccountId: null })).status).toBe(200);
    expect((await store.getProfile()).defaultAccountId).toBeNull();
  });

  it.each([
    ['a default account valued by units', { defaultAccountId: 'account_seed_etf' }, /balance/],
    ['a day that is not a day', { financeTrackedSince: '2025-02-30' }, /financeTrackedSince/],
    ['a day after today', { financeTrackedSince: '2999-01-01' }, /after today/],
    ['a setting it does not hold', { name: 'Someone else' }, /name/],
    ['nothing to change', {}, /nothing/],
    ['a body that is not a JSON object', '[1]', /JSON object/],
  ])('refuses %s, changing nothing', async (_label, body, reason) => {
    const before = await store.getProfile();

    const response = await change(body);

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(reason);
    expect(await store.getProfile()).toEqual(before);
  });
});
