/**
 * The check-in's questions (ADR 0037, docs/domain.md "Check-in question"):
 * computed from the day's log and the habits, never by a model. Pure, so
 * tested on made-up habits and logs.
 */

import { describe, expect, it } from 'vitest';

import {
  checkinAnswers,
  checkinFill,
  checkinQuestions,
  checkinSummary,
  checkinWeek,
  isCheckinDone,
  openQuestions,
} from '@/lib/domain/derive/checkin.js';

/** Monday 12 October 2026 and the Tuesday after it. */
const MON = '2026-10-12';
const TUE = '2026-10-13';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const AREAS = ['work', 'study'];

const move = { id: 'habit_move', label: 'Move', type: 'check', periods: [{ from: '2026-01-01', to: null, days: ALL_DAYS, target: null }] };
const water = { id: 'habit_water', label: 'Water', type: 'counter', periods: [{ from: '2026-01-01', to: null, days: ALL_DAYS, target: 8 }] };
// Monday, Wednesday and Friday only: Tuesday is its day off.
const gym = { id: 'habit_gym', label: 'Gym', type: 'check', periods: [{ from: '2026-01-01', to: null, days: [1, 3, 5], target: null }] };
// Archived before the week.
const old = { id: 'habit_old', label: 'Old', type: 'check', periods: [{ from: '2026-01-01', to: '2026-02-01', days: ALL_DAYS, target: null }] };

const HABITS = /** @type {any[]} */ ([move, water, gym, old]);

/**
 * A day's log as the store reads it: nothing given unless said.
 *
 * @param {string} date
 * @param {Record<string, unknown>} [fields]
 * @returns {any}
 */
function log(date, fields = {}) {
  return { date, habits: {}, skips: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, time: null, ...fields };
}

/**
 * @param {Record<string, unknown>} [fields]
 * @param {string} [dayKey]
 */
function questions(fields = {}, dayKey = MON) {
  return checkinQuestions({ habits: HABITS, log: log(dayKey, fields), dayKey, timeAreas: AREAS });
}

const ids = (/** @type {{ id: string }[]} */ list) => list.map((question) => question.id);

describe('checkinQuestions', () => {
  it('asks each habit scheduled that day in habit order, then mood, energy, time and the open question', () => {
    expect(ids(questions())).toEqual([
      'habit:habit_move',
      'habit:habit_water',
      'habit:habit_gym',
      'mood',
      'energy',
      'time',
      'open',
    ]);
  });

  it('gives each question its kind, its subject and a label, unanswered on an empty day', () => {
    const asked = questions();
    expect(asked[0]).toMatchObject({ id: 'habit:habit_move', kind: 'habit', subjectId: 'habit_move', label: 'Move', answered: false });
    expect(asked.map((question) => question.kind)).toEqual(['habit', 'habit', 'habit', 'mood', 'energy', 'time', 'open']);
    expect(asked.every((question) => question.label.length > 0 && question.answered === false)).toBe(true);
    expect(asked.find((question) => question.kind === 'mood')).not.toHaveProperty('subjectId');
  });

  it('says what a habit question takes: a check, or a counter and that day\'s target', () => {
    const [moveQuestion, waterQuestion] = questions();
    expect(moveQuestion).toMatchObject({ habitType: 'check', target: null });
    expect(waterQuestion).toMatchObject({ habitType: 'counter', target: 8 });
  });

  it('does not ask a habit on its day off, nor one not active that day', () => {
    expect(ids(questions({}, TUE))).toEqual(['habit:habit_move', 'habit:habit_water', 'mood', 'energy', 'time', 'open']);
  });

  it('counts a habit answered when complete: a check ticked, a counter at its target', () => {
    const asked = questions({ habits: { habit_move: true, habit_water: 8 } });
    expect(asked.find((question) => question.id === 'habit:habit_move')?.answered).toBe(true);
    expect(asked.find((question) => question.id === 'habit:habit_water')?.answered).toBe(true);
  });

  it('does not count a counter short of its target, nor a check unticked', () => {
    const asked = questions({ habits: { habit_move: false, habit_water: 3 } });
    expect(asked.find((question) => question.id === 'habit:habit_move')?.answered).toBe(false);
    expect(asked.find((question) => question.id === 'habit:habit_water')?.answered).toBe(false);
  });

  it('counts a habit answered when it carries a skip reason', () => {
    const asked = questions({ skips: { habit_gym: 'forgotten' }, habits: { habit_water: 2 } });
    expect(asked.find((question) => question.id === 'habit:habit_gym')?.answered).toBe(true);
  });

  it('counts mood and energy answered when given, and time once the day is declared', () => {
    const asked = questions({ mood: 3, energy: 1, time: {} });
    expect(asked.filter((question) => ['mood', 'energy', 'time'].includes(question.kind)).every((q) => q.answered)).toBe(true);
    expect(questions({ time: { work: 60 } }).find((question) => question.kind === 'time')?.answered).toBe(true);
  });

  it('never counts the open question answered: it can be answered more than once', () => {
    const asked = questions({ habits: { habit_move: true, habit_water: 8, habit_gym: true }, mood: 4, energy: 4, time: {} });
    expect(asked.at(-1)).toMatchObject({ id: 'open', kind: 'open', label: 'Anything worth noting today?', answered: false });
  });

  it('does not ask for time when there is no area to declare it against', () => {
    const asked = checkinQuestions({ habits: [], log: log(MON), dayKey: MON, timeAreas: [] });
    expect(ids(asked)).toEqual(['mood', 'energy', 'open']);
  });

  it('reads a log written before skip reasons existed', () => {
    const legacy = log(MON);
    delete legacy.skips;
    const asked = checkinQuestions({ habits: HABITS, log: legacy, dayKey: MON, timeAreas: AREAS });
    expect(asked.find((question) => question.id === 'habit:habit_gym')?.answered).toBe(false);
  });
});

