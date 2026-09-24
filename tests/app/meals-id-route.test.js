/**
 * /api/meals/[id] -- correcting a meal on the Nutrition card (#72), tested
 * the way the tasks id route is: the real route against a sandboxed store,
 * every assertion read back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/meals/[id]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-meals-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/meals/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {string} id @param {unknown} body */
function patch(id, body) {
  return route.PATCH(
    new Request('http://localhost/api/meals/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** @param {string} id */
function del(id) {
  return route.DELETE(new Request('http://localhost/api/meals/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

/** An estimated carbonara whose calories are not quite its macros, as a model's may be. */
function carbonara() {
  return store.createMeal({
    date: '2026-09-01', time: '13:00', name: 'Carbonara',
    calories: 720, protein: 28, carbs: 82, fat: 30, estimated: true,
  });
}

describe('PATCH /api/meals/[id]', () => {
  it('recomputes calories at 4/4/9 when a macro changes', async () => {
    const meal = await carbonara();

    const response = await patch(meal.id, { fat: 20 });

    expect(response.status).toBe(200);
    // 28*4 + 82*4 + 20*9 = 620
    expect(await store.getMeal(meal.id)).toMatchObject({ calories: 620, protein: 28, carbs: 82, fat: 20 });
  });

  it('leaves the macros alone when only calories change -- a beer is more than its macros', async () => {
    const meal = await carbonara();

    await patch(meal.id, { calories: 900 });

    expect(await store.getMeal(meal.id)).toMatchObject({ calories: 900, protein: 28, carbs: 82, fat: 30 });
  });

  it('takes calories set in the same edit as a macro as given', async () => {
    const meal = await carbonara();

    await patch(meal.id, { fat: 20, calories: 700 });

    expect(await store.getMeal(meal.id)).toMatchObject({ calories: 700, fat: 20 });
  });

  it('clears "estimated" and moves updatedAt on any correction', async () => {
    const meal = await carbonara();

    await patch(meal.id, { name: 'Spaghetti carbonara' });

    const corrected = await store.getMeal(meal.id);
    expect(corrected).toMatchObject({ name: 'Spaghetti carbonara', estimated: false });
    expect(corrected?.updatedAt).not.toBe(meal.createdAt);
  });

  it('fills in the numbers of a meal that had none', async () => {
    const meal = await store.createMeal({ date: '2026-09-01', time: null, name: 'Pizza' });

    await patch(meal.id, { protein: 35, carbs: 110, fat: 32 });

    expect(await store.getMeal(meal.id)).toMatchObject({ calories: 868, protein: 35, carbs: 110, fat: 32, estimated: false });
  });

  it('leaves calories unknown while a macro is still unknown', async () => {
    const meal = await store.createMeal({ date: '2026-09-01', time: null, name: 'Pizza' });

    await patch(meal.id, { protein: 35 });

    expect(await store.getMeal(meal.id)).toMatchObject({ calories: null, protein: 35, carbs: null });
  });

  it('sets and clears the time', async () => {
    const meal = await carbonara();

    await patch(meal.id, { time: '12:40' });
    expect((await store.getMeal(meal.id))?.time).toBe('12:40');

    await patch(meal.id, { time: null });
    expect((await store.getMeal(meal.id))?.time).toBeNull();
  });

  it.each([
    [{ calories: -5 }],
    [{ fat: 2.5 }],
    [{ time: '1pm' }],
    [{ name: '  ' }],
    [{ estimated: true }],
    [{ createdAt: '2020-01-01T00:00:00.000Z' }],
    [{}],
    [[]],
  ])('rejects %j without touching the meal', async (body) => {
    const meal = await carbonara();

    const response = await patch(meal.id, body);

    expect(response.status).toBe(400);
    expect(await store.getMeal(meal.id)).toEqual(meal);
  });

  it('is a 404 for a meal that does not exist', async () => {
    const response = await patch('meal_missing', { calories: 100 });

    expect(response.status).toBe(404);
  });
});

describe('DELETE /api/meals/[id]', () => {
  it('removes the meal, and the capture that produced it keeps its sentence and memory entry', async () => {
    const capture = await store.createCapture({ text: 'had a carbonara for lunch', destination: 'nutrition' });
    const meal = await store.fileCaptureAsMeal(capture);
    const memory = await store.createMemoryEntry({ content: capture.text, source: 'capture', derivedFrom: capture.id });

    const response = await del(meal.id);

    expect(response.status).toBe(200);
    expect(await store.getMeal(meal.id)).toBeNull();
    expect(await store.getCapture(capture.id)).toMatchObject({ text: 'had a carbonara for lunch' });
    expect(await store.getMemoryEntries()).toContainEqual(expect.objectContaining({ id: memory.id }));
    expect(await store.getLinks({ from: capture.id, rel: 'about' })).toHaveLength(0);
  });

  it('is a 404 for a meal that does not exist', async () => {
    const response = await del('meal_missing');

    expect(response.status).toBe(404);
  });
});
