import { describe, expect, it } from 'vitest';

import { completionRatio, habitsForDay, historyRows, isActiveOn, isScheduledOn, justCompleted, ratesByHabit, streak, windowSummary } from '@/lib/domain/derive/habits.js';
import { averagesOverRecordedDays, caloriesFromMacros, dayTotals } from '@/lib/domain/derive/nutrition.js';

/** Every weekday, ISO 1 (Monday) to 7 (Sunday): a habit kept every day. */
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

const open = (/** @type {string} */ from, /** @type {number | null} */ target = null) => [
  { from, to: /** @type {string | null} */ (null), days: ALL_DAYS, target },
];

const habits = [
  { id: 'habit_move', label: 'Move', type: 'check', periods: open('2026-01-01') },
  { id: 'habit_water', label: 'Water', type: 'counter', periods: open('2026-01-01', 8) },
];

/** @returns {any} */
const log = (/** @type {any} */ date, /** @type {any} */ habitState, /** @type {any} */ meals = []) => ({
  date, habits: habitState, meals, measurements: [], notes: [],
});

describe('isActiveOn', () => {
  it('is active from the period start onward when the period is still open', () => {
    const habit = { periods: [{ from: '2026-01-05', to: null, days: ALL_DAYS, target: null }] };
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-04')).toBe(false);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-05')).toBe(true);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-06-01')).toBe(true);
  });

  it('is not active on or after a closed period\'s end', () => {
    const habit = { periods: [{ from: '2026-01-01', to: '2026-01-10', days: ALL_DAYS, target: null }] };
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-09')).toBe(true);
    expect(isActiveOn(/** @type {any} */ (habit), '2026-01-10')).toBe(false);
  });

  it('is not active in the gap between an archived period and a restore', () => {
    const habit = { periods: [{ from: '2026-01-01', to: '2026-01-05', days: ALL_DAYS, target: null }, { from: '2026-01-10', to: null, days: ALL_DAYS, target: null }] };
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
    const archivedBefore = { id: 'habit_old', label: 'Old', type: 'check', periods: [{ from: '2026-01-01', to: '2026-01-04', days: ALL_DAYS, target: null }] };
    const archivedAfter = { id: 'habit_new', label: 'New', type: 'check', periods: [{ from: '2026-01-01', to: '2026-01-06', days: ALL_DAYS, target: null }] };

    const withArchivedBefore = [...habits, archivedBefore];
    expect(completionRatio(/** @type {any} */ (withArchivedBefore), log('2026-01-05', { habit_move: true, habit_water: 8 })))
      .toBe(1);

    const withArchivedAfter = [...habits, archivedAfter];
    expect(completionRatio(/** @type {any} */ (withArchivedAfter), log('2026-01-05', { habit_move: true, habit_water: 8, habit_new: true })))
      .toBeCloseTo(1);
  });

  it('counts nowhere before its first period', () => {
    const notYetStarted = { id: 'habit_future', label: 'Future', type: 'check', periods: open('2026-02-01') };
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
    const lateStarter = { id: 'habit_late', label: 'Late', type: 'check', periods: open('2026-01-04') };
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
      id: 'habit_restarted', label: 'Restarted', type: 'check',
      periods: [{ from: '2026-01-01', to: '2026-01-03', days: ALL_DAYS, target: null }, { from: '2026-01-05', to: null, days: ALL_DAYS, target: null }],
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
    const thirds = { id: 'habit_thirds', label: 'Thirds', type: 'counter', periods: open('2026-01-01', 3) };
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
    const born = { id: 'habit_new', label: 'New', type: 'check', periods: open('2026-01-04') };
    const [row] = historyRows(/** @type {any} */ ([born]), /** @type {any} */ (windowLogs));
    expect(states(row)).toEqual(['inactive', 'inactive', 'inactive', 'zero', 'zero']);
  });

  it('has no cell while a habit was archived, and cells again after a restore', () => {
    const restarted = {
      id: 'habit_restarted', label: 'Restarted', type: 'check',
      periods: [{ from: '2026-01-01', to: '2026-01-02', days: ALL_DAYS, target: null }, { from: '2026-01-05', to: null, days: ALL_DAYS, target: null }],
    };
    const [row] = historyRows(/** @type {any} */ ([restarted]), /** @type {any} */ (windowLogs));
    expect(states(row)).toEqual(['zero', 'inactive', 'inactive', 'inactive', 'zero']);
  });

  it('keeps an archived habit\'s row, labelled archived, when it was active in the window', () => {
    const archived = {
      id: 'habit_old', label: 'Old', type: 'check',
      periods: [{ from: '2026-01-01', to: '2026-01-03', days: ALL_DAYS, target: null }],
    };
    const rows = historyRows(/** @type {any} */ ([...habits, archived]), /** @type {any} */ (windowLogs));

    expect(rows.map((row) => row.habit.id)).toEqual(['habit_move', 'habit_water', 'habit_old']);
    expect(rows.map((row) => row.archived)).toEqual([false, false, true]);
  });

  it('drops a habit that was active on no day of the window', () => {
    const gone = {
      id: 'habit_gone', label: 'Gone', type: 'check',
      periods: [{ from: '2025-12-01', to: '2025-12-20', days: ALL_DAYS, target: null }],
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

  it('counts the days a rate rests on: recorded and active, so a rate of nothing can be told from 0%', () => {
    const [water] = historyRows(/** @type {any} */ ([habits[1]]), /** @type {any} */ (windowLogs));
    expect(water.ratedDays).toBe(4);

    // Active on the window's last day, but that day holds nothing recorded.
    const born = { id: 'habit_new', label: 'New', type: 'check', periods: open('2026-01-03') };
    const [row] = historyRows(/** @type {any} */ ([born]), /** @type {any} */ ([log('2026-01-03', {}), log('2026-01-04', {})]));
    expect(row.ratedDays).toBe(0);
    expect(row.rate).toBe(0);
  });

  it('dates every cell, so a correction is tracked by habit and day', () => {
    const [row] = historyRows(/** @type {any} */ ([habits[0]]), /** @type {any} */ (windowLogs));
    expect(row.cells.map((cell) => cell.date)).toEqual(windowLogs.map((entry) => entry.date));
  });
});

describe('windowSummary', () => {
  it('reports zeroes, not a division by zero, when nothing was recorded', () => {
    const summary = windowSummary(/** @type {any} */ (habits), /** @type {any} */ ([
      log('2026-01-04', {}),
      log('2026-01-05', {}),
    ]));

    expect(summary.recordedDays).toBe(0);
    expect(summary.days).toBe(2);
    expect(summary.completion).toBe(0);
    expect(summary.perfectDays).toBe(0);
  });

  it('averages completion over recorded days only, and counts the window', () => {
    // An unrecorded day is not a zero (docs/spec.md); counting it would let
    // forgetting to tick look exactly like failing.
    const summary = windowSummary(/** @type {any} */ (habits), /** @type {any} */ ([
      log('2026-01-03', { habit_move: true, habit_water: 8 }),
      log('2026-01-04', {}),
      log('2026-01-05', { habit_move: false, habit_water: 4 }),
    ]));

    expect(summary.recordedDays).toBe(2);
    expect(summary.days).toBe(3);
    expect(summary.completion).toBeCloseTo(0.625);
  });

  it('counts a perfect day out of the recorded days', () => {
    const summary = windowSummary(/** @type {any} */ (habits), /** @type {any} */ ([
      log('2026-01-03', { habit_move: true, habit_water: 8 }),
      log('2026-01-04', { habit_move: true, habit_water: 20 }),
      log('2026-01-05', { habit_move: true, habit_water: 1 }),
    ]));

    // Over target is still one perfect day, never one and a quarter.
    expect(summary.perfectDays).toBe(2);
    expect(summary.recordedDays).toBe(3);
  });

  it('does not read a day no habit was active as a zero', () => {
    // Archiving closes the period at today, so a habit ticked this morning
    // and archived this afternoon leaves the day recorded with nothing
    // active on it. Counting that as 0% would let archiving rewrite the
    // past, which docs/spec.md says it never does -- and would disagree
    // with the heatmap's own rate for the same window.
    const archivedToday = [
      { ...habits[0], periods: [{ from: '2026-01-01', to: '2026-01-05', days: ALL_DAYS, target: null }] },
    ];
    const summary = windowSummary(/** @type {any} */ (archivedToday), /** @type {any} */ ([
      log('2026-01-04', { habit_move: true }),
      log('2026-01-05', { habit_move: true }),
    ]));

    expect(summary.recordedDays).toBe(1);
    expect(summary.completion).toBe(1);
    expect(summary.perfectDays).toBe(1);
  });

  it('stops counting a habit archived mid-window, so the days after it stay perfect', () => {
    const archivedMidWindow = [
      habits[0],
      { ...habits[1], periods: [{ from: '2026-01-01', to: '2026-01-05', days: ALL_DAYS, target: 8 }] },
    ];
    const summary = windowSummary(/** @type {any} */ (archivedMidWindow), /** @type {any} */ ([
      log('2026-01-04', { habit_move: true, habit_water: 8 }),
      log('2026-01-05', { habit_move: true }),
    ]));

    expect(summary.completion).toBe(1);
    expect(summary.perfectDays).toBe(2);
  });
});

describe('justCompleted', () => {
  const check = { id: 'habit_move', label: 'Move', type: 'check', periods: open('2026-01-01') };
  const counter = { id: 'habit_water', label: 'Water', type: 'counter', periods: open('2026-01-01', 8) };

  it('fires when a check flips from unset to true', () => {
    expect(justCompleted(/** @type {any} */ (check), '2026-01-05', undefined, true)).toBe(true);
  });

  it('does not fire on untick', () => {
    expect(justCompleted(/** @type {any} */ (check), '2026-01-05', true, false)).toBe(false);
  });

  it('does not fire twice for a check already true', () => {
    expect(justCompleted(/** @type {any} */ (check), '2026-01-05', true, true)).toBe(false);
  });

  it('fires only when a counter reaches its target, not on an intermediate step', () => {
    expect(justCompleted(/** @type {any} */ (counter), '2026-01-05', 3, 4)).toBe(false);
    expect(justCompleted(/** @type {any} */ (counter), '2026-01-05', 7, 8)).toBe(true);
  });

  it('does not fire when a counter was already at or past target', () => {
    expect(justCompleted(/** @type {any} */ (counter), '2026-01-05', 8, 9)).toBe(false);
  });

  it('does not fire on a decrement, even one that stays at or above target', () => {
    expect(justCompleted(/** @type {any} */ (counter), '2026-01-05', 9, 8)).toBe(false);
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

  it('totals only the meals with numbers, and says how many had none', () => {
    // Unknown is not zero (ADR 0019): a meal said with no model counts
    // towards "how many", never towards "how much".
    const day = dayTotals(
      /** @type {any} */ (log('2026-01-05', {}, [
        { id: 'meal_1', time: '08:30', name: 'a', calories: 380, protein: 12, carbs: 62, fat: 9, estimated: true },
        { id: 'meal_2', time: null, name: 'pizza', calories: null, protein: null, carbs: null, fat: null, estimated: false },
      ]))
    );
    expect(day).toEqual({ calories: 380, protein: 12, carbs: 62, fat: 9, meals: 2, withoutNumbers: 1 });
  });

  it('counts a meal with any number unknown, so an incomplete macro total admits it', async () => {
    const day = dayTotals(
      /** @type {any} */ (log('2026-01-05', {}, [
        { id: 'meal_1', time: '08:30', name: 'a', calories: 380, protein: 12, carbs: 62, fat: 9, estimated: true },
        { id: 'meal_2', time: '20:00', name: 'beer', calories: 200, protein: null, carbs: null, fat: null, estimated: false },
      ]))
    );
    expect(day).toEqual({ calories: 580, protein: 12, carbs: 62, fat: 9, meals: 2, withoutNumbers: 1 });
  });

  it('leaves a total unknown when no meal knows it, rather than calling it zero', () => {
    const unknown = { id: 'm0', time: null, name: 'pizza', calories: null, protein: null, carbs: null, fat: null, estimated: false };
    expect(dayTotals(/** @type {any} */ (log('2026-01-05', {}, [unknown])))).toEqual({
      calories: null, protein: null, carbs: null, fat: null, meals: 1, withoutNumbers: 1,
    });
    expect(dayTotals(/** @type {any} */ (log('2026-01-05', {}, [])))).toEqual({
      calories: null, protein: null, carbs: null, fat: null, meals: 0, withoutNumbers: 0,
    });
  });

  it('counts a day towards a number only when one of its meals knows it (ADR 0020)', () => {
    // A day whose meals all lack calories is still a recorded day, but adding
    // it as 0 kcal would pull the average down -- unknown is not zero.
    const unknown = { id: 'm0', time: null, name: 'pizza', calories: null, protein: null, carbs: null, fat: null, estimated: false };
    const beer = { id: 'm3', time: '20:00', name: 'beer', calories: null, protein: 2, carbs: 13, fat: 0, estimated: true };
    const logs = [
      log('2026-01-03', {}, [{ id: 'm1', time: '08:00', name: 'a', calories: 2000, protein: 100, carbs: 200, fat: 60, estimated: false }]),
      log('2026-01-04', {}, [unknown]),
      log('2026-01-05', {}, [beer]),
    ];

    const averages = averagesOverRecordedDays(/** @type {any} */ (logs));
    expect(averages).toEqual({
      calories: 2000, protein: 51, carbs: 107, fat: 30,
      days: { calories: 1, protein: 2, carbs: 2, fat: 2 },
      recordedDays: 3, withoutNumbers: 2,
    });
  });

  it('leaves every average unknown when nothing was recorded, rather than calling it zero', () => {
    const averages = averagesOverRecordedDays(/** @type {any} */ ([log('2026-01-05', {}, [])]));
    expect(averages).toEqual({
      calories: null, protein: null, carbs: null, fat: null,
      days: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      recordedDays: 0, withoutNumbers: 0,
    });
  });
});

describe('a target change (ADR 0029)', () => {
  /** Water was 8 glasses until the 3rd, and 10 from then on. */
  const raised = {
    id: 'habit_water', label: 'Water', type: 'counter',
    periods: [
      { from: '2026-01-01', to: '2026-01-03', days: ALL_DAYS, target: 8 },
      { from: '2026-01-03', to: null, days: ALL_DAYS, target: 10 },
    ],
  };
  const logs = [
    log('2026-01-01', { habit_water: 8 }),
    log('2026-01-02', { habit_water: 8 }),
    log('2026-01-03', { habit_water: 8 }),
    log('2026-01-04', { habit_water: 10 }),
  ];

  it('measures a day before it against the old target in completion', () => {
    expect(completionRatio(/** @type {any} */ ([raised]), /** @type {any} */ (logs[1]))).toBe(1);
    expect(completionRatio(/** @type {any} */ ([raised]), /** @type {any} */ (logs[2]))).toBeCloseTo(0.8);
  });

  it('keeps the old shade in the heatmap, and carries each day\'s own target for its correction', () => {
    const [row] = historyRows(/** @type {any} */ ([raised]), /** @type {any} */ (logs));
    expect(row.cells.map((cell) => cell.state)).toEqual(['full', 'full', 'high', 'full']);
    expect(row.cells.map((cell) => cell.target)).toEqual([8, 8, 10, 10]);
  });

  it('rates the habit day by day against the target each day had', () => {
    // (8/8 + 8/8 + 8/10 + 10/10) / 4
    expect(ratesByHabit(/** @type {any} */ ([raised]), /** @type {any} */ (logs)).habit_water).toBeCloseTo(0.95);
  });

  it('counts the days before it as perfect in the summary', () => {
    const summary = windowSummary(/** @type {any} */ ([raised]), /** @type {any} */ (logs));
    expect(summary.perfectDays).toBe(3);
    expect(summary.completion).toBeCloseTo(0.95);
  });

  it('fires the tick on the target of the day written', () => {
    expect(justCompleted(/** @type {any} */ (raised), '2026-01-02', 7, 8)).toBe(true);
    expect(justCompleted(/** @type {any} */ (raised), '2026-01-04', 7, 8)).toBe(false);
  });
});

describe('a schedule (ADR 0029)', () => {
  // The week of Monday 12 October 2026: the gym is Monday, Wednesday and
  // Friday; moving is every day.
  const MON = '2026-10-12', TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15';
  const FRI = '2026-10-16', SAT = '2026-10-17', SUN = '2026-10-18';
  const gym = {
    id: 'habit_gym', label: 'Gym', type: 'check',
    periods: [{ from: '2026-10-01', to: null, days: [1, 3, 5], target: null }],
  };
  const move = { id: 'habit_move', label: 'Move', type: 'check', periods: open('2026-10-01') };

  it('is scheduled when active and the weekday is one of its period\'s days', () => {
    expect([MON, TUE, WED, THU, FRI, SAT, SUN].map((day) => isScheduledOn(/** @type {any} */ (gym), day)))
      .toEqual([true, false, true, false, true, false, false]);
    expect(isScheduledOn(/** @type {any} */ (gym), '2026-09-28')).toBe(false); // a Monday before it existed
  });

  it('measures a day only against the habits scheduled on it; a tick on a day off counts toward nothing', () => {
    const habitsBoth = /** @type {any} */ ([move, gym]);
    expect(completionRatio(habitsBoth, log(MON, { habit_move: true }))).toBe(0.5);
    expect(completionRatio(habitsBoth, log(TUE, { habit_move: true }))).toBe(1);
    expect(completionRatio(habitsBoth, log(TUE, { habit_move: false, habit_gym: true }))).toBe(0);
  });

  it('rates a habit over the days it was scheduled: three out of three is 100%, not 43%', () => {
    const week = [MON, TUE, WED, THU, FRI, SAT, SUN].map((day) =>
      log(day, { habit_move: true, ...([MON, WED, FRI].includes(day) ? { habit_gym: true } : {}) })
    );
    const [, gymRow] = historyRows(/** @type {any} */ ([move, gym]), /** @type {any} */ (week));

    expect(ratesByHabit(/** @type {any} */ ([gym]), /** @type {any} */ (week)).habit_gym).toBe(1);
    expect(gymRow.ratedDays).toBe(3);
  });

  it('counts a perfect day when every habit scheduled that day was complete, and leaves out a day with nothing scheduled', () => {
    const summary = windowSummary(/** @type {any} */ ([gym]), /** @type {any} */ ([
      log(MON, { habit_gym: true }),
      log(TUE, { habit_gym: true }),
      log(WED, { habit_gym: false }),
    ]));

    expect(summary).toEqual({ completion: 0.5, perfectDays: 1, recordedDays: 2, days: 3 });
  });

  it('skips a day with nothing scheduled in the streak: it neither breaks nor extends it', () => {
    const logs = [
      log(MON, { habit_gym: true }),
      log(TUE, {}),
      log(WED, { habit_gym: true }),
      log(THU, {}),
      log(FRI, { habit_gym: true }),
      log(SAT, {}),
    ];
    expect(streak(/** @type {any} */ ([gym]), /** @type {any} */ (logs), SAT)).toBe(3);
  });

  it('does not let a tick on a day off carry the streak, and still breaks on a scheduled day missed', () => {
    const logs = [log(MON, { habit_gym: false }), log(TUE, { habit_gym: true })];
    expect(streak(/** @type {any} */ ([gym]), /** @type {any} */ (logs), TUE)).toBe(0);
  });

  it('draws a day off, and something done on one, apart from inactive and unrecorded days', () => {
    const counterGym = {
      ...gym, id: 'habit_sets', type: 'counter',
      periods: [{ from: TUE, to: null, days: [1, 3, 5], target: 3 }],
    };
    const logs = [
      log(MON, { habit_move: true, habit_gym: true }),
      log(TUE, { habit_gym: true, habit_sets: 2 }),
      log(WED, {}),
      log(THU, { habit_move: true, habit_sets: 0 }),
      log(FRI, { habit_gym: false, habit_sets: 3 }),
      log(SAT, {}),
      log(SUN, { habit_move: true }),
    ];
    const [gymRow, setsRow] = historyRows(/** @type {any} */ ([gym, counterGym]), /** @type {any} */ (logs));

    expect(gymRow.cells.map((cell) => cell.state))
      .toEqual(['full', 'off-done', 'unrecorded', 'off', 'zero', 'unrecorded', 'off']);
    expect(setsRow.cells.map((cell) => cell.state))
      .toEqual(['inactive', 'off-done', 'unrecorded', 'off', 'full', 'unrecorded', 'off']);
  });

  it('keeps a row for a habit active in the window even when every day of it was a day off', () => {
    const rows = historyRows(/** @type {any} */ ([gym]), /** @type {any} */ ([log(TUE, { habit_gym: true }), log(THU, {})]));

    expect(rows).toHaveLength(1);
    expect(rows[0].ratedDays).toBe(0);
    expect(rows[0].cells.map((cell) => cell.state)).toEqual(['off-done', 'unrecorded']);
  });
});

describe('today on the home card', () => {
  const MON = '2026-10-12', TUE = '2026-10-13';
  const gym = {
    id: 'habit_gym', label: 'Gym', type: 'check',
    periods: [{ from: '2026-10-01', to: null, days: [1, 3, 5], target: null }],
  };
  const move = { id: 'habit_move', label: 'Move', type: 'check', periods: open('2026-10-01') };
  const stretch = {
    id: 'habit_stretch', label: 'Stretch', type: 'check',
    periods: [{ from: '2026-10-01', to: null, days: [1], target: null }],
  };
  const gone = {
    id: 'habit_gone', label: 'Gone', type: 'check',
    periods: [{ from: '2026-09-01', to: '2026-10-01', days: [1, 2, 3, 4, 5, 6, 7], target: null }],
  };
  const ids = (/** @type {any[]} */ list) => list.map((habit) => habit.id);

  it('puts the habits scheduled today first, then those with a day off, each in the habit order', () => {
    const { scheduled, off } = habitsForDay(/** @type {any} */ ([gym, move, stretch, gone]), TUE);
    expect(ids(scheduled)).toEqual(['habit_move']);
    expect(ids(off)).toEqual(['habit_gym', 'habit_stretch']);
  });

  it('leaves out a habit that is not active that day', () => {
    const { scheduled, off } = habitsForDay(/** @type {any} */ ([gym, move, stretch, gone]), MON);
    expect(ids(scheduled)).toEqual(['habit_gym', 'habit_move', 'habit_stretch']);
    expect(off).toEqual([]);
  });
});
