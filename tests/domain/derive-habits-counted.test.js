/**
 * A habit counted from a time area (ADR 0039): its day is derived from the
 * day's declared time by `habitValueOn`, and every reader -- rates, streaks,
 * the heat map, the week's figures, the check-in -- reads it through that one
 * function.
 */

import { describe, expect, it } from 'vitest';

import {
  checkinFill,
  checkinQuestions,
  checkinSummary,
  checkinWeek,
  countedHabits,
  isCheckinDone,
  openQuestions,
} from '@/lib/domain/derive/checkin.js';
import {
  completionRatio,
  habitRate,
  habitValueOn,
  habitValuesOn,
  historyRows,
  isRecorded,
  openHabits,
  ratesByHabit,
  streak,
  windowSummary,
} from '@/lib/domain/derive/habits.js';
import { weekFigures } from '@/lib/domain/derive/week.js';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const AREAS = ['work', 'projects', 'training', 'refereeing'];

/** @type {import('@/lib/domain/types.js').Habit} */
const GYM = { id: 'habit_gym', label: 'Gym', type: 'check', countedFrom: 'training', periods: [{ from: '2026-01-01', to: null, days: ALL_DAYS, target: null }] };
/** @type {import('@/lib/domain/types.js').Habit} */
const READ = { id: 'habit_read', label: 'Read', type: 'check', periods: [{ from: '2026-01-01', to: null, days: ALL_DAYS, target: null }] };

/**
 * @param {string} date
 * @param {Partial<import('@/lib/domain/types.js').DailyLog>} [fields]
 * @returns {import('@/lib/domain/types.js').DailyLog}
 */
const log = (date, fields = {}) => ({
  date, habits: {}, skips: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, time: null, ...fields,
});

describe('habitValueOn', () => {
  it('is kept on a day whose time for the area is above zero', () => {
    expect(habitValueOn(GYM, log('2026-01-05', { time: { training: 60 } }))).toBe(true);
  });

  it('is not kept on a day whose time is declared with none for the area, "nothing" included', () => {
    expect(habitValueOn(GYM, log('2026-01-05', { time: { work: 240 } }))).toBe(false);
    expect(habitValueOn(GYM, log('2026-01-05', { time: {} }))).toBe(false);
  });

  it('is not recorded on a day whose time is not declared', () => {
    expect(habitValueOn(GYM, log('2026-01-05'))).toBeUndefined();
    // A log read before the field existed.
    const { time: _none, ...old } = log('2026-01-05');
    expect(habitValueOn(GYM, old)).toBeUndefined();
  });

  it('keeps a tick the day held from before the habit was counted from time', () => {
    expect(habitValueOn(GYM, log('2026-01-05', { habits: { habit_gym: true } }))).toBe(true);
    expect(habitValueOn(GYM, log('2026-01-05', { habits: { habit_gym: true }, time: { work: 60 } }))).toBe(true);
  });

  it('reads a habit ticked by hand as the day stores it, whatever the time', () => {
    expect(habitValueOn(READ, log('2026-01-05', { time: { training: 60 } }))).toBeUndefined();
    expect(habitValueOn(READ, log('2026-01-05', { habits: { habit_read: false } }))).toBe(false);
  });

  it('gives every habit its value at once, for a screen to start from', () => {
    expect(habitValuesOn([GYM, READ], log('2026-01-05', { habits: { habit_read: true }, time: { training: 30 } }))).toEqual({
      habit_read: true,
      habit_gym: true,
    });
    expect(habitValuesOn([GYM, READ], log('2026-01-05'))).toEqual({});
  });
});

