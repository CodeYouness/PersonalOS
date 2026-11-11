/**
 * PUT /api/days/[date] (#243): rate a day, or clear the rating.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
  it('sets, changes and clears the rating of today', async () => {
    const day = dates.today();
    expect((await put(day, { rating: 4 })).status).toBe(200);
    expect((await store.getDailyLog(day)).rating).toBe(4);
    expect((await put(day, { rating: 2 })).status).toBe(200);
    expect((await store.getDailyLog(day)).rating).toBe(2);
    expect((await put(day, { rating: null })).status).toBe(200);
    expect((await store.getDailyLog(day)).rating).toBeNull();
  });

  it('refuses a bad request with 400 and writes nothing', async () => {
    const day = dates.today();
    const file = path.join(sandbox, 'personalos.json');
    await put(day, { rating: 3 });
    const before = await readFile(file, 'utf8');
    const bad = [
      put('2026-13-45', { rating: 3 }),
      put('not-a-day', { rating: 3 }),
      put(dates.shiftDayKey(day, 1), { rating: 3 }),
      put(day, { rating: 0 }),
      put(day, { rating: 6 }),
      put(day, { rating: 2.5 }),
      put(day, { rating: '3' }),
      put(day, {}),
      put(day, 'not json'),
      put(day, [3]),
    ];
    for (const response of await Promise.all(bad)) expect(response.status).toBe(400);
    expect(await readFile(file, 'utf8')).toBe(before);
  });
});

describe('GET /api/days/[date]', () => {
  it('answers with the saved rating, null for an unrated day', async () => {
    const day = dates.today();
    const read = async () =>
      (await route.GET(new Request('http://localhost/api/days/' + day), { params: Promise.resolve({ date: day }) })).json();
    expect(await read()).toEqual({ ok: true, rating: null });
    await put(day, { rating: 3 });
    expect(await read()).toEqual({ ok: true, rating: 3 });
  });

  it('refuses a date that is not a day', async () => {
    const response = await route.GET(new Request('http://localhost/api/days/nope'), {
      params: Promise.resolve({ date: 'nope' }),
    });
    expect(response.status).toBe(400);
  });
});
