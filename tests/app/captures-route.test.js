/**
 * GET /api/captures, tested against a sandboxed data directory the same way
 * tests/app/capture-route.test.js is -- fixtures are built directly through
 * the store rather than through the capture route, since this route only
 * reads.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { limits } from '../../personalos.config.js';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/captures/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-captures-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/captures/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/**
 * @typedef {object} CaptureRow
 * @property {string} id
 * @property {string} text
 * @property {string} destination
 * @property {'model'|'rules'} route
 * @property {string} createdAt
 * @property {{ id: string, title: string } | null} produced
 * @property {boolean} locked
 */

/** @returns {Promise<{ captures: CaptureRow[] }>} */
async function get() {
  const response = await route.GET();
  return response.json();
}

describe('GET /api/captures', () => {
  it('orders captures newest-first and caps at the configured limit', async () => {
    const total = limits.captureLogCount + 3;
    for (let i = 0; i < total; i += 1) {
      await store.createCapture({ text: 'capture ' + i, destination: 'memory', route: 'rules' });
    }

    const body = await get();

    expect(body.captures).toHaveLength(limits.captureLogCount);
    expect(body.captures[0]?.text).toBe('capture ' + (total - 1));
    expect(body.captures.at(-1)?.text).toBe('capture ' + (total - limits.captureLogCount));
  });

  it("includes the produced task's title when it still exists", async () => {
    const task = await store.createTask({ title: 'Reply to Marta', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Reply to Marta',
      destination: 'task',
      route: 'model',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    const body = await get();
    const row = body.captures.find((entry) => entry.id === capture.id);

    expect(row?.produced).toEqual({ id: task.id, title: 'Reply to Marta' });
    expect(row?.locked).toBe(false);
  });

  it("includes the produced goal's name as its title", async () => {
    const goal = await store.createGoal({ name: 'Ship the pricing page', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Ship the pricing page',
      destination: 'goals',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: goal.id, rel: 'about' });

    const body = await get();
    const row = body.captures.find((entry) => entry.id === capture.id);

    expect(row?.produced).toEqual({ id: goal.id, title: 'Ship the pricing page' });
  });

  it('reports no produced record for a capture that only ever became a memory entry', async () => {
    const capture = await store.createCapture({
      text: 'porridge with berries',
      destination: 'nutrition',
      route: 'model',
    });

    const body = await get();
    const row = body.captures.find((entry) => entry.id === capture.id);

    expect(row?.produced).toBeNull();
    expect(row?.locked).toBe(false);
  });

  it('flags a produced task as locked once it has been completed', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    await store.updateTask(task.id, { completedAt: new Date().toISOString() });

    const body = await get();
    const row = body.captures.find((entry) => entry.id === capture.id);

    expect(row?.locked).toBe(true);
  });

  it('flags a produced goal as locked once it has been marked done', async () => {
    const goal = await store.createGoal({ name: 'Finish the audit', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Finish the audit',
      destination: 'goals',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: goal.id, rel: 'about' });
    await store.updateGoal(goal.id, { done: true });

    const body = await get();
    const row = body.captures.find((entry) => entry.id === capture.id);

    expect(row?.locked).toBe(true);
  });

  it('flags a produced record as locked once it has been edited at all', async () => {
    const task = await store.createTask({ title: 'Draft the newsletter', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Draft the newsletter',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    await store.updateTask(task.id, { title: 'Draft and send the newsletter' });

    const body = await get();
    const row = body.captures.find((entry) => entry.id === capture.id);

    expect(row?.locked).toBe(true);
  });
});
