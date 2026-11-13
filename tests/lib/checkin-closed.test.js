/**
 * A closed answer to a check-in question, turned into registry requests by
 * rules (ADR 0037's first tier): no model, and no value checked here beyond
 * its shape -- the actions' own `parse` checks the values.
 */

import { describe, expect, it } from 'vitest';

import { actionsForAnswer } from '@/lib/checkin/closed.js';

/** @type {import('@/lib/domain/derive/checkin.js').Question} */
const CHECK = { id: 'habit:habit_move', kind: 'habit', subjectId: 'habit_move', label: 'Move', answered: false, habitType: 'check', target: null };
/** @type {import('@/lib/domain/derive/checkin.js').Question} */
const COUNTER = { id: 'habit:habit_water', kind: 'habit', subjectId: 'habit_water', label: 'Water', answered: false, habitType: 'counter', target: 8 };
/** @type {import('@/lib/domain/derive/checkin.js').Question} */
const MOOD = { id: 'mood', kind: 'mood', label: 'How did today feel?', answered: false };
/** @type {import('@/lib/domain/derive/checkin.js').Question} */
const ENERGY = { id: 'energy', kind: 'energy', label: 'How much energy did today have?', answered: false };
/** @type {import('@/lib/domain/derive/checkin.js').Question} */
const TIME = { id: 'time', kind: 'time', label: "Where did today's time go?", answered: false };
/** @type {import('@/lib/domain/derive/checkin.js').Question} */
const OPEN = { id: 'open', kind: 'open', label: 'Anything worth noting today?', answered: false };

/**
 * @param {ReturnType<typeof actionsForAnswer>} result
 * @returns {string}
 */
function errorOf(result) {
  if (result.ok) throw new Error('expected a refusal, got ' + JSON.stringify(result.requests));
  return result.error;
}

describe('a habit question', () => {
  it('ticks a check habit done', () => {
    expect(actionsForAnswer(CHECK, { done: true })).toEqual({
      ok: true,
      requests: [{ name: 'habit.set', params: { habitId: 'habit_move', value: true } }],
    });
  });

  it("fills a counter to that day's target when done", () => {
    expect(actionsForAnswer(COUNTER, { done: true })).toEqual({
      ok: true,
      requests: [{ name: 'habit.set', params: { habitId: 'habit_water', value: 8 } }],
    });
  });

  it('sets a counter to an explicit count', () => {
    expect(actionsForAnswer(COUNTER, { value: 5 })).toEqual({
      ok: true,
      requests: [{ name: 'habit.set', params: { habitId: 'habit_water', value: 5 } }],
    });
  });

  it('passes a count on for the action to check', () => {
    // -1 is the action's to refuse, not this function's.
    expect(actionsForAnswer(COUNTER, { value: -1 })).toMatchObject({ ok: true });
  });

  it('files a skip reason, whatever the reason -- the action checks it', () => {
    expect(actionsForAnswer(CHECK, { skip: 'forgotten' })).toEqual({
      ok: true,
      requests: [{ name: 'habit.skip', params: { habitId: 'habit_move', reason: 'forgotten' } }],
    });
    expect(actionsForAnswer(CHECK, { skip: 'bored' })).toMatchObject({ ok: true });
  });

  it('refuses a count for a check habit', () => {
    expect(errorOf(actionsForAnswer(CHECK, { value: 1 }))).toMatch(/count/);
  });

  it('refuses done that is not true', () => {
    expect(errorOf(actionsForAnswer(CHECK, { done: false }))).toMatch(/done/);
  });

  it('refuses a value naming two answers, or none', () => {
    expect(errorOf(actionsForAnswer(CHECK, { done: true, skip: 'forgotten' }))).toBeTruthy();
    expect(errorOf(actionsForAnswer(CHECK, {}))).toBeTruthy();
  });

  it('refuses done for a counter with no target that day', () => {
    expect(errorOf(actionsForAnswer({ ...COUNTER, target: null }, { done: true }))).toMatch(/target/);
  });
});

describe('mood and energy', () => {
  it('set the reading', () => {
    expect(actionsForAnswer(MOOD, { value: 4 })).toEqual({ ok: true, requests: [{ name: 'mood.set', params: { value: 4 } }] });
    expect(actionsForAnswer(ENERGY, { value: 2 })).toEqual({ ok: true, requests: [{ name: 'energy.set', params: { value: 2 } }] });
  });

  it('pass the value on for the action to check', () => {
    expect(actionsForAnswer(MOOD, { value: 9 })).toMatchObject({ ok: true });
  });

  it('refuse another shape', () => {
    expect(errorOf(actionsForAnswer(MOOD, { done: true }))).toBeTruthy();
    expect(errorOf(actionsForAnswer(ENERGY, 3))).toBeTruthy();
  });
});

describe('the time question', () => {
  it('declares each area named, one request each, in the order given', () => {
    expect(actionsForAnswer(TIME, { areas: { work: 120, study: 30 } })).toEqual({
      ok: true,
      requests: [
        { name: 'time.set', params: { area: 'work', minutes: 120 } },
        { name: 'time.set', params: { area: 'study', minutes: 30 } },
      ],
    });
  });

  it('declares nothing', () => {
    expect(actionsForAnswer(TIME, { none: true })).toEqual({ ok: true, requests: [{ name: 'time.none', params: {} }] });
  });

  it('refuses no area at all, and areas that are not an object', () => {
    expect(errorOf(actionsForAnswer(TIME, { areas: {} }))).toMatch(/none/);
    expect(errorOf(actionsForAnswer(TIME, { areas: [60] }))).toBeTruthy();
    expect(errorOf(actionsForAnswer(TIME, { none: false }))).toBeTruthy();
  });
});

describe('the open question', () => {
  it('is a journal entry, word for word, and nothing else', () => {
    const text = '  Long walk after work; called the plumber about the sink.  ';
    expect(actionsForAnswer(OPEN, { text })).toEqual({ ok: true, requests: [{ name: 'journal.add', params: { text } }] });
  });

  it('refuses another shape', () => {
    expect(errorOf(actionsForAnswer(OPEN, 'just text'))).toBeTruthy();
    expect(errorOf(actionsForAnswer(OPEN, { text: 'a', mood: 3 }))).toBeTruthy();
  });
});

describe('any question', () => {
  it('refuses a value that is not an object', () => {
    for (const value of [null, undefined, 'yes', 4, [true]]) {
      expect(errorOf(actionsForAnswer(CHECK, value))).toBeTruthy();
    }
  });

  it('refuses a question of a kind it does not know', () => {
    expect(errorOf(actionsForAnswer(/** @type {any} */ ({ id: 'x', kind: 'appointment', label: 'x', answered: false }), { done: true }))).toBeTruthy();
  });
});
