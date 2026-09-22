/**
 * The habit management routes (#38): POST /api/habits,
 * PATCH /api/habits/[id] and PUT /api/habits/order, tested the same way
 * tests/app/habits-log-route.test.js tests the tick route.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/habits/route.js')} */
let collection;
/** @type {typeof import('@/app/api/habits/[id]/route.js')} */
let item;
/** @type {typeof import('@/app/api/habits/order/route.js')} */
let order;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-habits-routes-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  collection = await import('@/app/api/habits/route.js');
  item = await import('@/app/api/habits/[id]/route.js');
  order = await import('@/app/api/habits/order/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/**
 * @param {string} url
 * @param {string} method
 * @param {unknown} body
 */
function request(url, method, body) {
  return new Request('http://localhost' + url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** @param {unknown} body */
const post = (body) => collection.POST(request('/api/habits', 'POST', body));

/**
 * @param {string} id
 * @param {unknown} body
 */
const patch = (id, body) =>
  item.PATCH(request('/api/habits/' + id, 'PATCH', body), { params: Promise.resolve({ id }) });

/** @param {unknown} body */
const put = (body) => order.PUT(request('/api/habits/order', 'PUT', body));

/** @returns {Promise<import('@/lib/domain/types.js').Habit[]>} */
const habits = async () => (await store.getProfile()).habits;

describe('POST /api/habits', () => {
  it('creates a check habit', async () => {
    const response = await post({ label: 'Stretch before bed', type: 'check', target: null });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.habit.label).toBe('Stretch before bed');
    expect((await habits()).some((habit) => habit.id === body.habit.id)).toBe(true);
  });

  it('creates a counter habit with its target', async () => {
    const response = await post({ label: 'Pages read', type: 'counter', target: 20 });
    expect((await response.json()).habit.target).toBe(20);
  });

  it('rejects a bad label, type or target', async () => {
    expect((await post({ label: '   ', type: 'check', target: null })).status).toBe(400);
    expect((await post({ label: 'X', type: 'bogus', target: null })).status).toBe(400);
    expect((await post({ label: 'X', type: 'counter', target: 0 })).status).toBe(400);
    expect((await post({ label: 'X', type: 'check', target: 5 })).status).toBe(400);
  });

  it('rejects a malformed body', async () => {
    const response = await collection.POST(
      new Request('http://localhost/api/habits', { method: 'POST', body: 'not json' })
    );
    expect(response.status).toBe(400);
  });
});

describe('PATCH /api/habits/[id]', () => {
  it('renames a habit and changes a counter target', async () => {
    expect((await patch('habit_move', { label: 'Move for 45 minutes' })).status).toBe(200);
    expect((await patch('habit_water', { target: 10 })).status).toBe(200);

    const saved = await habits();
    expect(saved.find((habit) => habit.id === 'habit_move')?.label).toBe('Move for 45 minutes');
    expect(saved.find((habit) => habit.id === 'habit_water')?.target).toBe(10);
  });

  it('rejects a change of type', async () => {
    const response = await patch('habit_move', { type: 'counter' });
    expect(response.status).toBe(400);
    expect((await habits()).find((habit) => habit.id === 'habit_move')?.type).toBe('check');
  });

  it('rejects a bad label or target and an unknown habit', async () => {
    expect((await patch('habit_move', { label: '  ' })).status).toBe(400);
    expect((await patch('habit_water', { target: 0 })).status).toBe(400);
    expect((await patch('habit_move', { target: 4 })).status).toBe(400);
    expect((await patch('habit_nope', { label: 'X' })).status).toBe(400);
  });

  it('archives and restores, leaving two periods', async () => {
    expect((await patch('habit_move', { archived: true })).status).toBe(200);
    expect((await patch('habit_move', { archived: false })).status).toBe(200);

    const periods = (await habits()).find((habit) => habit.id === 'habit_move')?.periods ?? [];
    expect(periods).toHaveLength(2);
    expect(periods[1].to).toBe(null);
  });
});

describe('PUT /api/habits/order', () => {
  it('reorders to an exact permutation', async () => {
    const ids = (await habits()).map((habit) => habit.id).reverse();
    const response = await put({ ids });

    expect(response.status).toBe(200);
    expect((await habits()).map((habit) => habit.id)).toEqual(ids);
  });

  it('rejects an order that is not a permutation', async () => {
    const ids = (await habits()).map((habit) => habit.id);
    expect((await put({ ids: ids.slice(1) })).status).toBe(400);
    expect((await put({ ids: [...ids, 'habit_nope'] })).status).toBe(400);
    expect((await put({ ids: 'not-an-array' })).status).toBe(400);
    expect((await put({})).status).toBe(400);
  });
});
