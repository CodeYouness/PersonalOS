/**
 * A capture is dated when it was said (ADR 0033). The clock is fixed and the
 * timezone explicit, so nothing here depends on the machine running it. No
 * model is configured: the rules answer.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** A Thursday, 12:00 in Europe/Rome. */
const NOW = new Date('2026-09-10T10:00:00Z');
/** The evening before, 21:30 in Europe/Rome: Wednesday the 9th. */
const YESTERDAY_EVENING = '2026-09-09T21:30:00+02:00';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/capture/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-said-at-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.USER_TIMEZONE = 'Europe/Rome';
  delete process.env.ANTHROPIC_API_KEY;
  route = await import('@/app/api/capture/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * @param {string} text
 * @param {Record<string, unknown>} [extra]
 */
function post(text, extra = {}) {
  return route.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, ...extra }),
    })
  );
}

describe('POST /api/capture with saidAt', () => {
  it('files a meal on the day it was said, at the time it was said', async () => {
    const response = await post('had a carbonara for dinner', { saidAt: YESTERDAY_EVENING });
    const body = await response.json();

    expect(body).toMatchObject({ destination: 'nutrition', saidOn: '2026-09-09' });
    expect((await store.getDailyLog('2026-09-09')).meals).toEqual([
      expect.objectContaining({ id: body.recordId, time: '21:30' }),
    ]);
    expect((await store.getDailyLog('2026-09-10')).meals).toEqual([]);
  });

  it('files a weight on the day it was said, recorded at the moment said', async () => {
    const response = await post('weighed 74,6kg this morning', { saidAt: YESTERDAY_EVENING });
    const body = await response.json();

    expect(body).toMatchObject({ destination: 'health', note: '74.6 kg', saidOn: '2026-09-09' });
    expect((await store.getDailyLog('2026-09-09')).measurements).toEqual([
      expect.objectContaining({ id: body.recordId, value: 74.6, recordedAt: '2026-09-09T19:30:00.000Z' }),
    ]);
  });

  it('files a transaction on the day it was said', async () => {
    await store.updateProfile({ defaultAccountId: 'account_seed_current' });
    const response = await post('paid 12 euro for lunch', { saidAt: YESTERDAY_EVENING });
    const body = await response.json();

    expect(body).toMatchObject({ destination: 'finance', saidOn: '2026-09-09' });
    expect(await store.getTransaction(body.recordId)).toMatchObject({ date: '2026-09-09' });
  });

  it('reads "domani" from the day it was said, so yesterday\'s "domani" is today', async () => {
    const response = await post('riunione con Marco domani alle 15', { saidAt: YESTERDAY_EVENING });
    const body = await response.json();

    expect(body.destination).toBe('appointment');
    expect(await store.getAppointment(body.recordId)).toMatchObject({ date: '2026-09-10', startTime: '15:00' });
  });

  it('keeps when it was said beside when it was written', async () => {
    await post('call Marta', { saidAt: YESTERDAY_EVENING });
    const [capture] = await store.getCaptures({ limit: 1 });

    expect(capture.saidAt).toBe('2026-09-09T19:30:00.000Z');
    expect(capture.createdAt).toBe(NOW.toISOString());
  });

  it('dates a capture with no saidAt at the moment it was written', async () => {
    await post('call Marta');
    const [capture] = await store.getCaptures({ limit: 1 });

    expect(capture.saidAt).toBe(capture.createdAt);
  });

  it('treats a saidAt two minutes ahead as now', async () => {
    await post('call Marta', { saidAt: '2026-09-10T12:02:00+02:00' });
    const [capture] = await store.getCaptures({ limit: 1 });

    expect(capture.saidAt).toBe(capture.createdAt);
  });

  it.each([
    ['a day ahead', '2026-09-11T12:00:00+02:00'],
    ['malformed', 'yesterday evening'],
    ['without an offset', '2026-09-09T21:30:00'],
  ])('refuses a saidAt %s with 400 and writes nothing', async (_name, saidAt) => {
    const before = await store.getCaptures();
    const response = await post('call Marta', { saidAt });

    expect(response.status).toBe(400);
    expect(await store.getCaptures()).toEqual(before);
    expect(await store.getTasks()).not.toContainEqual(expect.objectContaining({ title: 'call Marta' }));
  });
});
