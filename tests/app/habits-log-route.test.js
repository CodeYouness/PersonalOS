/**
 * PUT /api/habits/log (#37), tested the same way
 * tests/app/captures-id-route.test.js tests the capture corrections.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/habits/log/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-habits-log-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/habits/log/route.js');
  store = await import('@/lib/store.js');
  dates = await import('@/lib/domain/dates.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {{ date?: unknown, habitId?: unknown, value?: unknown }} body */
function put(body) {
  return route.PUT(
    new Request('http://localhost/api/habits/log', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('PUT /api/habits/log', () => {
  it('logs a check habit for today', async () => {
    const response = await put({ date: dates.today(), habitId: 'habit_move', value: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect((await store.getDailyLog(dates.today())).habits).toEqual({ habit_move: true });
  });

  it('two habits logged at once both survive', async () => {
    const [a, b] = await Promise.all([
      put({ date: dates.today(), habitId: 'habit_move', value: true }),
      put({ date: dates.today(), habitId: 'habit_water', value: 3 }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const log = await store.getDailyLog(dates.today());
    expect(log.habits).toEqual({ habit_move: true, habit_water: 3 });
  });

  it('corrects a past day -- yesterday\'s check and a counter three days ago', async () => {
    const yesterday = dates.shiftDayKey(dates.today(), -1);
    const threeDaysAgo = dates.shiftDayKey(dates.today(), -3);

    expect((await put({ date: yesterday, habitId: 'habit_move', value: true })).status).toBe(200);
    expect((await put({ date: threeDaysAgo, habitId: 'habit_water', value: 6 })).status).toBe(200);

    expect((await store.getDailyLog(yesterday)).habits.habit_move).toBe(true);
    expect((await store.getDailyLog(threeDaysAgo)).habits.habit_water).toBe(6);
  });

  it('reports an error for an unknown habit', async () => {
    const response = await put({ date: dates.today(), habitId: 'habit_nope', value: true });
    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe('error');
  });

  it('reports an error for a wrong value type', async () => {
    const response = await put({ date: dates.today(), habitId: 'habit_move', value: 'yes' });
    expect(response.status).toBe(400);
  });

  it('reports an error for a future day', async () => {
    const tomorrow = dates.shiftDayKey(dates.today(), 1);
    const response = await put({ date: tomorrow, habitId: 'habit_move', value: true });
    expect(response.status).toBe(400);
  });

  it('reports an error for a day the habit was not active', async () => {
    const response = await put({ date: '2020-01-01', habitId: 'habit_move', value: true });
    expect(response.status).toBe(400);
  });

  it('reports an error for a malformed body', async () => {
    const response = await route.PUT(
      new Request('http://localhost/api/habits/log', { method: 'PUT', body: 'not json' })
    );
    expect(response.status).toBe(400);
  });
});
