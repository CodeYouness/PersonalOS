/**
 * The seed `npm run dev:sandbox` starts from: the demo habit history moved to
 * end in the last week, so the Habits screen's thirty days, the streak and a
 * day off have something to show on whatever day the sandbox is started.
 */

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { HABITS_WINDOW_DAYS, historyRows } from '@/lib/domain/derive/habits.js';
import { dayKeysEndingAt, weekdayOf } from '@/lib/domain/dates.js';
import { seedForSandbox } from '@/scripts/sandbox-seed.js';

/** @param {string} date @param {Record<string, boolean | number>} habits @param {any[]} meals */
const log = (date, habits, meals = []) => ({ date, habits, meals, measurements: [], notes: [] });

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

  it('moves each day\'s habit values by whole weeks, so the newest falls in the week ending yesterday', () => {
    const logs = seedForSandbox(seed(), TODAY).dailyLogs;
    const moved = Object.keys(logs).filter((day) => Object.keys(logs[day].habits).length > 0).sort();

    // Saturday 10 January lands on Saturday 10 October, 39 weeks on.
    expect(moved).toEqual(['2026-10-05', '2026-10-10']);
    expect(moved.map(weekdayOf)).toEqual([weekdayOf('2026-01-05'), weekdayOf('2026-01-10')]);
    expect(logs['2026-10-10']).toEqual(log('2026-10-10', { habit_move: false, habit_deep_work: 1 }));
  });

  it('leaves meals, measurements and notes on the days they were seeded', () => {
    const logs = seedForSandbox(seed(), TODAY).dailyLogs;

    expect(logs['2026-01-05']).toEqual(log('2026-01-05', {}, [{ id: 'meal_1', name: 'Porridge' }]));
    // A day that held only habit values is gone, not left behind empty.
    expect(logs['2026-01-10']).toBeUndefined();
  });

  it('changes nothing in the seed it was given', () => {
    const original = seed();
    seedForSandbox(original, TODAY);
    expect(original).toEqual(seed());
  });

  it('moves nothing when the habit history already ends in the last week', () => {
    expect(seedForSandbox(seed(), '2026-01-12')).toEqual(seed());
  });

  it('gives the demo data a recent history on the Habits screen, with a day off on it', async () => {
    const demo = JSON.parse(await readFile('data/seed.json', 'utf8'));
    const sandboxed = seedForSandbox(demo, TODAY);
    const window = dayKeysEndingAt(HABITS_WINDOW_DAYS, TODAY).map(
      (date) => sandboxed.dailyLogs[date] ?? log(date, {})
    );
    const rows = historyRows(sandboxed.profile.habits, window);
    const states = rows.flatMap((row) => row.cells.map((cell) => cell.state));

    expect(rows.every((row) => row.ratedDays >= 7)).toBe(true);
    expect(states).toContain('off');
    expect(states).toContain('off-done');
    expect(states).toContain('unrecorded');
  });
});
