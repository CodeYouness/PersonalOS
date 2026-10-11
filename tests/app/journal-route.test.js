/**
 * /api/journal -- write and read a day (#159), tested the way the goal and
 * meal routes are: the real route against a sandboxed store, every
 * assertion read back through the store. No model anywhere in this file.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const TODAY = '2026-09-24';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/journal/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-journal-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/journal/route.js');
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

/** @param {unknown} body */
function post(body) {
  return route.POST(
    new Request('http://localhost/api/journal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

/** @param {string} date */
function read(date) {
  return route.GET(new Request('http://localhost/api/journal?date=' + date));
}

/** @param {string} id */
async function writtenEvents(id) {
  return (await store.getEvents({})).filter((event) => event.type === 'journal.written' && event.subject === id);
}

describe('POST /api/journal', () => {
  it('writes an entry on today, and records journal.written', async () => {
    const response = await post({ date: TODAY, text: 'A slow morning, a good afternoon.' });

    expect(response.status).toBe(200);
    const { entry } = await response.json();
    expect(await store.getJournalEntry(entry.id)).toMatchObject({
      date: TODAY,
      text: 'A slow morning, a good afternoon.',
      source: 'user',
    });
    expect(await writtenEvents(entry.id)).toEqual([expect.objectContaining({ date: TODAY })]);
  });

  it('writes an entry about yesterday, written today', async () => {
    const response = await post({ date: '2026-09-23', text: 'The evening before, written after midnight.' });

    expect(response.status).toBe(200);
    const { entry } = await response.json();
    expect(await store.getJournalEntry(entry.id)).toMatchObject({ date: '2026-09-23' });
    expect(await writtenEvents(entry.id)).toEqual([expect.objectContaining({ date: TODAY })]);
  });

  it('refuses a day after today, and writes nothing', async () => {
    const before = await store.getJournalEntries('2026-01-01', '2026-12-31');

    const response = await post({ date: '2026-09-25', text: 'Tomorrow has not happened.' });

    expect(response.status).toBe(400);
    expect(await store.getJournalEntries('2026-01-01', '2026-12-31')).toEqual(before);
  });

  it('refuses a day after today in the store too, whoever calls it', async () => {
    await expect(store.createJournalEntry({ date: '2026-09-25', text: 'Tomorrow.' })).rejects.toThrow(/future/);
  });

  it.each([[''], ['   \n ']])('refuses empty text %j', async (text) => {
    const response = await post({ date: TODAY, text });

    expect(response.status).toBe(400);
    expect(await store.getJournalEntries(TODAY, TODAY)).toEqual([]);
  });

  it('refuses a field it does not write', async () => {
    const response = await post({ date: TODAY, text: 'Hello.', tags: ['work'] });

    expect(response.status).toBe(400);
  });
});

describe('GET /api/journal', () => {
  it("returns the day's entries oldest first, each kept separately", async () => {
    const evening = (await (await post({ date: '2026-09-23', text: 'Evening.' })).json()).entry;
    await post({ date: TODAY, text: 'Another day.' });
    // Written earlier in the day than the one above, saved after it.
    vi.setSystemTime(new Date('2026-09-23T06:30:00Z'));
    const morning = (await (await post({ date: '2026-09-23', text: 'Morning.' })).json()).entry;

    const response = await read('2026-09-23');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.date).toBe('2026-09-23');
    expect(body.entries.map((/** @type {{ id: string }} */ entry) => entry.id)).toEqual([morning.id, evening.id]);
  });

  it("returns the seed's entry on its day, and an empty day as empty", async () => {
    expect((await (await read('2026-01-04')).json()).entries).toEqual([
      expect.objectContaining({ id: 'journal_seed_1' }),
    ]);
    expect((await (await read('2026-01-05')).json()).entries).toEqual([]);
  });

  it('gives each entry the memories drawn from it, and none to an entry with none', async () => {
    await post({ date: '2026-01-04', text: 'A second thought that day.' });

    const { entries } = await (await read('2026-01-04')).json();

    expect(entries).toEqual([
      expect.objectContaining({
        id: 'journal_seed_1',
        memories: [
          expect.objectContaining({
            id: 'memory_seed_2',
            type: 'decision',
            content: 'Going with two-phase pricing rather than a single fee.',
          }),
        ],
      }),
      expect.objectContaining({ text: 'A second thought that day.', memories: [] }),
    ]);
  });

  it.each([['2026-9-23'], ['yesterday'], ['']])('refuses a malformed day %j', async (date) => {
    expect((await read(date)).status).toBe(400);
  });
});
