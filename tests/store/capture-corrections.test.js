/**
 * The three corrective actions on a capture -- Delete (#21), Undo (#22),
 * Refile (#23) -- exercised directly through lib/store.js, the same way
 * tests/store/json-adapter.test.js exercises the adapter it sits on.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-capture-corrections-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

describe('deleteCaptureCascade', () => {
  it('removes the capture, its memory entry, its produced task, and every link', async () => {
    const task = await store.createTask({ title: 'Reply to Marta', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Reply to Marta',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    const memory = await store.createMemoryEntry({
      content: 'Reply to Marta',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getMemoryEntries()).not.toContainEqual(
      expect.objectContaining({ id: memory.id })
    );
    const links = await store.getLinks({});
    expect(links.some((link) => link.from === capture.id || link.to === capture.id)).toBe(false);
    expect(links.some((link) => link.from === task.id || link.to === task.id)).toBe(false);

    const events = await store.getEvents({});
    expect(events.some((event) => event.type === 'capture.deleted' && event.subject === capture.id)).toBe(
      true
    );
  });

  it('deletes a capture with no produced record just as well', async () => {
    const capture = await store.createCapture({ text: 'porridge with berries', destination: 'nutrition' });
    await store.createMemoryEntry({
      content: 'porridge with berries',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
  });

  it('throws for a capture that does not exist', async () => {
    await expect(store.deleteCaptureCascade('capture_missing')).rejects.toThrow();
  });
});
