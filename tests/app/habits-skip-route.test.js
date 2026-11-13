/**
 * PUT /api/habits/skip (ADR 0037), tested the way habits-log-route.test.js
 * tests the habit-day value beside it.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/habits/skip/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-habits-skip-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/habits/skip/route.js');
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
function put(body) {
  return route.PUT(
    new Request('http://localhost/api/habits/skip', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('PUT /api/habits/skip', () => {
  it('gives yesterday\'s habit its reason and answers with the day\'s reasons as saved', async () => {
    const yesterday = dates.shiftDayKey(dates.today(), -1);
    const response = await put({ date: yesterday, habitId: 'habit_move', reason: 'forgotten' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, skips: { habit_move: 'forgotten' } });
    expect((await store.getDailyLog(yesterday)).skips).toEqual({ habit_move: 'forgotten' });
  });

  it('clears a reason with null', async () => {
    const yesterday = dates.shiftDayKey(dates.today(), -1);
    await put({ date: yesterday, habitId: 'habit_move', reason: 'paused' });
    const response = await put({ date: yesterday, habitId: 'habit_move', reason: null });

    expect(response.status).toBe(200);
    expect((await response.json()).skips).toEqual({});
    expect((await store.getDailyLog(yesterday)).skips).toEqual({});
  });

  it('reports the store\'s refusal of a habit already kept that day', async () => {
    const yesterday = dates.shiftDayKey(dates.today(), -1);
    await store.logHabitValue({ date: yesterday, habitId: 'habit_move', value: true });
    const response = await put({ date: yesterday, habitId: 'habit_move', reason: 'forgotten' });

    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe('error');
  });

  it('reports an error for a future day, an unknown habit and an unknown reason', async () => {
    const tomorrow = dates.shiftDayKey(dates.today(), 1);
    expect((await put({ date: tomorrow, habitId: 'habit_move', reason: 'forgotten' })).status).toBe(400);
    expect((await put({ date: dates.today(), habitId: 'habit_nope', reason: 'forgotten' })).status).toBe(400);
    expect((await put({ date: dates.today(), habitId: 'habit_move', reason: 'tired' })).status).toBe(400);
  });

  it('refuses a body missing the reason, or naming anything else, writing nothing', async () => {
    const yesterday = dates.shiftDayKey(dates.today(), -1);
    expect((await put({ date: yesterday, habitId: 'habit_move' })).status).toBe(400);
    expect((await put({ date: yesterday, habitId: 'habit_move', reason: 'forgotten', value: true })).status).toBe(400);
    expect((await put(['forgotten'])).status).toBe(400);
    expect((await store.getDailyLog(yesterday)).skips).toEqual({});
    expect((await store.getDailyLog(yesterday)).habits).toEqual({});
  });

  it('reports an error for a malformed body', async () => {
    const response = await route.PUT(
      new Request('http://localhost/api/habits/skip', { method: 'PUT', body: 'not json' })
    );
    expect(response.status).toBe(400);
  });
});
