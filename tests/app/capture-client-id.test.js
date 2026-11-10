/**
 * A resent capture is filed once (ADR 0033). No model is configured: the
 * rules answer.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/capture/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-client-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.USER_TIMEZONE = 'Europe/Rome';
  delete process.env.ANTHROPIC_API_KEY;
  route = await import('@/app/api/capture/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/**
 * @param {string} text
 * @param {Record<string, unknown>} [extra]
 */
function post(text, extra = {}) {
  return route.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, ...extra }),
    })
  );
}

describe('POST /api/capture with clientId', () => {
  it('answers a resent sentence with the first receipt and files nothing more', async () => {
    await store.updateProfile({ defaultAccountId: 'account_seed_current' });
    const firstBody = await (await post('paid 12 euro for lunch', { origin: 'shortcut', clientId: 'resend-1' })).json();
    const counts = async () => ({
      captures: (await store.getCaptures()).length,
      memory: (await store.getMemoryEntries()).length,
      transactions: (await store.getTransactions()).length,
    });
    const before = await counts();

    const again = await post('paid 12 euro for lunch', { origin: 'shortcut', clientId: 'resend-1' });

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(firstBody);
    expect(await counts()).toEqual(before);
  });

  it('answers a resent weight with its note, and a resent task with its record', async () => {
    const weight = await (await post('weighed 74,6kg', { origin: 'shortcut', clientId: 'resend-2' })).json();
    expect(weight.note).toBe('74.6 kg');
    expect(await (await post('weighed 74,6kg', { origin: 'shortcut', clientId: 'resend-2' })).json()).toEqual(weight);
    const task = await (await post('call Marta', { origin: 'shortcut', clientId: 'resend-3' })).json();
    expect(task.recordId).not.toBeNull();
    expect(await (await post('call Marta', { origin: 'shortcut', clientId: 'resend-3' })).json()).toEqual(task);
  });

  it('files the same clientId under another origin as a new capture', async () => {
    await post('call Marta', { origin: 'shortcut', clientId: 'resend-4' });
    await post('call Marta', { origin: 'bar', clientId: 'resend-4' });
    expect((await store.getCaptures()).filter((c) => c.clientId === 'resend-4')).toHaveLength(2);
  });

  it('names the day on the receipt line when it was said another day, and only then', async () => {
    const old = await (await post('call Marta', { origin: 'shortcut', saidAt: '2020-03-04T10:00:00Z' })).json();
    expect(old.saidOn).toBe('2020-03-04');
    expect(old.receiptLine).toMatch(/ · said 2020-03-04$/);
    const now = await (await post('call Anna', { origin: 'shortcut' })).json();
    expect(now.receiptLine).toBe('task · Filed “call Anna”');
  });

  it('never merges sentences without a clientId', async () => {
    await post('call Marta');
    await post('call Marta');
    expect((await store.getCaptures()).filter((c) => c.text === 'call Marta')).toHaveLength(2);
  });

  it.each([[5], [''], ['x'.repeat(201)]])('refuses a malformed clientId %j with 400 and writes nothing', async (clientId) => {
    const before = await store.getCaptures();
    const response = await post('call Marta', { clientId });
    expect(response.status).toBe(400);
    expect(await store.getCaptures()).toEqual(before);
  });
});
