import { describe, expect, it } from 'vitest';

import { completionRatio, historyRows, isActiveOn, justCompleted, ratesByHabit, streak } from '@/lib/domain/derive/habits.js';
import { averagesOverRecordedDays, caloriesFromMacros, dayTotals } from '@/lib/domain/derive/nutrition.js';

const open = (/** @type {string} */ from) => [{ from, to: /** @type {string | null} */ (null) }];

const habits = [
  { id: 'habit_move', label: 'Move', type: 'check', target: null, periods: open('2026-01-01') },
  { id: 'habit_water', label: 'Water', type: 'counter', target: 8, periods: open('2026-01-01') },
];

/** @returns {any} */
const log = (/** @type {any} */ date, /** @type {any} */ habitState, /** @type {any} */ meals = []) => ({
  date, habits: habitState, meals, measurements: [], notes: [],
});

describe('isActiveOn', () => {
  it('is active from the period start onward when the period is still open', () => {
    const habit = { periods: [{ from: '2026-01-05', to: null }] };
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-04')).toBe(false);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-05')).toBe(true);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-06-01')).toBe(true);
  });

  it('is not active on or after a closed period\'s end', () => {
    const habit = { periods: [{ from: '2026-01-01', to: '2026-01-10' }] };
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-09')).toBe(true);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-10')).toBe(false);
  });

  it('is not active in the gap between an archived period and a restore', () => {
    const habit = { periods: [{ from: '2026-01-01', to: '2026-01-05' }, { from: '2026-01-10', to: null }] };
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-07')).toBe(false);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-10')).toBe(true);
  });
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

  it('ignores a habit archived before that day, but not one archived after it', () => {
    const archivedBefore = { id: 'habit_old', label: 'Old', type: 'check', target: null, periods: [{ from: '2026-01-01', to: '2026-01-04' }] };
    const archivedAfter = { id: 'habit_new', label: 'New', type: 'check', target: null, periods: [{ from: '2026-01-01', to: '2026-01-06' }] };

    const withArchivedBefore = [...habits, archivedBefore];
    expect(completionRatio(/** @type {any} */ (withArchivedBefore), log('2026-01-05', { habit_move: true, habit_water: 8 })))
      .toBe(1);

    const withArchivedAfter = [...habits, archivedAfter];
    expect(completionRatio(/** @type {any} */ (withArchivedAfter), log('2026-01-05', { habit_move: true, habit_water: 8, habit_new: true })))
      .toBeCloseTo(1);
  });

  it('counts nowhere before its first period', () => {
    const notYetStarted = { id: 'habit_future', label: 'Future', type: 'check', target: null, periods: open('2026-02-01') };
    expect(completionRatio(/** @type {any} */ ([notYetStarted]), log('2026-01-05', { habit_future: true })))
      .toBe(0);
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

  it('does not let a stale tick before a habit\'s period start extend the streak', () => {
    const lateStarter = { id: 'habit_late', label: 'Late', type: 'check', target: null, periods: open('2026-01-04') };
    const logs = [
      log('2026-01-02', { habit_late: true }),
      log('2026-01-03', { habit_late: true }),
      log('2026-01-04', { habit_late: true }),
    ];
    expect(streak(/** @type {any} */ ([lateStarter]), /** @type {any} */ (logs), '2026-01-04')).toBe(1);
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

  it('ignores days in an archived-then-restored gap when rating a habit', () => {
    const restarted = {
      id: 'habit_restarted', label: 'Restarted', type: 'check', target: null,
      periods: [{ from: '2026-01-01', to: '2026-01-03' }, { from: '2026-01-05', to: null }],
    };
    const logs = [
      log('2026-01-02', { habit_restarted: true }),
      log('2026-01-03', { habit_restarted: false }),
      log('2026-01-04', { habit_restarted: false }),
      log('2026-01-05', { habit_restarted: true }),
    ];
    const rates = ratesByHabit(/** @type {any} */ ([restarted]), /** @type {any} */ (logs));
    expect(rates.habit_restarted).toBe(1);
  });
});

describe('history heatmap', () => {
  /** Five days rather than thirty, so a whole row fits in one assertion. */
  const windowLogs = [
    log('2026-01-01', { habit_move: true, habit_water: 8 }),
    log('2026-01-02', { habit_move: false, habit_water: 2 }),
    log('2026-01-03', {}),
    log('2026-01-04', { habit_move: true, habit_water: 4 }),
    log('2026-01-05', { habit_move: true, habit_water: 7 }),
  ];

  const states = (/** @type {any} */ row) => row.cells.map((/** @type {any} */ cell) => cell.state);

  it('gives a check only zero and full cells', () => {
    const [row] = historyRows(/** @type {any} */ ([habits[0]]), /** @type {any} */ (windowLogs));
    expect(states(row)).toEqual(['full', 'zero', 'unrecorded', 'full', 'full']);
  });

  it('grades a counter by how close it came to its target', () => {
    const [row] = historyRows(/** @type {any} */ ([habits[1]]), /** @type {any} */ (windowLogs));
    expect(states(row)).toEqual(['full', 'low', 'unrecorded', 'mid', 'high']);
  });

  it('closes each band at its own boundary', () => {
    const thirds = { id: 'habit_thirds', label: 'Thirds', type: 'counter', target: 3, periods: open('2026-01-01') };
    const logs = [
      log('2026-01-01', { habit_thirds: 1 }),
      log('2026-01-02', { habit_thirds: 2 }),
      log('2026-01-03', { habit_thirds: 3 }),
      log('2026-01-04', { habit_thirds: 0 }),
    ];
    const [row] = historyRows(/** @type {any} */ ([thirds]), /** @type {any} */ (logs));
    expect(states(row)).toEqual(['low', 'mid', 'full', 'zero']);
  });

  it('has no cell on the days before a habit was created', () => {
    const born = { id: 'habit_new', label: 'New', type: 'check', target: null, periods: open('2026-01-04') };
    const [row] = historyRows(/** @type {any} */ ([born]), /** @type {any} */ (windowLogs));
    expect(states(row)).toEqual(['inactive', 'inactive', 'inactive', 'zero', 'zero']);
  });

  it('has no cell while a habit was archived, and cells again after a restore', () => {
    const restarted = {
      id: 'habit_restarted', label: 'Restarted', type: 'check', target: null,
      periods: [{ from: '2026-01-01', to: '2026-01-02' }, { from: '2026-01-05', to: null }],
    };
    const [row] = historyRows(/** @type {any} */ ([restarted]), /** @type {any} */ (windowLogs));
    expect(states(row)).toEqual(['zero', 'inactive', 'inactive', 'inactive', 'zero']);
  });

  it('keeps an archived habit\'s row, labelled archived, when it was active in the window', () => {
    const archived = {
      id: 'habit_old', label: 'Old', type: 'check', target: null,
      periods: [{ from: '2026-01-01', to: '2026-01-03' }],
    };
    const rows = historyRows(/** @type {any} */ ([...habits, archived]), /** @type {any} */ (windowLogs));

    expect(rows.map((row) => row.habit.id)).toEqual(['habit_move', 'habit_water', 'habit_old']);
    expect(rows.map((row) => row.archived)).toEqual([false, false, true]);
  });

  it('drops a habit that was active on no day of the window', () => {
    const gone = {
      id: 'habit_gone', label: 'Gone', type: 'check', target: null,
      periods: [{ from: '2025-12-01', to: '2025-12-20' }],
    };
    expect(historyRows(/** @type {any} */ ([gone]), /** @type {any} */ (windowLogs))).toEqual([]);
  });

  it('carries the rate and the value a correction starts from', () => {
    const [row] = historyRows(/** @type {any} */ ([habits[1]]), /** @type {any} */ (windowLogs));
    // A counter's unrecorded day starts a correction from zero, not undefined.
    expect(row.cells.map((cell) => cell.value)).toEqual([8, 2, 0, 4, 7]);
    // Recorded days only: (8/8 + 2/8 + 4/8 + 7/8) / 4.
    expect(row.rate).toBeCloseTo(0.65625);
  });

  it('starts a check\'s correction from a boolean', () => {
    const [row] = historyRows(/** @type {any} */ ([habits[0]]), /** @type {any} */ (windowLogs));
    expect(row.cells.map((cell) => cell.value)).toEqual([true, false, false, true, true]);
  });

  it('dates every cell, so a correction is tracked by habit and day', () => {
    const [row] = historyRows(/** @type {any} */ ([habits[0]]), /** @type {any} */ (windowLogs));
    expect(row.cells.map((cell) => cell.date)).toEqual(windowLogs.map((entry) => entry.date));
  });
});

describe('justCompleted', () => {
  const check = { id: 'habit_move', label: 'Move', type: 'check', target: null, periods: open('2026-01-01') };
  const counter = { id: 'habit_water', label: 'Water', type: 'counter', target: 8, periods: open('2026-01-01') };

  it('fires when a check flips from unset to true', () => {
    expect(justCompleted(/** @type {any} */ (check), undefined, true)).toBe(true);
  });

  it('does not fire on untick', () => {
    expect(justCompleted(/** @type {any} */ (check), true, false)).toBe(false);
  });

  it('does not fire twice for a check already true', () => {
    expect(justCompleted(/** @type {any} */ (check), true, true)).toBe(false);
  });

  it('fires only when a counter reaches its target, not on an intermediate step', () => {
    expect(justCompleted(/** @type {any} */ (counter), 3, 4)).toBe(false);
    expect(justCompleted(/** @type {any} */ (counter), 7, 8)).toBe(true);
  });

  it('does not fire when a counter was already at or past target', () => {
    expect(justCompleted(/** @type {any} */ (counter), 8, 9)).toBe(false);
  });

  it('does not fire on a decrement, even one that stays at or above target', () => {
    expect(justCompleted(/** @type {any} */ (counter), 9, 8)).toBe(false);
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
