import { describe, expect, it } from 'vitest';

import { resolveReviewWeek } from '@/lib/domain/review-week.js';

// 2026-10-05 is a Monday, 2026-10-11 the Sunday after it.
describe('which week the Review screen opens on', () => {
  it('opens on the week before on any day but Sunday', () => {
    for (const today of ['2026-10-05', '2026-10-07', '2026-10-10']) {
      expect(resolveReviewWeek(undefined, today).from).toBe('2026-09-28');
    }
  });

  it('opens on the week containing today on a Sunday', () => {
    expect(resolveReviewWeek(undefined, '2026-10-11').from).toBe('2026-10-05');
  });

  it('honours a Monday in the past or this week', () => {
    expect(resolveReviewWeek('2026-08-03', '2026-10-07').from).toBe('2026-08-03');
    expect(resolveReviewWeek('2026-10-05', '2026-10-07').from).toBe('2026-10-05');
  });

  it('falls back to the default for anything else', () => {
    for (const bad of ['', 'soon', '2026-13-45', '2026-10-06', '2026-10-12', ['2026-10-05', 'x'], null]) {
      expect(resolveReviewWeek(/** @type {any} */ (bad), '2026-10-07').from).toBe('2026-09-28');
    }
  });

  it('steps back freely and forward only to the week containing today', () => {
    const past = resolveReviewWeek('2026-09-28', '2026-10-07');
    expect(past.previous).toBe('2026-09-21');
    expect(past.next).toBe('2026-10-05');
    expect(past.isCurrent).toBe(false);

    const current = resolveReviewWeek('2026-10-05', '2026-10-07');
    expect(current.next).toBeNull();
    expect(current.isCurrent).toBe(true);
  });

  it('crosses a year end', () => {
    const week = resolveReviewWeek('2025-12-29', '2026-01-07');
    expect(week.previous).toBe('2025-12-22');
    expect(week.next).toBe('2026-01-05');
  });
});
