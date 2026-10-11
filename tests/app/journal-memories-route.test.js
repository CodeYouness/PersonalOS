/**
 * /api/journal/[id]/memories -- accepting a proposal (#162, ADR 0027). The
 * real route against a sandboxed store, every assertion read back through
 * it. No model: accepting never asks one.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');

/** The seed's entry, as the screen received it. */
const ENTRY = 'journal_seed_1';
const SEEN = '2026-01-04T22:35:00.000Z';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/journal/[id]/memories/route.js')} */
let route;
/** @type {typeof import('@/app/api/journal/[id]/route.js')} */
let entryRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-journal-memories-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/journal/[id]/memories/route.js');
  entryRoute = await import('@/app/api/journal/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {string} id @param {unknown} body */
function accept(id, body) {
  return route.POST(
    new Request('http://localhost/api/journal/' + id + '/memories', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** @param {string} id @param {unknown} body */
function correct(id, body) {
  return entryRoute.PATCH(
    new Request('http://localhost/api/journal/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** @param {string} entryId */
async function memoryIdsFrom(entryId) {
  return (await store.getMemoriesDrawnFrom(entryId)).map((memory) => memory.id);
}

describe('POST /api/journal/[id]/memories', () => {
  it('writes the memory you vouched for, derived from the entry, and records memory.saved', async () => {
    const response = await accept(ENTRY, {
      type: 'observation',
      content: 'Exercise in the evening clears a distracted afternoon.',
      updatedAt: SEEN,
    });

    expect(response.status).toBe(200);
    const { memory } = await response.json();
    expect((await store.getMemoryEntries()).find((entry) => entry.id === memory.id)).toEqual(
      expect.objectContaining({
        type: 'observation',
        content: 'Exercise in the evening clears a distracted afternoon.',
        source: 'journal',
        confidence: 1,
        validFrom: '2026-01-04',
        validUntil: null,
        tags: [],
      })
    );
    expect(await store.getLinks({ from: memory.id })).toEqual([
      expect.objectContaining({ to: ENTRY, rel: 'derived_from' }),
    ]);
    expect(await memoryIdsFrom(ENTRY)).toContain(memory.id);
    expect((await store.getEvents({})).filter((event) => event.type === 'memory.saved')).toEqual([
      expect.objectContaining({ subject: memory.id, date: '2026-09-24' }),
    ]);
  });

  it('refuses a proposal read before the entry changed, and writes nothing', async () => {
    const entry = await store.writeJournalEntry({ date: '2026-09-23', text: 'Slow start.' });
    vi.setSystemTime(new Date('2026-09-24T10:05:00Z'));
    await correct(entry.id, { text: 'Slow start, better after lunch.' });
    const memories = await store.getMemoryEntries();

    const response = await accept(entry.id, { type: 'fact', content: 'Slow start.', updatedAt: entry.updatedAt });

    expect(response.status).toBe(400);
    expect((await response.json()).message).toMatch(/changed/);
    expect(await store.getMemoryEntries()).toEqual(memories);
    expect((await store.getEvents({})).filter((event) => event.type === 'memory.saved')).toEqual([]);
  });

  it('refuses a proposal for an entry that is gone', async () => {
    const entry = await store.writeJournalEntry({ date: '2026-09-23', text: 'Slow start.' });
    await store.deleteJournalEntry(entry.id);

    const response = await accept(entry.id, { type: 'fact', content: 'Slow start.', updatedAt: entry.updatedAt });

    expect(response.status).toBe(404);
    await expect(
      store.acceptJournalProposal(entry.id, { type: 'fact', content: 'Slow start.', updatedAt: entry.updatedAt })
    ).rejects.toThrow(/no journal entry/);
  });

  it.each([
    [{ type: 'feeling', content: 'Tired.', updatedAt: SEEN }],
    [{ type: 'fact', content: '  ', updatedAt: SEEN }],
    [{ type: 'fact', content: 'Tired.' }],
    [{ type: 'fact', content: 'Tired.', updatedAt: SEEN, confidence: 0.4 }],
  ])('refuses %j', async (body) => {
    const memories = await store.getMemoryEntries();

    expect((await accept(ENTRY, body)).status).toBe(400);
    expect(await store.getMemoryEntries()).toEqual(memories);
  });

  it('locks the entry it was drawn from against correction', async () => {
    const entry = await store.writeJournalEntry({ date: '2026-09-23', text: 'Slow start.' });
    await accept(entry.id, { type: 'context', content: 'Mornings are slow lately.', updatedAt: entry.updatedAt });

    const response = await correct(entry.id, { text: 'Fast start.' });

    expect(response.status).toBe(400);
    expect((await store.getJournalEntry(entry.id))?.text).toBe('Slow start.');
  });
});
