import { describe, expect, it } from 'vitest';

import { lastWeekFrom, lastWeekReview } from '@/lib/domain/derive/review.js';

// 2026-10-07 is a Wednesday; its week starts Monday 2026-10-05.
const TODAY = '2026-10-07';

/** @param {string} from @param {string} lever @param {string | null} completedAt */
const review = (from, lever, completedAt) => ({ period: 'week', from, lever, completedAt });

describe("this week's lever", () => {
  it('is the Monday before this week that the lever comes from', () => {
    expect(lastWeekFrom(TODAY)).toBe('2026-09-28');
    expect(lastWeekFrom('2026-10-05')).toBe('2026-09-28');
    expect(lastWeekFrom('2026-10-11')).toBe('2026-09-28');
  });

  it('is none without a review, and last week is pending', () => {
    expect(lastWeekReview(null, TODAY)).toEqual({ from: '2026-09-28', lever: null, pending: true });
  });

  it("never shows an unfinished review's lever", () => {
    const result = lastWeekReview(review('2026-09-28', 'Pricing page first', null), TODAY);
    expect(result.lever).toBeNull();
    expect(result.pending).toBe(true);
  });

  it('is none when the completed review left the lever empty, and nothing is pending', () => {
    for (const empty of ['', '   ']) {
      const result = lastWeekReview(review('2026-09-28', empty, '2026-10-04T20:00:00.000Z'), TODAY);
      expect(result.lever).toBeNull();
      expect(result.pending).toBe(false);
    }
  });

  it('ignores a completed review from two weeks ago', () => {
    const result = lastWeekReview(review('2026-09-21', 'Old lever', '2026-09-27T20:00:00.000Z'), TODAY);
    expect(result.lever).toBeNull();
    expect(result.pending).toBe(true);
  });

  it("shows the completed review of last week's lever", () => {
    const result = lastWeekReview(review('2026-09-28', 'Pricing page first', '2026-10-04T20:00:00.000Z'), TODAY);
    expect(result).toEqual({ from: '2026-09-28', lever: 'Pricing page first', pending: false });
  });

  it('shows the lever from Monday, but a review of the current week not at all', () => {
    expect(lastWeekReview(review('2026-10-05', 'x', '2026-10-06T08:00:00.000Z'), TODAY).lever).toBeNull();
    expect(lastWeekReview(review('2026-09-28', 'x', '2026-10-04T20:00:00.000Z'), '2026-10-05').lever).toBe('x');
  });
});
