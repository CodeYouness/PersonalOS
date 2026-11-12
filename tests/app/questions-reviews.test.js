/**
 * Reviews in the question context (#242, ADR 0034): a finished review is a
 * citable item that opens its week on the Review screen; an unfinished one is
 * not sent. The seam is `buildContext`, which keeps `opens` (the serialised
 * block the model reads does not).
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { reviewAddress } from '@/lib/domain/addresses.js';
import { shiftDayKey } from '@/lib/domain/dates.js';
import { limits } from '@/personalos.config.js';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/ai/context/index.js')} */
let context;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-questions-reviews-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  context = await import('@/lib/ai/context/index.js');
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

/** @param {string} id */
async function itemOf(id) {
  return (await context.buildContext('question')).items.find((item) => item.id === id);
}

describe('a completed review', () => {
  it('is a citable item with the period, the three answers and the lever, opening that week', async () => {
    const review = await store.saveReview({
      period: 'week',
      from: '2026-09-14',
      answers: { worked: 'Early walks', heldBack: 'Travel', change: '' },
      lever: 'Plan Sunday',
      completed: true,
    });

    const item = await itemOf(review.id);

    expect(item).toMatchObject({ type: 'review', opens: '/review?week=2026-09-14' });
    expect(item?.opens).toBe(reviewAddress('2026-09-14'));
    expect(item?.content).toContain('2026-09-14');
    expect(item?.content).toContain('Early walks');
    expect(item?.content).toContain('Travel');
    expect(item?.content).toContain('Plan Sunday');
    expect(item?.labels).toEqual([]);
  });

  it('includes the demo review the seed holds', async () => {
    expect((await itemOf('review_seed_1'))?.opens).toBe('/review?week=2026-01-05');
  });
});

describe('an unfinished review', () => {
  it('is not in the context, by id or by its words', async () => {
    const review = await store.saveReview({
      period: 'week',
      from: '2026-09-14',
      answers: { worked: 'Secret draft wording' },
    });

    const built = await context.buildContext('question');

    expect(built.items.find((item) => item.id === review.id)).toBeUndefined();
    expect(context.serializeContext(built)).not.toContain('Secret draft wording');
  });
});

describe('the size budget', () => {
  it('still holds with reviews in the context', async () => {
    let from = '2025-01-06';
    for (let week = 0; week < 20; week += 1) {
      await store.saveReview({ period: 'week', from, answers: { worked: 'x'.repeat(200) }, completed: true });
      from = shiftDayKey(from, 7);
    }
    const built = await context.buildContext('question');
    expect(built.items.filter((item) => item.type === 'review').length).toBe(21);
    expect(context.serializeContext(built).length).toBeLessThanOrEqual(limits.contextMaxChars);
  });
});
