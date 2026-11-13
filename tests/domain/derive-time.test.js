/**
 * Time declared against areas (ADR 0037): a day's total, and the time by area
 * over a span. Only declared days count -- a day never declared is unknown,
 * not zero, and a day declared with nothing is a known zero.
 */

import { describe, expect, it } from 'vitest';

import { dayTimeTotal, timeByArea } from '@/lib/domain/derive/time.js';

/** @returns {any} */
const log = (/** @type {string} */ date, /** @type {any} */ time = null) => ({
  date, habits: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, time,
});

describe('dayTimeTotal', () => {
  it('adds the minutes of every area declared that day', () => {
    expect(dayTimeTotal(log('2026-10-05', { work: 240, training: 90 }))).toBe(330);
  });

  it('is zero for a day declared with nothing', () => {
    expect(dayTimeTotal(log('2026-10-05', {}))).toBe(0);
  });

  it('is unknown, not zero, for a day never declared', () => {
    expect(dayTimeTotal(log('2026-10-05'))).toBeNull();
    // A log read before the field existed has no key at all.
    const { time: _time, ...older } = log('2026-10-05');
    expect(dayTimeTotal(/** @type {any} */ (older))).toBeNull();
  });
});

describe('timeByArea', () => {
  const SPAN = { from: '2026-10-05', to: '2026-10-11' };

  it('sums each area over the declared days of the span, in the order of the areas', () => {
    const result = timeByArea(
      [
        log('2026-10-05', { training: 60, work: 240 }),
        log('2026-10-06', { work: 180, study: 30 }),
        log('2026-10-07'),
      ],
      SPAN
    );
    expect(result).toEqual({ declaredDays: 2, byArea: { work: 420, study: 30, training: 60 }, total: 510 });
    expect(Object.keys(result.byArea)).toEqual(['work', 'study', 'training']);
  });

  it('counts a day declared with nothing as a declared day with no time', () => {
    const result = timeByArea([log('2026-10-05', {}), log('2026-10-06', { projects: 90 })], SPAN);
    expect(result).toEqual({ declaredDays: 2, byArea: { projects: 90 }, total: 90 });
    expect(timeByArea([log('2026-10-05', {})], SPAN)).toEqual({ declaredDays: 1, byArea: {}, total: 0 });
  });

  it('has no total, not zero, when no day of the span was declared', () => {
    expect(timeByArea([log('2026-10-05'), log('2026-10-06')], SPAN)).toEqual({ declaredDays: 0, byArea: {}, total: null });
    expect(timeByArea([], SPAN)).toEqual({ declaredDays: 0, byArea: {}, total: null });
  });

  it('leaves out the days outside the span, both ends included', () => {
    const result = timeByArea(
      [
        log('2026-10-04', { work: 600 }),
        log('2026-10-05', { work: 60 }),
        log('2026-10-11', { refereeing: 120 }),
        log('2026-10-12', { work: 600 }),
      ],
      SPAN
    );
    expect(result).toEqual({ declaredDays: 2, byArea: { work: 60, refereeing: 120 }, total: 180 });
  });
});
