import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dayKeyRange,
  dayKeysEndingAt,
  isDayKey,
  shiftDayKey,
  toDayKey,
  weekDayKeys,
} from '@/lib/domain/dates.js';

describe('toDayKey', () => {
  it('resolves an instant in the requested zone, not the server zone', () => {
    // 22:30 UTC is already the next day in Rome (UTC+2 in June). This is the
    // exact failure this module exists to prevent: a habit ticked late in the
    // evening must land on today, not on yesterday.
    const instant = new Date('2026-06-15T22:30:00Z');

    expect(toDayKey(instant, 'Europe/Rome')).toBe('2026-06-16');
    expect(toDayKey(instant, 'UTC')).toBe('2026-06-15');
    expect(toDayKey(instant, 'America/New_York')).toBe('2026-06-15');
  });

  it('resolves an instant just after UTC midnight', () => {
    const instant = new Date('2026-01-01T00:30:00Z');

    expect(toDayKey(instant, 'UTC')).toBe('2026-01-01');
    expect(toDayKey(instant, 'Europe/Rome')).toBe('2026-01-01');
    expect(toDayKey(instant, 'America/New_York')).toBe('2025-12-31');
  });
});

describe('isDayKey', () => {
  it('accepts real calendar days', () => {
    expect(isDayKey('2026-01-01')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
  });

  it('rejects well-shaped strings that are not real days', () => {
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('2027-02-29')).toBe(false);
  });

  it('rejects anything that is not a day key', () => {
    expect(isDayKey('yesterday')).toBe(false);
    expect(isDayKey('2026-1-1')).toBe(false);
    expect(isDayKey(20260101)).toBe(false);
    expect(isDayKey(null)).toBe(false);
  });
});

describe('shiftDayKey', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDayKey('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is unaffected by daylight saving transitions', () => {
    // Central European Summer Time starts on 2026-03-29. A day key has no
    // clock time, so the shift must stay pure calendar arithmetic.
    expect(shiftDayKey('2026-03-28', 1)).toBe('2026-03-29');
    expect(shiftDayKey('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftDayKey('2026-10-25', -1)).toBe('2026-10-24');
  });

  it('rejects an invalid day key', () => {
    expect(() => shiftDayKey('2026-02-30', 1)).toThrow();
  });
});

describe('dayKeysEndingAt', () => {
  it('returns the window oldest first, ending on the given day', () => {
    expect(dayKeysEndingAt(3, '2026-01-02')).toEqual([
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
  });

  it('returns the health window at full length', () => {
    const window = dayKeysEndingAt(30, '2026-06-15');

    expect(window).toHaveLength(30);
    expect(window.at(0)).toBe('2026-05-17');
    expect(window.at(-1)).toBe('2026-06-15');
  });

  it('rejects a non-positive count', () => {
    expect(() => dayKeysEndingAt(0, '2026-01-01')).toThrow();
  });
});

describe('weekDayKeys', () => {
  it('returns Monday through Sunday of the week containing the given day', () => {
    // 2026-01-07 is a Wednesday.
    expect(weekDayKeys('2026-01-07')).toEqual([
      '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08',
      '2026-01-09', '2026-01-10', '2026-01-11',
    ]);
  });

  it('treats Monday itself as the start of its own week', () => {
    expect(weekDayKeys('2026-01-05').at(0)).toBe('2026-01-05');
  });

  it('treats Sunday as the end of its week, not the start of the next', () => {
    expect(weekDayKeys('2026-01-11')).toEqual(weekDayKeys('2026-01-05'));
  });

  it('crosses a month boundary', () => {
    // 2026-02-01 is a Sunday, closing the week that started 2026-01-26.
    expect(weekDayKeys('2026-02-01').at(0)).toBe('2026-01-26');
    expect(weekDayKeys('2026-02-01').at(-1)).toBe('2026-02-01');
  });

  it('rejects an invalid day key', () => {
    expect(() => weekDayKeys('2026-02-30')).toThrow();
  });
});

describe('dayKeyRange', () => {
  it('is inclusive at both ends', () => {
    expect(dayKeyRange('2026-01-30', '2026-02-02')).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
  });

  it('accepts a single-day range', () => {
    expect(dayKeyRange('2026-01-01', '2026-01-01')).toEqual(['2026-01-01']);
  });

  it('rejects a reversed range', () => {
    expect(() => dayKeyRange('2026-01-02', '2026-01-01')).toThrow();
  });
});

describe('using dates.js from a client component', () => {
  // A stubbed `window` reproduces the one condition lib/config/env.js checks
  // for. Real browsers never run these tests; this is the cheapest way to
  // prove the module survives being imported from one.
  const shared = /** @type {any} */ (globalThis);

  beforeEach(() => {
    shared.window = {};
    vi.resetModules();
  });

  afterEach(() => {
    delete shared.window;
    vi.resetModules();
  });

  it('runs pure calendar arithmetic with no import of configuration', async () => {
    const dates = await import('@/lib/domain/dates.js');

    expect(dates.shiftDayKey('2026-01-01', 1)).toBe('2026-01-02');
  });

  it('resolves a day key given an explicit timezone', async () => {
    const { toDayKey: toDayKeyUnderBrowser } = await import('@/lib/domain/dates.js');

    expect(toDayKeyUnderBrowser(new Date('2026-06-15T22:30:00Z'), 'Europe/Rome')).toBe(
      '2026-06-16'
    );
  });
});

describe('the timezone default today() and toDayKey() fall back to', () => {
  // Well-known symbol dates.js uses to receive the default from lib/config/env.js
  // -- see the "why globalThis" rationale in ADR-0011. Cleared around every
  // test here so none of them depend on run order.
  const DEFAULT_TIMEZONE_KEY = Symbol.for('personalos.domain.dates.defaultTimezone');
  const shared = /** @type {any} */ (globalThis);

  afterEach(() => {
    delete shared[DEFAULT_TIMEZONE_KEY];
    vi.resetModules();
    vi.useRealTimers();
  });

  it('throws a clear error rather than silently falling back to the machine zone', async () => {
    delete shared[DEFAULT_TIMEZONE_KEY];
    vi.resetModules();

    const { today: freshToday } = await import('@/lib/domain/dates.js');

    expect(() => freshToday()).toThrow(/timezone/i);
  });

  it('is set once lib/config/env.js has been imported', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T22:30:00Z'));

    await import('@/lib/config/env.js');
    const { today: freshToday } = await import('@/lib/domain/dates.js');

    expect(freshToday()).toBe('2026-06-16'); // Europe/Rome, the config default, is UTC+2 in June
  });
});
