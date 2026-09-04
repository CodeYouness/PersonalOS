/**
 * The capture route, tested against a sandboxed data directory the same way
 * tests/store/json-adapter.test.js is: no model configured, so classify()
 * always answers deterministically through the rule-based path, and every
 * assertion reads back through the store rather than the route's internals.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/capture/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-capture-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  delete process.env.ANTHROPIC_API_KEY;
  route = await import('@/app/api/capture/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {string} text */
function post(text) {
  return route.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  );
}

describe('POST /api/capture', () => {
  it('files a task capture and links it back', async () => {
    const response = await post('Reply about the workshop dates');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.destination).toBe('task');
    expect(body.route).toBe('rules');
    expect(body.recordId).not.toBeNull();

    const task = await store.getTask(body.recordId);
    expect(task?.title).toBe('Reply about the workshop dates');

    const captures = await store.getCaptures();
    const capture = captures.find((entry) => entry.text === 'Reply about the workshop dates');
    expect(capture?.destination).toBe('task');

    const aboutLinks = await store.getLinks({ from: capture?.id, rel: 'about' });
    expect(aboutLinks.some((link) => link.to === body.recordId)).toBe(true);

    const memories = await store.getMemoryEntries();
    const memory = memories.find((entry) => entry.content === 'Reply about the workshop dates');
    expect(memory).toBeTruthy();
    const provenance = await store.getLinks({ from: memory?.id, rel: 'derived_from' });
    expect(provenance.some((link) => link.to === capture?.id)).toBe(true);

    const events = await store.getEvents({});
    expect(events.some((event) => event.type === 'capture.filed' && event.subject === capture?.id)).toBe(
      true
    );
  });

  it('files a non-task capture with no destination record, not a fabricated one', async () => {
    const response = await post('paid 20 for coffee with the team');
    const body = await response.json();

    expect(body.destination).toBe('finance');
    expect(body.recordId).toBeNull();

    const captures = await store.getCaptures();
    const capture = captures.find((entry) => entry.text === 'paid 20 for coffee with the team');
    expect(capture?.destination).toBe('finance');

    // No transaction was fabricated, and no "about" link points anywhere --
    // there is nothing on the other end of it yet.
    const aboutLinks = await store.getLinks({ from: capture?.id, rel: 'about' });
    expect(aboutLinks).toHaveLength(0);

    const memories = await store.getMemoryEntries();
    expect(memories.some((entry) => entry.content === 'paid 20 for coffee with the team')).toBe(true);
  });

  it('files a goal capture with the text as its name', async () => {
    const response = await post('goal: ship the pricing page this week');
    const body = await response.json();

    expect(body.destination).toBe('goals');
    expect(body.recordId).not.toBeNull();

    const goals = await store.getGoals();
    const goal = goals.find((entry) => entry.id === body.recordId);
    expect(goal?.name).toBe('goal: ship the pricing page this week');

    const captures = await store.getCaptures();
    const capture = captures.find((entry) => entry.text === 'goal: ship the pricing page this week');
    const aboutLinks = await store.getLinks({ from: capture?.id, rel: 'about' });
    expect(aboutLinks.some((link) => link.to === body.recordId)).toBe(true);
  });

  it('rejects empty text instead of filing nothing silently', async () => {
    const response = await post('   ');
    expect(response.status).toBe(400);
  });

  it('keeps the capture even when enrichment afterwards fails', async () => {
    // The capture is the one write rule 2 requires. A task/link/memory/event
    // failing after it must not look like the whole request failed.
    vi.spyOn(store, 'recordEvent').mockRejectedValueOnce(new Error('disk full'));

    const response = await post('Reply about the enrichment failure');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.destination).toBe('task');

    const captures = await store.getCaptures();
    expect(captures.some((entry) => entry.text === 'Reply about the enrichment failure')).toBe(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
