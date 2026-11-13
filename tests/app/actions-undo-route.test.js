/**
 * POST /api/actions/[id]/undo (ADR 0037): undoes one line of a receipt,
 * tested as tests/app/captures-id-route.test.js tests the capture log's undo.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/actions/[id]/undo/route.js')} */
let undoRoute;
/** @type {typeof import('@/lib/actions/registry.js')} */
let registry;
/** @type {typeof import('@/lib/store.js')} */
let store;

/** A past day, so the test does not depend on the clock. */
const DAY = '2026-04-02';

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-actions-undo-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  undoRoute = await import('@/app/api/actions/[id]/undo/route.js');
  registry = await import('@/lib/actions/registry.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/**
 * @param {string} id
 * @param {Record<string, string>} [headers]
 */
function undo(id, headers = {}) {
  return undoRoute.POST(new Request('http://localhost/api/actions/' + id + '/undo', { method: 'POST', headers }), {
    params: Promise.resolve({ id }),
  });
}

/** Sets the day's mood through the registry and returns the action's id. */
async function moodAction() {
  const { lines } = await registry.runActions([{ name: 'mood.set', params: { value: 4 } }], {
    day: DAY,
    source: 'checkin',
    origin: { type: 'checkin', id: null },
  });
  return /** @type {string} */ (lines[0].actionId);
}

describe('POST /api/actions/[id]/undo', () => {
  it('undoes the action and marks it undone', async () => {
    const id = await moodAction();

    const response = await undo(id);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect((await store.getDailyLog(DAY)).mood).toBeNull();
    expect((await store.getActionRecord(id))?.status).toBe('undone');
  });

  it('answers 404 for an action that does not exist', async () => {
    const response = await undo('action_missing');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ status: 'error', reason: 'not-found' });
  });

  it('refuses a second undo, saying why', async () => {
    const id = await moodAction();
    await undo(id);

    const response = await undo(id);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 'error', reason: 'already-undone' });
  });

  it('refuses once what the action wrote was changed since, and leaves it', async () => {
    const id = await moodAction();
    await store.setDayMood({ date: DAY, mood: 2 });

    const response = await undo(id);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({ status: 'error', reason: 'locked' });
    expect(body.message).toBeTruthy();
    expect((await store.getDailyLog(DAY)).mood).toBe(2);
    expect((await store.getActionRecord(id))?.status).toBe('done');
  });

  it('refuses a request forwarded from off the Mac without the phone token', async () => {
    const id = await moodAction();

    const response = await undo(id, { 'x-forwarded-for': '100.64.0.7' });

    expect(response.status).toBe(401);
    expect((await store.getDailyLog(DAY)).mood).toBe(4);
  });
});
