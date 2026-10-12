/**
 * The seed `npm run dev:sandbox` starts from: the demo habit history moved to
 * end yesterday, so the Habits screen's thirty days, the streak and a day off
 * have something to show on whatever day the sandbox is started.
 */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { dayKeysEndingAt, shiftDayKey } from '@/lib/domain/dates.js';
import { HABITS_WINDOW_DAYS, historyRows, STREAK_WINDOW_DAYS, streak } from '@/lib/domain/derive/habits.js';
import { seedForSandbox } from '@/scripts/sandbox-seed.js';

/** @param {string} date @param {Record<string, boolean | number>} habits @param {any[]} meals */
const log = (date, habits, meals = []) => ({ date, habits, meals, measurements: [], notes: [] });

/** @typedef {{ schemaVersion: number, dailyLogs: Record<string, any> }} SeedFixture */

/** @returns {SeedFixture} */
const seed = () => ({
  schemaVersion: 16,
  dailyLogs: {
    '2026-01-05': log('2026-01-05', { habit_move: true }, [{ id: 'meal_1', name: 'Porridge' }]),
    '2026-01-10': log('2026-01-10', { habit_move: false, habit_deep_work: 1 }),
  },
});

describe('seedForSandbox', () => {
  // Wednesday 14 October 2026: yesterday is Tuesday the 13th.
  const TODAY = '2026-10-14';

  it('moves each day\'s habit values so the newest lands on yesterday, the days between kept', () => {
    const logs = seedForSandbox(seed(), TODAY).dailyLogs;
    const moved = Object.keys(logs).filter((day) => Object.keys(logs[day].habits).length > 0).sort();

    expect(moved).toEqual(['2026-10-08', '2026-10-13']);
    expect(logs['2026-10-13']).toEqual(log('2026-10-13', { habit_move: false, habit_deep_work: 1 }));
  });

  it('leaves meals, measurements and notes on the days they were seeded', () => {
    const logs = seedForSandbox(seed(), TODAY).dailyLogs;

    expect(logs['2026-01-05']).toEqual(log('2026-01-05', {}, [{ id: 'meal_1', name: 'Porridge' }]));
    // A day that held only habit values is gone, not left behind empty.
    expect(logs['2026-01-10']).toBeUndefined();
  });

  it('moves a history longer than the move without one day overwriting another', () => {
    /** @type {SeedFixture} */
    const near = {
      schemaVersion: 16,
      dailyLogs: {
        '2026-01-12': log('2026-01-12', { habit_deep_work: 3 }),
        '2026-01-13': log('2026-01-13', { habit_deep_work: 2 }),
      },
    };
    // Yesterday is the 14th: one day on, the 12th lands where the 13th was.
    expect(seedForSandbox(near, '2026-01-15').dailyLogs).toEqual({
      '2026-01-13': log('2026-01-13', { habit_deep_work: 3 }),
      '2026-01-14': log('2026-01-14', { habit_deep_work: 2 }),
    });
  });

  it('changes nothing in the seed it was given', () => {
    const original = seed();
    seedForSandbox(original, TODAY);
    expect(original).toEqual(seed());
  });

  it('moves nothing when the habit history already ends yesterday', () => {
    expect(seedForSandbox(seed(), '2026-01-11')).toEqual(seed());
  });

  it('gives the demo data a streak, a rated week and a day off on every day of the week', async () => {
    const demo = JSON.parse(await readFile('data/seed.json', 'utf8'));

    for (const today of dayKeysEndingAt(7, TODAY)) {
      const sandboxed = seedForSandbox(demo, today);
      const days = (/** @type {number} */ count) =>
        dayKeysEndingAt(count, today).map((date) => sandboxed.dailyLogs[date] ?? log(date, {}));
      const rows = historyRows(sandboxed.profile.habits, days(HABITS_WINDOW_DAYS));
      const states = rows.flatMap((row) => row.cells.map((cell) => cell.state));

      expect(streak(sandboxed.profile.habits, days(STREAK_WINDOW_DAYS), today), today).toBeGreaterThan(0);
      expect(rows.every((row) => row.ratedDays >= 7), today).toBe(true);
      expect(states.some((state) => state === 'off' || state === 'off-done'), today).toBe(true);
      expect(Object.keys(sandboxed.dailyLogs).includes(shiftDayKey(today, -1)), today).toBe(true);
    }
  });
});
