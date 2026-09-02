import { describe, expect, it } from 'vitest';

import { completionRatio, ratesByHabit, streak } from '@/lib/domain/derive/habits.js';
import { averagesOverRecordedDays, caloriesFromMacros, dayTotals } from '@/lib/domain/derive/nutrition.js';

const habits = [
  { id: 'habit_move', label: 'Move', type: 'check', target: null, archived: false },
  { id: 'habit_water', label: 'Water', type: 'counter', target: 8, archived: false },
];

/** @returns {any} */
const log = (/** @type {any} */ date, /** @type {any} */ habitState, /** @type {any} */ meals = []) => ({
  date, habits: habitState, meals, measurements: [], notes: [],
});

describe('habit completion', () => {
  it('counts checks whole and counters in proportion', () => {
    expect(completionRatio(/** @type {any} */ (habits), log('2026-01-05', { habit_move: true, habit_water: 4 })))
      .toBeCloseTo(0.75);
  });

  it('never lets a counter go past its target', () => {
    expect(completionRatio(/** @type {any} */ (habits), log('2026-01-05', { habit_move: true, habit_water: 20 })))
      .toBe(1);
  });

  it('ignores archived habits for today', () => {
    const withArchived = [...habits, { id: 'habit_old', label: 'Old', type: 'check', target: null, archived: true }];
    expect(completionRatio(/** @type {any} */ (withArchived), log('2026-01-05', { habit_move: true, habit_water: 8 })))
      .toBe(1);
  });
});

describe('streak', () => {
  it('counts consecutive days with at least one habit done', () => {
    const logs = [
      log('2026-01-02', { habit_move: true }),
      log('2026-01-03', { habit_move: true }),
      log('2026-01-04', { habit_water: 3 }),
      log('2026-01-05', { habit_move: true }),
    ];
    expect(streak(/** @type {any} */ (habits), /** @type {any} */ (logs), '2026-01-05')).toBe(4);
  });

  it('does not break on a today that is not done yet', () => {
    // Breaking a streak at 00:01 would be punishing someone for waking up.
    const logs = [
      log('2026-01-03', { habit_move: true }),
      log('2026-01-04', { habit_move: true }),
      log('2026-01-05', {}),
    ];
    expect(streak(/** @type {any} */ (habits), /** @type {any} */ (logs), '2026-01-05')).toBe(2);
  });

  it('breaks on a missed day in the past', () => {
    const logs = [
      log('2026-01-02', { habit_move: true }),
      log('2026-01-03', {}),
      log('2026-01-04', { habit_move: true }),
      log('2026-01-05', { habit_move: true }),
    ];
    expect(streak(/** @type {any} */ (habits), /** @type {any} */ (logs), '2026-01-05')).toBe(2);
  });

  it('rates each habit over recorded days only', () => {
    const logs = [
      log('2026-01-03', { habit_move: true, habit_water: 8 }),
      log('2026-01-04', { habit_move: false, habit_water: 4 }),
      log('2026-01-05', {}),
    ];
    const rates = ratesByHabit(/** @type {any} */ (habits), /** @type {any} */ (logs));
    expect(rates.habit_move).toBeCloseTo(0.5);
    expect(rates.habit_water).toBeCloseTo(0.75);
  });
});

describe('nutrition', () => {
  it('uses the exact formula, never the model', () => {
    // 4 kcal per gram of protein and carbs, 9 for fat. Where an exact
    // formula exists, the formula wins: instant, free, never wrong.
    expect(caloriesFromMacros({ protein: 48, carbs: 78, fat: 11 })).toBe(48 * 4 + 78 * 4 + 11 * 9);
  });

  it('totals a day', () => {
    const day = dayTotals(
      /** @type {any} */ (log('2026-01-05', {}, [
        { id: 'meal_1', time: '08:30', name: 'a', calories: 380, protein: 12, carbs: 62, fat: 9, estimated: true },
        { id: 'meal_2', time: '13:15', name: 'b', calories: 640, protein: 48, carbs: 78, fat: 11, estimated: true },
      ]))
    );
    expect(day.calories).toBe(1020);
    expect(day.meals).toBe(2);
  });

  it('averages over recorded days only, and says how many', () => {
    // A day with no meals is a day you did not record, not a day you did not
    // eat. Counting it as zero would make every skipped day flatter the
    // average -- the card congratulating you for ignoring it.
    const logs = [
      log('2026-01-03', {}, [{ id: 'm1', time: '08:00', name: 'a', calories: 2000, protein: 100, carbs: 200, fat: 60, estimated: false }]),
      log('2026-01-04', {}, []),
      log('2026-01-05', {}, [{ id: 'm2', time: '08:00', name: 'b', calories: 2400, protein: 120, carbs: 240, fat: 80, estimated: false }]),
    ];

    const averages = averagesOverRecordedDays(/** @type {any} */ (logs));
    expect(averages.calories).toBe(2200);
    expect(averages.recordedDays).toBe(2);
  });

  it('returns zeroes and a zero count when nothing was recorded', () => {
    const averages = averagesOverRecordedDays(/** @type {any} */ ([log('2026-01-05', {}, [])]));
    expect(averages.recordedDays).toBe(0);
    expect(averages.calories).toBe(0);
  });
});
