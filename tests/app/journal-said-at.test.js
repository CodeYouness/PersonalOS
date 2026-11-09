/**
 * An entry dictated on the phone is dated when it was said and written once
 * (ticket #230, ADR 0033). Clock fixed, timezone explicit, no model.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Thursday 10 September 2026, 08:00 in Europe/Rome. */
const MORNING = new Date('2026-09-10T06:00:00Z');
/** The evening before, 23:50 in Europe/Rome. */
const LAST_NIGHT = '2026-09-09T23:50:00+02:00';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/journal/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-journal-said-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.USER_TIMEZONE = 'Europe/Rome';
  route = await import('@/app/api/journal/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MORNING);
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {Record<string, unknown>} body */
function post(body) {
  return route.POST(
    new Request('http://localhost/api/journal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/journal with saidAt', () => {
  it('files an entry said at 23:50 and posted at 08:00 on the earlier day, with 23:50', async () => {
    const response = await post({ text: 'A long evening', saidAt: LAST_NIGHT });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.entry.date).toBe('2026-09-09');
    expect(body.entry.saidAt).toBe('2026-09-09T21:50:00.000Z');
    expect(body.receiptLine).toBe('journal · Written for 2026-09-09');
    expect((await store.getJournalDay('2026-09-09')).map((e) => e.text)).toEqual(['A long evening']);
    expect(await store.getJournalDay('2026-09-10')).toEqual([]);
  });

  it('dates a browser entry by when it was written, as before', async () => {
    const body = await (await post({ text: 'Morning' })).json();
    expect(body.entry.date).toBe('2026-09-10');
    expect(body.entry.saidAt).toBe(body.entry.createdAt);
  });

  it('treats a few minutes ahead as now and refuses further ahead', async () => {
    const near = await post({ text: 'Drift', saidAt: '2026-09-10T08:03:00+02:00' });
    expect(near.status).toBe(200);
    expect((await near.json()).entry.date).toBe('2026-09-10');

    const far = await post({ text: 'Future', saidAt: '2026-09-10T09:30:00+02:00' });
    expect(far.status).toBe(400);
    expect((await far.json()).error).toBe('saidAt is in the future');
    expect((await post({ text: 'Bad', saidAt: 'yesterday' })).status).toBe(400);
  });

  it('refuses a malformed clientId and writes nothing', async () => {
    const response = await post({ text: 'x', clientId: '   ' });
    expect(response.status).toBe(400);
    expect(typeof (await response.json()).error).toBe('string');
    expect(await store.getJournalDay('2026-09-10')).toEqual([]);
  });

  it('writes a repeated clientId once and answers the same entry with 200', async () => {
    const first = await (await post({ text: 'Once', saidAt: LAST_NIGHT, clientId: 'phone-1' })).json();
    const again = await post({ text: 'Once', saidAt: LAST_NIGHT, clientId: 'phone-1' });
    const second = await again.json();

    expect(again.status).toBe(200);
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.receiptLine).toBe(first.receiptLine);
    expect(await store.getJournalDay('2026-09-09')).toHaveLength(1);
  });

  it('gives a refusal an error the Shortcut can read', async () => {
    const response = await post({ text: '' });
    expect(response.status).toBe(400);
    expect(typeof (await response.json()).error).toBe('string');
  });
});
