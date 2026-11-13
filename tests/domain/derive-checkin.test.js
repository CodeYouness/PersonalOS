/**
 * The check-in's questions (ADR 0037, docs/domain.md "Check-in question"):
 * computed from the day's log and the habits, never by a model. Pure, so
 * tested on made-up habits and logs.
 */

import { describe, expect, it } from 'vitest';

import { checkinQuestions, isCheckinDone, openQuestions } from '@/lib/domain/derive/checkin.js';

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
