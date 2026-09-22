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
/** @type {typeof import('@/app/api/tasks/[id]/complete/route.js')} */
let completeRoute;
/** @type {typeof import('@/app/api/tasks/[id]/reopen/route.js')} */
let reopenRoute;
/** @type {typeof import('@/app/api/tasks/[id]/person/route.js')} */
let personRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/domain/dates.js')} */
let dates;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-tasks-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/tasks/[id]/route.js');
  completeRoute = await import('@/app/api/tasks/[id]/complete/route.js');
  reopenRoute = await import('@/app/api/tasks/[id]/reopen/route.js');
  personRoute = await import('@/app/api/tasks/[id]/person/route.js');
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

/**
 * @param {{ POST: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> }} handler
 * @param {string} id
 */
function post(handler, id) {
  return handler.POST(new Request('http://localhost/api/tasks/' + id, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} id */
function del(id) {
  return route.DELETE(new Request('http://localhost/api/tasks/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} id @param {unknown} body */
function putPerson(id, body) {
  return personRoute.PUT(
    new Request('http://localhost/api/tasks/' + id + '/person', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** @param {string} id */
async function involves(id) {
  return (await store.getLinks({ from: id, rel: 'involves' })).map((link) => link.to);
}

/** @param {string} id */
async function completedEvents(id) {
  return (await store.getEvents({})).filter((event) => event.type === 'task.completed' && event.subject === id);
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

describe('completing, reopening and deleting a task', () => {
  it('completes a task once, on the timeline', async () => {
    const response = await post(completeRoute, OVERDUE);

    expect(response.status).toBe(200);
    expect((await store.getTask(OVERDUE))?.completedAt).not.toBeNull();
    expect(await completedEvents(OVERDUE)).toHaveLength(1);

    expect((await post(completeRoute, OVERDUE)).status).toBe(400);
    expect(await completedEvents(OVERDUE)).toHaveLength(1);
  });

  it('reopens a completed task without writing an event', async () => {
    await post(completeRoute, OVERDUE);
    const eventsBefore = (await store.getEvents({})).length;

    const response = await post(reopenRoute, OVERDUE);

    expect(response.status).toBe(200);
    expect((await store.getTask(OVERDUE))?.completedAt).toBeNull();
    expect(await store.getEvents({})).toHaveLength(eventsBefore);
  });

  it('refuses to reopen a task that is open', async () => {
    expect((await post(reopenRoute, OVERDUE)).status).toBe(400);
  });

  it('answers 404 for a task that does not exist', async () => {
    expect((await post(completeRoute, 'task_missing')).status).toBe(404);
    expect((await post(reopenRoute, 'task_missing')).status).toBe(404);
    expect((await del('task_missing')).status).toBe(404);
  });

  it('deletes a task and its links, and keeps the capture that produced it', async () => {
    const capture = await store.createCapture({
      text: 'Reply to Tom about the syllabus',
      origin: 'bar',
      destination: 'task',
      route: 'rules',
    });
    const task = await store.fileCaptureAsTask(capture, capture.text);
    await store.linkPersonNamedIn(task.id, capture.text);
    await store.createMemoryEntry({ type: 'fact', content: capture.text, source: 'capture', derivedFrom: capture.id });

    const response = await del(task.id);

    expect(response.status).toBe(200);
    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getLinks({ from: task.id })).toHaveLength(0);
    expect(await store.getLinks({ to: task.id })).toHaveLength(0);
    // The sentence you said is never lost: the capture and its memory stay.
    expect(await store.getCapture(capture.id)).not.toBeNull();
    expect(await store.getReferrers(capture.id, 'derived_from')).toHaveLength(1);
  });
});

describe('PUT /api/tasks/[id]/person', () => {
  // task_seed_1 involves Marta (person_seed_1) in the seed.
  it('replaces the person a task involves', async () => {
    const response = await putPerson(OVERDUE, { personId: 'person_seed_2' });

    expect(response.status).toBe(200);
    expect(await involves(OVERDUE)).toEqual(['person_seed_2']);
  });

  it('leaves the link alone when the same person is chosen again', async () => {
    const [before] = await store.getLinks({ from: OVERDUE, rel: 'involves' });
    expect((await putPerson(OVERDUE, { personId: 'person_seed_1' })).status).toBe(200);
    expect(await store.getLinks({ from: OVERDUE, rel: 'involves' })).toEqual([before]);
  });

  it('clears it with null', async () => {
    expect((await putPerson(OVERDUE, { personId: null })).status).toBe(200);
    expect(await involves(OVERDUE)).toEqual([]);
  });

  it('never touches the task itself, so the capture it came from stays correctable', async () => {
    const before = await store.getTask(OVERDUE);
    await putPerson(OVERDUE, { personId: 'person_seed_2' });
    expect((await store.getTask(OVERDUE))?.updatedAt).toBe(before?.updatedAt);
  });

  it.each([
    ['an unknown person', { personId: 'person_missing' }],
    ['a reference that is not a person', { personId: 'goal_seed_1' }],
    ['no personId at all', {}],
  ])('refuses %s, leaving the link as it was', async (_label, body) => {
    expect((await putPerson(OVERDUE, body)).status).toBe(400);
    expect(await involves(OVERDUE)).toEqual(['person_seed_1']);
  });

  it('answers 404 for a task that does not exist', async () => {
    expect((await putPerson('task_missing', { personId: null })).status).toBe(404);
  });
});
