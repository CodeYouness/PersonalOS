/**
 * /api/goals/[id] -- the Goals panel's corrections, tested the same way the
 * task routes are: the real route against a sandboxed store, every
 * assertion read back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/goals/[id]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-goals-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/goals/[id]/route.js');
  store = await import('@/lib/store.js');
  dates = await import('@/lib/domain/dates.js');
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
    new Request('http://localhost/api/goals/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** The seed's week goal, its horizon set on 2026-01-02. */
const WEEK_GOAL = 'goal_seed_1';

describe('PATCH /api/goals/[id]', () => {
  it('updates each field the panel edits', async () => {
    const response = await patch(WEEK_GOAL, {
      name: 'Sign the Nordis contract',
      kind: 'project',
      horizon: 'month',
      targetDate: '2026-10-30',
      progress: { current: 0, target: 2 },
    });

    expect(response.status).toBe(200);
    expect(await store.getGoal(WEEK_GOAL)).toMatchObject({
      name: 'Sign the Nordis contract',
      kind: 'project',
      horizon: 'month',
      targetDate: '2026-10-30',
      progress: { current: 0, target: 2 },
    });
  });

  it('clears the target date and the progress', async () => {
    await patch(WEEK_GOAL, { targetDate: '2026-10-30', progress: { current: 1, target: 3 } });

    const response = await patch(WEEK_GOAL, { targetDate: null, progress: null });

    expect(response.status).toBe(200);
    expect(await store.getGoal(WEEK_GOAL)).toMatchObject({ targetDate: null, progress: null });
  });

  it('restarts the age on a different horizon, and not on the same one', async () => {
    await patch(WEEK_GOAL, { horizon: 'week' });
    expect((await store.getGoal(WEEK_GOAL))?.horizonSetOn).toBe('2026-01-02');

    await patch(WEEK_GOAL, { horizon: 'month' });
    expect((await store.getGoal(WEEK_GOAL))?.horizonSetOn).toBe(dates.today());
  });

  it('accepts more done than promised, and does not close the goal for it', async () => {
    const response = await patch(WEEK_GOAL, { progress: { current: 4, target: 3 } });

    expect(response.status).toBe(200);
    expect(await store.getGoal(WEEK_GOAL)).toMatchObject({ progress: { current: 4, target: 3 }, done: false });
  });

  it.each([
    ['a blank name', { name: '  ' }],
    ['an unknown kind', { kind: 'dream' }],
    ['an unknown horizon', { horizon: 'year' }],
    ['a null horizon', { horizon: null }],
    ['a target date that is not a day', { targetDate: '2026-02-30' }],
    ['a fraction of progress', { progress: { current: 1.5, target: 3 } }],
    ['a target of 0', { progress: { current: 0, target: 0 } }],
    ['a negative current', { progress: { current: -1, target: 3 } }],
    ['progress without a target', { progress: { current: 1 } }],
    ['a field the panel does not edit', { done: true }],
    ['an edit that changes nothing', {}],
  ])('refuses %s', async (_label, body) => {
    const before = await store.getGoal(WEEK_GOAL);

    const response = await patch(WEEK_GOAL, body);

    expect(response.status).toBe(400);
    expect(await store.getGoal(WEEK_GOAL)).toEqual(before);
  });

  it('answers 404 for a goal that does not exist', async () => {
    expect((await patch('goal_missing', { name: 'x' })).status).toBe(404);
  });

  it('locks the Undo and Refile of the capture the goal came from', async () => {
    const capture = await store.createCapture({ text: 'close the audit', destination: 'goals', route: 'rules' });
    const goal = await store.createGoal({ name: capture.text, source: 'capture' });
    await store.createLink({ from: capture.id, to: goal.id, rel: 'about' });
    await new Promise((resolve) => setTimeout(resolve, 5));

    await patch(goal.id, { horizon: 'month' });

    await expect(store.undoCaptureFiling(capture.id)).rejects.toThrow(/touched/);
    await expect(store.refileCapture(capture.id, 'task')).rejects.toThrow(/touched/);
  });

  it('writes no event: an edit is not something that happened to you', async () => {
    const before = (await store.getEvents({})).length;
    await patch(WEEK_GOAL, { name: 'Sign the Nordis contract' });
    expect(await store.getEvents({})).toHaveLength(before);
  });
});