describe('openQuestions', () => {
  it('keeps the unanswered questions and the open one, in order', () => {
    const asked = questions({ habits: { habit_move: true }, mood: 2 });
    expect(ids(openQuestions(asked))).toEqual(['habit:habit_water', 'habit:habit_gym', 'energy', 'time', 'open']);
  });

  it('is only the open question once everything else is answered', () => {
    const asked = questions({ habits: { habit_move: true, habit_water: 9 }, skips: { habit_gym: 'paused' }, mood: 5, energy: 3, time: { study: 30 } });
    expect(ids(openQuestions(asked))).toEqual(['open']);
  });
});

describe('isCheckinDone', () => {
  it('is false while any question but the open one is unanswered', () => {
    expect(isCheckinDone(questions({ habits: { habit_move: true, habit_water: 8, habit_gym: true }, mood: 4, energy: 4 }))).toBe(false);
  });

  it('is true when every question but the open one is answered', () => {
    expect(isCheckinDone(questions({ habits: { habit_move: true, habit_water: 8 }, skips: { habit_gym: 'too-heavy' }, mood: 4, energy: 4, time: {} }))).toBe(true);
  });

  it('is true on a day that asks only the open question', () => {
    expect(isCheckinDone([{ id: 'open', kind: 'open', label: 'Anything worth noting today?', answered: false }])).toBe(true);
  });
});

describe('checkinFill', () => {
  it('is empty with nothing answered, partly with some, filled when done -- the open question never counts', () => {
    expect(checkinFill(questions())).toEqual({ fill: 'empty', answered: 0, total: 6 });
    expect(checkinFill(questions({ mood: 3 }))).toEqual({ fill: 'partly', answered: 1, total: 6 });
    const done = questions({ habits: { habit_move: true, habit_water: 8, habit_gym: true }, mood: 4, energy: 4, time: {} });
    expect(checkinFill(done)).toEqual({ fill: 'filled', answered: 6, total: 6 });
  });

  it('counts a habit given a skip reason, paused included, as answered', () => {
    const skipped = questions({ habits: { habit_move: true, habit_water: 8 }, skips: { habit_gym: 'paused' }, mood: 2, energy: 2, time: {} });
    expect(checkinFill(skipped).fill).toBe('filled');
    expect(checkinFill(questions({ skips: { habit_gym: 'forgotten' } })).fill).toBe('partly');
  });

  it('fills a day with no habit scheduled on mood, energy and time alone', () => {
    const noHabits = checkinQuestions({ habits: [], log: log(MON, { mood: 3, energy: 3, time: { work: 60 } }), dayKey: MON, timeAreas: AREAS });
    expect(checkinFill(noHabits)).toEqual({ fill: 'filled', answered: 3, total: 3 });
  });
});

