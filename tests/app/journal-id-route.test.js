/**
 * /api/journal/[id] and /api/memory/[id] -- correcting and deleting what
 * you wrote, and what was remembered from it (#160, ADR 0027). The real
 * routes against a sandboxed store, every assertion read back through it.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');

/** The seed's entry, and the memory drawn from it. */
const ENTRY = 'journal_seed_1';
const MEMORY = 'memory_seed_2';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/journal/[id]/route.js')} */
let route;
/** @type {typeof import('@/app/api/memory/[id]/route.js')} */
let memoryRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-journal-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/journal/[id]/route.js');
  memoryRoute = await import('@/app/api/memory/[id]/route.js');
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
function patch(id, body) {
  return route.PATCH(
    new Request('http://localhost/api/journal/' + id, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

/** An entry nothing has been drawn from. */
async function freshEntry() {
  return store.writeJournalEntry({ date: '2026-09-23', text: 'Slow start, better after lunch.' });
}

/** @param {string} id */
function del(id) {
  return route.DELETE(new Request('http://localhost/api/journal/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} id */
function deleteMemory(id) {
  return memoryRoute.DELETE(new Request('http://localhost/api/memory/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

/** @param {string} ref */
async function linksTouching(ref) {
  return (await store.getLinks({})).filter((link) => link.from === ref || link.to === ref);
}

describe('DELETE /api/journal/[id]', () => {
  it('deletes the entry and the memories drawn from it, with their links', async () => {
    const response = await del(ENTRY);

    expect(response.status).toBe(200);
    expect(await store.getJournalEntry(ENTRY)).toBeNull();
    expect((await store.getMemoryEntries()).map((memory) => memory.id)).not.toContain(MEMORY);
    expect(await linksTouching(ENTRY)).toEqual([]);
    expect(await linksTouching(MEMORY)).toEqual([]);
  });

  it('deletes an entry nothing was drawn from, and no other memory', async () => {
    const entry = await freshEntry();
    const memories = await store.getMemoryEntries();

    const response = await del(entry.id);

    expect(response.status).toBe(200);
    expect(await store.getJournalEntry(entry.id)).toBeNull();
    expect(await store.getMemoryEntries()).toEqual(memories);
  });

  it('answers 404 for an entry that does not exist', async () => {
    expect((await del('journal_missing')).status).toBe(404);
  });
});

describe('DELETE /api/memory/[id]', () => {
  it('deletes the memory and leaves its entry untouched, and correctable again', async () => {
    const before = await store.getJournalEntry(ENTRY);

    const response = await deleteMemory(MEMORY);

    expect(response.status).toBe(200);
    expect((await store.getMemoryEntries()).map((memory) => memory.id)).not.toContain(MEMORY);
    expect(await linksTouching(MEMORY)).toEqual([]);
    expect(await store.getJournalEntry(ENTRY)).toEqual(before);

    expect((await patch(ENTRY, { text: 'Long day, short night.' })).status).toBe(200);
  });

  it('answers 404 for a memory that does not exist', async () => {
    expect((await deleteMemory('memory_missing')).status).toBe(404);
  });
});

describe('PATCH /api/journal/[id]', () => {
  it('corrects the text and the day of an entry nothing has been drawn from', async () => {
    const entry = await freshEntry();

    const response = await patch(entry.id, { text: 'Slow start, much better after lunch.', date: '2026-09-20' });

    expect(response.status).toBe(200);
    expect(await store.getJournalEntry(entry.id)).toMatchObject({
      text: 'Slow start, much better after lunch.',
      date: '2026-09-20',
    });
  });

  it('refuses to move an entry to a day after today', async () => {
    const entry = await freshEntry();

    const response = await patch(entry.id, { date: '2026-09-25' });

    expect(response.status).toBe(400);
    expect((await store.getJournalEntry(entry.id))?.date).toBe('2026-09-23');
  });

  it.each([[{ text: 'Short day.' }], [{ date: '2026-01-05' }]])(
    'refuses %j while a memory derives from the entry',
    async (body) => {
      const before = await store.getJournalEntry(ENTRY);

      const response = await patch(ENTRY, body);

      expect(response.status).toBe(400);
      expect((await response.json()).message).toMatch(/memory/);
      expect(await store.getJournalEntry(ENTRY)).toEqual(before);
    }
  );

  it('refuses the correction in the store too, whoever calls it', async () => {
    await expect(store.updateJournalEntry(ENTRY, { text: 'Short day.' })).rejects.toThrow(/memory/);
  });

  it('refuses an empty correction, a field it does not correct, and empty text', async () => {
    const entry = await freshEntry();

    expect((await patch(entry.id, {})).status).toBe(400);
    expect((await patch(entry.id, { tags: ['work'] })).status).toBe(400);
    expect((await patch(entry.id, { text: '  ' })).status).toBe(400);
    expect((await store.getJournalEntry(entry.id))?.text).toBe('Slow start, better after lunch.');
  });

  it('answers 404 for an entry that does not exist', async () => {
    expect((await patch('journal_missing', { text: 'Hello.' })).status).toBe(404);
  });
});
