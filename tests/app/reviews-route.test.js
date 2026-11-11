/**
 * GET, PUT and DELETE /api/reviews/[period]/[from] (#236, ADR 0034).
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/reviews/[period]/[from]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

const MONDAY = '2026-03-02';

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-reviews-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/reviews/[period]/[from]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/**
 * @param {string} period
 * @param {string} from
 */
const ctx = (period, from) => ({ params: Promise.resolve({ period, from }) });

/**
 * @param {unknown} body
 * @param {string} [from]
 * @param {string} [period]
 */
function put(body, from = MONDAY, period = 'week') {
  return route.PUT(
    new Request('http://localhost/api/reviews/' + period + '/' + from, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ctx(period, from)
  );
}

const stored = () => readFile(path.join(sandbox, 'personalos.json'), 'utf8').catch(() => '');

describe('GET /api/reviews/[period]/[from]', () => {
  it('returns none, not an error, for a week with no review', async () => {
    const response = await route.GET(new Request('http://localhost/x'), ctx('week', MONDAY));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, review: null });
  });

  it('returns the review that exists', async () => {
    await put({ lever: 'Walk first' });
    const body = await (await route.GET(new Request('http://localhost/x'), ctx('week', MONDAY))).json();
    expect(body.review).toMatchObject({ from: MONDAY, lever: 'Walk first' });
  });

  it('refuses an unknown period', async () => {
    const response = await route.GET(new Request('http://localhost/x'), ctx('month', MONDAY));
    expect(response.status).toBe(400);
  });
});

describe('PUT /api/reviews/[period]/[from]', () => {
  it('creates a review from a subset, then merges', async () => {
    const first = await put({ answers: { worked: 'Mornings' } });
    expect(first.status).toBe(200);
    const second = await put({ lever: 'Block mornings', answers: { change: 'Earlier' } });
    const { review } = await second.json();
    expect(review.answers).toEqual({ worked: 'Mornings', heldBack: '', change: 'Earlier' });
    expect(review.lever).toBe('Block mornings');
    expect(review.completedAt).toBeNull();
  });

  it('completes with completed: true and writes one event', async () => {
    const { review } = await (await put({ completed: true })).json();
    await put({ completed: true });
    expect(review.completedAt).not.toBeNull();
    const events = (await store.getEvents()).filter((e) => e.subject === review.id);
    expect(events).toHaveLength(1);
  });

  it.each([
    ['not JSON', 'nope', MONDAY],
    ['not an object', '[1]', MONDAY],
    ['an empty body', {}, MONDAY],
    ['an unknown field', { mood: 'good' }, MONDAY],
    ['an unknown answer', { answers: { other: 'x' } }, MONDAY],
    ['a non-Monday', { lever: 'x' }, '2026-03-03'],
    ['a future week', { lever: 'x' }, '2999-01-04'],
    ['an over-long lever', { lever: 'x'.repeat(10_000) }, MONDAY],
    ['an over-long answer', { answers: { worked: 'x'.repeat(10_000) } }, MONDAY],
    ['completed: false', { completed: false }, MONDAY],
  ])('refuses %s with a 400 and writes nothing', async (_label, body, from) => {
    const before = await stored();
    const response = await put(body, from);
    expect(response.status).toBe(400);
    expect((await response.json()).status).toBe('error');
    expect(await store.getReview('week', MONDAY)).toBeNull();
    expect(await store.getReview('week', from)).toBeNull();
    expect(await stored()).toBe(before);
  });

  it('refuses an unknown period with a 400', async () => {
    expect((await put({ lever: 'x' }, MONDAY, 'month')).status).toBe(400);
  });
});

describe('DELETE /api/reviews/[period]/[from]', () => {
  it('removes the review and leaves its event', async () => {
    const { review } = await (await put({ completed: true })).json();
    const response = await route.DELETE(new Request('http://localhost/x'), ctx('week', MONDAY));
    expect(response.status).toBe(200);
    expect(await store.getReview('week', MONDAY)).toBeNull();
    expect((await store.getEvents()).some((e) => e.subject === review.id)).toBe(true);
  });

  it('is a 404 for a week with no review', async () => {
    const response = await route.DELETE(new Request('http://localhost/x'), ctx('week', MONDAY));
    expect(response.status).toBe(404);
  });
});
