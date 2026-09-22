/**
 * PATCH /api/tasks/[id] -- the CRM detail panel's edits (#53), tested the
 * same way the capture routes are: the real route against a sandboxed
 * store, every assertion read back through the store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/tasks/[id]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-tasks-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/tasks/[id]/route.js');
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
    new Request('http://localhost/api/tasks/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** The seed's overdue task: band `today`, chosen on a day long gone. */
const OVERDUE = 'task_seed_1';

describe('PATCH /api/tasks/[id]', () => {
  it('updates each field the panel edits', async () => {
    const response = await patch(OVERDUE, {
      title: 'Send the final quote',
      note: 'Two-phase option.',
      band: 'week',
      temperature: 'cold',
      tags: ['billing'],
    });

    expect(response.status).toBe(200);
    const task = await store.getTask(OVERDUE);
    expect(task).toMatchObject({
      title: 'Send the final quote',
      note: 'Two-phase option.',
      band: 'week',
      temperature: 'cold',
      tags: ['billing'],
    });
  });

  it.each([
    ['a blank title', { title: '   ' }],
    ['overdue, which is never a band you choose', { band: 'overdue' }],
    ['an unknown band', { band: 'someday' }],
    ['a null band', { band: null }],
    ['an unknown temperature', { temperature: 'lukewarm' }],
    ['a blank tag', { tags: ['billing', '  '] }],
    ['a tag that is not a string', { tags: [42] }],
    ['a field the panel does not edit', { completedAt: '2026-01-05T10:00:00.000Z' }],
    // An empty edit would still stamp `updatedAt`, locking the capture's Undo for nothing.
    ['an edit that changes nothing', {}],
  ])('refuses %s', async (_label, body) => {
    const before = await store.getTask(OVERDUE);

    const response = await patch(OVERDUE, body);

    expect(response.status).toBe(400);
    expect(await store.getTask(OVERDUE)).toEqual(before);
  });

  it('answers 404 for a task that does not exist', async () => {
    const response = await patch('task_missing', { title: 'x' });
    expect(response.status).toBe(404);
  });

  it('restarts the clock when the current band is sent again, so an overdue task recommits', async () => {
    const response = await patch(OVERDUE, { band: 'today' });

    expect(response.status).toBe(200);
    const task = await store.getTask(OVERDUE);
    expect(task?.band).toBe('today');
    expect(task?.bandSetOn).toBe(dates.today());
  });

  it('trims, lowercases and de-duplicates tags', async () => {
    await patch(OVERDUE, { tags: [' Billing', 'billing ', 'Nordis'] });
    expect((await store.getTask(OVERDUE))?.tags).toEqual(['billing', 'nordis']);
  });

  it('writes no event: an edit is not something that happened to you', async () => {
    const before = (await store.getEvents({})).length;
    await patch(OVERDUE, { title: 'Send the final quote', band: 'week' });
    expect(await store.getEvents({})).toHaveLength(before);
  });
});