describe('the readers, on a habit counted from time', () => {
  const days = [
    log('2026-01-05', { time: { training: 60 } }), // kept
    log('2026-01-06', { time: { work: 480 } }), // missed, no reason
    log('2026-01-07'), // not recorded
    log('2026-01-08', { time: {}, skips: { habit_gym: 'too-heavy' } }), // missed, with a reason
    log('2026-01-09', { skips: { habit_gym: 'paused' } }), // paused
  ];

  it('rates it kept of scheduled, a paused day left out and the undeclared day unrecorded', () => {
    expect(habitRate(GYM, days, { from: '2026-01-05', to: '2026-01-09' })).toEqual({
      kept: 1,
      scheduled: 4,
      rate: 0.25,
      paused: 1,
      missed: { forgotten: 0, 'too-heavy': 1, 'on-purpose': 0, unrecorded: 2 },
    });
  });

  it('counts a day whose time is declared as recorded, for a habit counted from it', () => {
    expect(isRecorded(days[0])).toBe(false);
    expect(isRecorded(days[0], [GYM])).toBe(true);
    expect(isRecorded(days[1], [GYM])).toBe(true);
    expect(isRecorded(days[2], [GYM])).toBe(false);
  });

  it('draws the heat map from the time: full, zero, unrecorded, zero with a reason, paused', () => {
    const [row] = historyRows([GYM], days);
    expect(row.cells.map((cell) => cell.state)).toEqual(['full', 'zero', 'unrecorded', 'zero', 'paused']);
    expect(row.cells.map((cell) => cell.value)).toEqual([true, false, false, false, false]);
    expect(row.rate).toBeCloseTo(1 / 3);
    expect(ratesByHabit([GYM], days).habit_gym).toBeCloseTo(1 / 3);
  });

  it('counts its kept day in the completion, the summary and the streak', () => {
    expect(completionRatio([GYM, READ], days[0])).toBe(0.5);
    expect(windowSummary([GYM, READ], days.slice(0, 2))).toEqual({ completion: 0.25, perfectDays: 0, recordedDays: 2, days: 2 });
    expect(streak([GYM], [log('2026-01-04', { time: { training: 30 } }), days[0]], '2026-01-05')).toBe(2);
  });

  it('is never open to tick: kept by time, or still to come from it', () => {
    expect(openHabits([GYM], days[0])).toEqual([]);
  });

  it('reads the week from the time: complete, missed and unrecorded days', () => {
    const figures = weekFigures({
      profile: /** @type {any} */ ({ habits: [GYM] }),
      dailyLogs: days,
      tasks: [],
      goals: [],
      journalEntries: [],
      transactions: [],
      captures: [],
      from: '2026-01-05',
      today: '2026-01-11',
      timezone: 'Europe/Rome',
    });
    const [gym] = figures.habits;
    expect(gym.complete).toBe(1);
    expect(gym.scheduled).toBe(6);
    expect(gym.paused).toBe(1);
    expect(gym.notComplete.map((miss) => [miss.date, miss.state, miss.reason])).toEqual([
      ['2026-01-06', 'missed', null],
      ['2026-01-07', 'unrecorded', null],
      ['2026-01-08', 'missed', 'too-heavy'],
      ['2026-01-10', 'unrecorded', null],
      ['2026-01-11', 'unrecorded', null],
    ]);
  });
});

describe('the check-in, with a habit counted from time', () => {
  const DAY = '2026-01-05';
  const questionsOn = (/** @type {import('@/lib/domain/types.js').DailyLog} */ day) =>
    checkinQuestions({ habits: [GYM, READ], log: day, dayKey: DAY, timeAreas: AREAS });

  it('never asks it: the time question answers it', () => {
    expect(questionsOn(log(DAY)).map((question) => question.id)).toEqual(['habit:habit_read', 'mood', 'energy', 'time', 'open']);
    expect(countedHabits({ habits: [GYM, READ], dayKey: DAY })).toEqual([{ id: 'habit_gym', label: 'Gym', area: 'training' }]);
  });

  it('adds nothing to what is left, and a day whose time is declared with none for it is still filled', () => {
    expect(checkinFill(questionsOn(log(DAY)))).toEqual({ fill: 'empty', answered: 0, total: 4 });
    const filled = log(DAY, { habits: { habit_read: true }, mood: 3, energy: 3, time: { work: 60 } });
    expect(isCheckinDone(questionsOn(filled))).toBe(true);
    expect(openQuestions(questionsOn(filled)).map((question) => question.id)).toEqual(['open']);
    expect(checkinWeek({ habits: [GYM, READ], logs: [filled], days: [DAY], timeAreas: AREAS })[0].fill).toBe('filled');
  });

  /**
   * @param {Partial<import('@/lib/domain/derive/checkin.js').CheckinAnswers>} answers
   */
  const summarise = (answers) => {
    const full = { mood: null, energy: null, time: null, habits: {}, skips: {}, ...answers };
    return checkinSummary({ questions: questionsOn(log(DAY, full)), answers: full, timeAreas: AREAS, counted: countedHabits({ habits: [GYM, READ], dayKey: DAY }) });
  };

  it('lists it with the others, kept by the time, with its area and minutes', () => {
    const summary = summarise({ time: { training: 60 }, habits: { habit_read: true } });
    expect(summary.habits.map((habit) => [habit.id, habit.state, habit.countedFrom, habit.minutes])).toEqual([
      ['habit_read', 'kept', null, null],
      ['habit_gym', 'kept', 'training', 60],
    ]);
    expect([summary.kept, summary.counted]).toEqual([2, 2]);
  });

  it('reads it missed, open, skipped or paused as the time and the reasons say', () => {
    const state = (/** @type {any} */ answers) => summarise(answers).habits.find((habit) => habit.id === 'habit_gym')?.state;
    expect(state({ time: { work: 60 } })).toBe('missed');
    expect(state({ time: null })).toBe('open');
    expect(state({ time: {}, skips: { habit_gym: 'too-heavy' } })).toBe('skipped');
    expect(state({ time: null, skips: { habit_gym: 'paused' } })).toBe('paused');
    expect(summarise({ time: null, skips: { habit_gym: 'paused' } }).counted).toBe(1);
  });
});