describe('checkinWeek', () => {
  /** Monday 12 to Sunday 18 October 2026. */
  const DAYS = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];

  it('reads each day in order from the questions it would ask, a day with no log as empty', () => {
    const logs = [
      log('2026-10-12', { habits: { habit_move: true, habit_water: 8, habit_gym: true }, mood: 4, energy: 3, time: { work: 480 } }),
      log('2026-10-13', { mood: 2 }),
      // A log outside the days asked about is left out.
      log('2026-10-11', { mood: 5 }),
    ];
    const week = checkinWeek({ habits: HABITS, logs, days: DAYS, timeAreas: AREAS });
    expect(week.map((day) => day.day)).toEqual(DAYS);
    expect(week.map((day) => day.fill)).toEqual(['filled', 'partly', 'empty', 'empty', 'empty', 'empty', 'empty']);
    // Tuesday is the gym's day off: one question fewer.
    expect(week[1]).toEqual({ day: '2026-10-13', fill: 'partly', answered: 1, total: 5 });
    expect(week[2]).toMatchObject({ answered: 0, total: 6 });
  });

  it('counts a paused habit as answered, so a day it is paused on can be filled', () => {
    const logs = [log('2026-10-14', { habits: { habit_move: true, habit_water: 8 }, skips: { habit_gym: 'paused' }, mood: 3, energy: 3, time: {} })];
    expect(checkinWeek({ habits: HABITS, logs, days: ['2026-10-14'], timeAreas: AREAS })[0].fill).toBe('filled');
  });

  it('asks only mood, energy and time of a day with no habit scheduled', () => {
    const week = checkinWeek({ habits: [], logs: [log(MON, { mood: 3 })], days: [MON], timeAreas: AREAS });
    expect(week[0]).toEqual({ day: MON, fill: 'partly', answered: 1, total: 3 });
  });
});

describe('checkinSummary', () => {
  it('reads the readings, each habit kept, skipped, paused or open, and the time by area', () => {
    const fields = { habits: { habit_move: true, habit_water: 5 }, skips: { habit_gym: 'too-heavy' }, mood: 4, energy: 2, time: { study: 60, work: 360 } };
    const summary = checkinSummary({ questions: questions(fields), answers: checkinAnswers(log(MON, fields)), timeAreas: AREAS });
    expect(summary.mood).toBe(4);
    expect(summary.energy).toBe(2);
    expect(summary.habits.map((habit) => [habit.id, habit.state, habit.value, habit.skip])).toEqual([
      ['habit_move', 'kept', true, null],
      ['habit_water', 'open', 5, null],
      ['habit_gym', 'skipped', null, 'too-heavy'],
    ]);
    expect(summary.habits[1]).toMatchObject({ habitType: 'counter', target: 8 });
    expect([summary.kept, summary.counted]).toEqual([1, 3]);
    // Areas in the order they are asked, not the order they were saved.
    expect(summary.time).toEqual({ total: 420, areas: [{ area: 'work', minutes: 360 }, { area: 'study', minutes: 60 }] });
  });

  it('leaves a paused habit out of the count, as a rate does', () => {
    const fields = { habits: { habit_move: true, habit_water: 8 }, skips: { habit_gym: 'paused' } };
    const summary = checkinSummary({ questions: questions(fields), answers: checkinAnswers(log(MON, fields)), timeAreas: AREAS });
    expect(summary.habits.map((habit) => habit.state)).toEqual(['kept', 'kept', 'paused']);
    expect([summary.kept, summary.counted]).toEqual([2, 2]);
  });

  it('says time not declared as null, and declared nothing as a zero', () => {
    const none = checkinSummary({ questions: questions(), answers: checkinAnswers(log(MON)), timeAreas: AREAS });
    expect(none.time).toBeNull();
    const nothing = checkinSummary({ questions: questions({ time: {} }), answers: checkinAnswers(log(MON, { time: {} })), timeAreas: AREAS });
    expect(nothing.time).toEqual({ total: 0, areas: [] });
  });
});
