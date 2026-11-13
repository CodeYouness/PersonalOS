/**
 * PUT /api/days/[date]: give a day its mood and energy, or clear either
 * (#243, ADR 0037), and declare its time against areas, nothing, or clear it.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { limits } from '@/personalos.config.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/days/[date]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-days-route-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/days/[date]/route.js');
  store = await import('@/lib/store.js');
  dates = await import('@/lib/domain/dates.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/**
 * @param {string} date
 * @param {unknown} body
 */
function put(date, body) {
  return route.PUT(
    new Request('http://localhost/api/days/' + date, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ date }) }
  );
}

describe('PUT /api/days/[date]', () => {
  it('sets, changes and clears the mood of today', async () => {
    const day = dates.today();
    expect((await put(day, { mood: 4 })).status).toBe(200);
    expect((await store.getDailyLog(day)).mood).toBe(4);
    expect((await put(day, { mood: 2 })).status).toBe(200);
    expect((await store.getDailyLog(day)).mood).toBe(2);
    expect((await put(day, { mood: null })).status).toBe(200);
    expect((await store.getDailyLog(day)).mood).toBeNull();
  });

  it('sets the energy apart from the mood, and both at once', async () => {
    const day = dates.today();
    await put(day, { mood: 4 });
    const response = await put(day, { energy: 2 });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, mood: 4, energy: 2, time: null });
    expect(await (await put(day, { mood: 1, energy: 5 })).json()).toEqual({ ok: true, mood: 1, energy: 5, time: null });
    expect((await put(day, { energy: null })).status).toBe(200);
    const log = await store.getDailyLog(day);
    expect(log.mood).toBe(1);
    expect(log.energy).toBeNull();
  });

  it('refuses a bad request with 400 and writes nothing', async () => {
    const day = dates.today();
    const file = path.join(sandbox, 'personalos.json');
    await put(day, { mood: 3, energy: 3 });
    const before = await readFile(file, 'utf8');
    const bad = [
      put('2026-13-45', { mood: 3 }),
      put('not-a-day', { energy: 3 }),
      put(dates.shiftDayKey(day, 1), { mood: 3 }),
      put(day, { mood: 0 }),
      put(day, { energy: 6 }),
      put(day, { mood: 2.5 }),
      put(day, { energy: '3' }),
      // One good value does not carry a bad one: neither is written.
      put(day, { mood: 4, energy: 9 }),
      put(day, { mood: 9, energy: 4 }),
      // The old shape is not accepted, alone or beside a new field.
      put(day, { rating: 3 }),
      put(day, { mood: 4, rating: 3 }),
      put(day, {}),
      put(day, 'not json'),
      put(day, [3]),
      // Time: an unknown area, minutes off the step or the range, a bad shape.
      put(day, { time: { sleep: 60 } }),
      put(day, { time: { work: 45 } }),
      put(day, { time: { work: -30 } }),
      put(day, { time: { work: limits.timeAreaMaxMinutes + limits.timeStepMinutes } }),
      put(day, { time: { work: '60' } }),
      put(day, { time: { work: null } }),
      put(day, { time: [60] }),
      put(day, { time: 60 }),
      put(day, { time: 'work' }),
      // One good area does not carry a bad one, nor a good mood a bad time.
      put(day, { time: { work: 60, study: 45 } }),
      put(day, { mood: 4, time: { work: 45 } }),
      put(dates.shiftDayKey(day, 1), { time: { work: 60 } }),
      put(dates.shiftDayKey(day, 1), { time: {} }),
      put(dates.shiftDayKey(day, 1), { time: null }),
    ];
    for (const response of await Promise.all(bad)) expect(response.status).toBe(400);
    expect(await readFile(file, 'utf8')).toBe(before);
  });
});

describe('PUT /api/days/[date] with time', () => {
  it('sets each area named, absolute, keeping the others', async () => {
    const day = dates.today();
    const response = await put(day, { time: { work: 240, training: 60 } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, mood: null, energy: null, time: { work: 240, training: 60 } });
    // Sent again, the same minutes: a retry never doubles them.
    await put(day, { time: { work: 240 } });
    expect((await store.getDailyLog(day)).time).toEqual({ work: 240, training: 60 });
    await put(day, { time: { work: 0, study: 30 } });
    expect((await store.getDailyLog(day)).time).toEqual({ training: 60, study: 30 });
  });

  it('declares nothing on a day not declared, and never wipes minutes with it', async () => {
    const day = dates.today();
    expect(await (await put(day, { time: {} })).json()).toMatchObject({ ok: true, time: {} });
    await put(day, { time: { projects: 90 } });
    expect(await (await put(day, { time: {} })).json()).toMatchObject({ ok: true, time: { projects: 90 } });
  });

  it('clears the day back to not declared', async () => {
    const day = dates.today();
    await put(day, { time: { work: 60 } });
    expect(await (await put(day, { time: null })).json()).toMatchObject({ ok: true, time: null });
    expect((await store.getDailyLog(day)).time).toBeNull();
  });

  it('takes the time beside the mood and the energy', async () => {
    const day = dates.today();
    expect(await (await put(day, { mood: 3, energy: 4, time: { study: 120 } })).json()).toEqual({
      ok: true, mood: 3, energy: 4, time: { study: 120 },
    });
  });
});

describe('GET /api/days/[date]', () => {
  it('answers with the saved mood, energy and time, null for a day given none', async () => {
    const day = dates.today();
    const read = async () =>
      (await route.GET(new Request('http://localhost/api/days/' + day), { params: Promise.resolve({ date: day }) })).json();
    expect(await read()).toEqual({ ok: true, mood: null, energy: null, time: null });
    await put(day, { mood: 3 });
    expect(await read()).toEqual({ ok: true, mood: 3, energy: null, time: null });
    await put(day, { energy: 2 });
    expect(await read()).toEqual({ ok: true, mood: 3, energy: 2, time: null });
    await put(day, { time: { refereeing: 90 } });
    expect(await read()).toEqual({ ok: true, mood: 3, energy: 2, time: { refereeing: 90 } });
  });

  it('refuses a date that is not a day', async () => {
    const response = await route.GET(new Request('http://localhost/api/days/nope'), {
      params: Promise.resolve({ date: 'nope' }),
    });
    expect(response.status).toBe(400);
  });
});
