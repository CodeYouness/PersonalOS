/**
 * `npm run eval:classify -- --suite checkin`: how one open answer's reading
 * is scored against the actions it should file, and that the cases are
 * written against the fixtures they are scored with. Pure -- no model, no
 * store.
 */

import { describe, expect, it } from 'vitest';

import { listActions } from '@/lib/actions/registry.js';
import { CASES, CONTEXT } from '@/scripts/eval-checkin/cases.js';
import { scoreCase, summarise } from '@/scripts/eval-checkin/score.js';

const GYM = { action: 'habit.set', params: { habitId: 'habit_gym', value: true } };
const LUNCH = { action: 'expense.record', params: { amount: 1800, categoryId: 'cat_restaurants' } };

/** @param {string} name @param {Record<string, unknown>} [params] */
const got = (name, params = {}) => ({ name, params });

describe('scoreCase', () => {
  it('passes every expected action found once, in any order, scoring only the params named', () => {
    expect(
      scoreCase({ text: '', expected: [GYM, LUNCH] }, [
        got('expense.record', { amount: 1800, categoryId: 'cat_restaurants', note: 'pranzo' }),
        got('habit.set', { habitId: 'habit_gym', value: true }),
      ])
    ).toEqual({ passed: true, missed: [], extra: [] });
  });

  it('fails a missed action, a wrong param and an action read that was not said', () => {
    const score = scoreCase({ text: '', expected: [GYM, LUNCH] }, [
      got('expense.record', { amount: 1850, categoryId: 'cat_restaurants' }),
      got('habit.set', { habitId: 'habit_gym', value: true }),
      got('task.create', { title: 'x' }),
    ]);
    expect(score.passed).toBe(false);
    expect(score.missed).toEqual([LUNCH]);
    expect(score.extra.map((request) => request.name)).toEqual(['expense.record', 'task.create']);
  });

  it('counts a repeated action once per time it is expected', () => {
    expect(scoreCase({ text: '', expected: [GYM] }, [got('habit.set', GYM.params), got('habit.set', GYM.params)]).passed).toBe(false);
  });

  it('lets an optional action be read or not', () => {
    const testCase = { text: '', expected: [], optional: [{ action: 'time.none' }] };
    expect(scoreCase(testCase, []).passed).toBe(true);
    expect(scoreCase(testCase, [got('time.none')]).passed).toBe(true);
    expect(scoreCase(testCase, [got('time.set', { area: 'work', minutes: 30 })]).passed).toBe(false);
  });

  it('passes "nothing to file" on an empty list only, and fails everything when the model failed', () => {
    expect(scoreCase({ text: '', expected: [] }, []).passed).toBe(true);
    expect(scoreCase({ text: '', expected: [GYM] }, null)).toEqual({ passed: false, missed: [GYM], extra: [] });
  });

  it('matches an account by name, whatever its case', () => {
    const testCase = { text: '', expected: [{ action: 'expense.record', params: { amount: 1250, account: 'Cash' } }] };
    expect(scoreCase(testCase, [got('expense.record', { amount: 1250, account: 'cash' })]).passed).toBe(true);
  });
});

describe('summarise', () => {
  it('counts the answered calls, the passes and the tokens per model', () => {
    const [run] = summarise([
      { model: 'm', case: { text: 'a', expected: [] }, requests: [], usage: { inputTokens: 10, outputTokens: 2 }, error: null },
      { model: 'm', case: { text: 'b', expected: [GYM] }, requests: null, usage: null, error: 'down' },
    ]);
    expect(run).toMatchObject({ model: 'm', cases: 2, answered: 1, passed: 1, usage: { inputTokens: 10, outputTokens: 2 }, metered: 1 });
    expect(run.failing.map((miss) => [miss.text, miss.error])).toEqual([['b', 'down']]);
  });
});

describe('the cases', () => {
  const offered = new Set(listActions({ modelCallable: true }).map((definition) => definition.name));
  const habits = new Set(CONTEXT.habits.map((habit) => habit.id));
  const categories = new Set(CONTEXT.categories.map((category) => category.id));
  const all = CASES.flatMap((testCase) => [...testCase.expected, ...(testCase.optional ?? [])]);

  it('number between twenty and thirty, and include answers with nothing to file', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20);
    expect(CASES.length).toBeLessThanOrEqual(30);
    expect(CASES.some((testCase) => testCase.expected.length === 0)).toBe(true);
  });

  it('expect only actions a model may file, never the journal entry, on fixture habits and categories', () => {
    for (const want of all) {
      expect(offered.has(want.action)).toBe(true);
      expect(want.action).not.toBe('journal.add');
      const params = /** @type {Record<string, unknown>} */ (want.params ?? {});
      if (params.habitId !== undefined) expect(habits.has(/** @type {string} */ (params.habitId))).toBe(true);
      if (params.categoryId !== undefined) expect(categories.has(/** @type {string} */ (params.categoryId))).toBe(true);
      if (params.amount !== undefined) expect(Number.isSafeInteger(params.amount)).toBe(true);
    }
  });
});
