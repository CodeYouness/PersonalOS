/**
 * `npm run eval:classify` (#197): how one classification is scored against
 * what a sentence should file as, and how a run is summed up and priced.
 * Pure -- no model, no store -- so every expected value here is written by
 * hand.
 */

import { describe, expect, it } from 'vitest';

import { formatMicros, scoreCase, summarise } from '@/scripts/eval-classify/score.js';

/**
 * A classification as the model path returns it.
 *
 * @param {string} destination
 * @param {Record<string, unknown>} [fields]
 * @returns {import('@/lib/classify.js').Classification}
 */
const filed = (destination, fields = {}) => /** @type {any} */ ({ destination, route: 'model', fields });

describe('scoreCase', () => {
  it('passes every field the case names when the classification matches', () => {
    expect(
      scoreCase(
        { destination: 'finance', amount: 1840, direction: 'out', categoryId: 'cat_food', date: '2026-09-23' },
        filed('finance', { title: 'Supermarket', amount: 1840, direction: 'out', categoryId: 'cat_food', date: '2026-09-23', account: null })
      )
    ).toEqual({ destination: true, amount: true, direction: true, categoryId: true, date: true });
  });

  it.each([
    ['destination', { destination: 'task' }, filed('memory')],
    ['date', { destination: 'appointment', date: '2026-09-24' }, filed('appointment', { date: '2026-09-25' })],
    ['startTime', { destination: 'appointment', startTime: '15:00' }, filed('appointment', { startTime: '16:00' })],
    ['time', { destination: 'nutrition', time: '13:00' }, filed('nutrition', { time: null })],
    ['amount', { destination: 'finance', amount: 1840 }, filed('finance', { amount: 1804 })],
    ['direction', { destination: 'finance', direction: 'in' }, filed('finance', { direction: 'out' })],
    ['categoryId', { destination: 'finance', categoryId: 'cat_food' }, filed('finance', { categoryId: null })],
    ['weight', { destination: 'health', weight: 74.2 }, filed('health', { weight: 74.7 })],
  ])('fails %s on a different value -- it must match exactly', (field, expected, classification) => {
    expect(scoreCase(expected, classification)[field]).toBe(false);
  });

  it('accepts any destination a case lists: task and people file the same record (docs/domain.md, Task)', () => {
    expect(scoreCase({ destination: ['task', 'people'] }, filed('people'))).toEqual({ destination: true });
    expect(scoreCase({ destination: ['task', 'people'] }, filed('task'))).toEqual({ destination: true });
    expect(scoreCase({ destination: ['task', 'people'] }, filed('memory'))).toEqual({ destination: false });
  });

  it('reads a field the classifier left out as null, so "no amount" can be expected', () => {
    expect(scoreCase({ destination: 'finance', amount: null, date: null }, filed('finance', { amount: null }))).toEqual({
      destination: true,
      amount: true,
      date: true,
    });
  });

  it('reads the day the sentence was said and no date as the same day, on either side', () => {
    // A meal the model places on today files on today, exactly as one it places nowhere.
    expect(scoreCase({ destination: 'nutrition', date: null }, filed('nutrition', { date: '2026-09-22' }), '2026-09-22').date).toBe(true);
    // An appointment expected today passes when the model names today.
    expect(scoreCase({ destination: 'appointment', date: '2026-09-22' }, filed('appointment', { date: '2026-09-22' }), '2026-09-22').date).toBe(
      true
    );
    expect(scoreCase({ destination: 'nutrition', date: null }, filed('nutrition', { date: '2026-09-21' }), '2026-09-22').date).toBe(false);
  });

  it('matches the account as said, ignoring case and spaces around it', () => {
    expect(scoreCase({ destination: 'finance', account: 'Revolut' }, filed('finance', { account: ' revolut ' })).account).toBe(true);
    expect(scoreCase({ destination: 'finance', account: 'Revolut' }, filed('finance', { account: null })).account).toBe(false);
  });

  it('passes calories and macros within 25% of the estimate, and fails them just beyond', () => {
    const expected = { destination: 'nutrition', calories: 800, protein: 40, carbs: 100, fat: 20 };

    expect(scoreCase(expected, filed('nutrition', { calories: 1000, protein: 30, carbs: 125, fat: 15 }))).toEqual({
      destination: true,
      calories: true,
      protein: true,
      carbs: true,
      fat: true,
    });
    expect(scoreCase(expected, filed('nutrition', { calories: 1001, protein: 29, carbs: 126, fat: null }))).toEqual({
      destination: true,
      calories: false,
      protein: false,
      carbs: false,
      fat: false,
    });
  });

  it('fails every field the case names when the model gave nothing back', () => {
    expect(scoreCase({ destination: 'health', weight: 74.2 }, null)).toEqual({ destination: false, weight: false });
  });

  it('never scores a field the case does not name, such as the title', () => {
    expect(scoreCase({ destination: 'task' }, filed('task', { title: 'Anything at all' }))).toEqual({ destination: true });
  });
});

describe('summarise', () => {
  const prices = { 'claude-test-cheap': { inputPerMTok: 100_000, outputPerMTok: 500_000 } };

  /** @type {Parameters<typeof summarise>[0]} */
  const results = [
    {
      model: 'claude-test-cheap',
      case: { text: 'pranzo: carbonara', saidOn: '2026-09-24', expected: { destination: 'nutrition', calories: 800 } },
      classification: filed('nutrition', { calories: 760 }),
      usage: { inputTokens: 2000, outputTokens: 100 },
      error: null,
    },
    {
      model: 'claude-test-cheap',
      case: { text: 'spesi 18,40', saidOn: '2026-09-24', expected: { destination: 'finance', amount: 1840 } },
      classification: filed('finance', { amount: 184 }),
      usage: { inputTokens: 2001, outputTokens: 99 },
      error: null,
    },
    {
      model: 'claude-test-cheap',
      case: { text: 'chiamare Marta', saidOn: '2026-09-24', expected: { destination: 'task' } },
      classification: null,
      usage: null,
      error: 'overloaded',
    },
    {
      model: 'claude-test-unpriced',
      case: { text: 'chiamare Marta', saidOn: '2026-09-24', expected: { destination: 'task' } },
      classification: filed('task'),
      usage: { inputTokens: 1500, outputTokens: 50 },
      error: null,
    },
  ];

  it('gives each model its pass rate per field, its failing cases and its tokens', () => {
    const [cheap] = summarise(results, prices);

    expect(cheap).toMatchObject({
      model: 'claude-test-cheap',
      cases: 3,
      answered: 2,
      passed: 1,
      fields: {
        destination: { passed: 2, total: 3 },
        calories: { passed: 1, total: 1 },
        amount: { passed: 0, total: 1 },
      },
      usage: { inputTokens: 4001, outputTokens: 199 },
    });
    expect(cheap.failing).toEqual([
      { text: 'spesi 18,40', missed: ['amount'], expected: { destination: 'finance', amount: 1840 }, got: filed('finance', { amount: 184 }), error: null },
      { text: 'chiamare Marta', missed: ['destination'], expected: { destination: 'task' }, got: null, error: 'overloaded' },
    ]);
  });

  it('prices the run in whole micro-dollars, and a capture as the run over the calls that answered', () => {
    // 4001 × $0.10 + 199 × $0.50 per million tokens = 400.1 + 99.5 = 499.6 µ$,
    // over the two calls that reported usage: the failed one cost nothing known.
    expect(summarise(results, prices)[0].cost).toEqual({ runMicros: 500, perCaptureMicros: 250 });
  });

  it('still scores a model with no price, and says so instead of a cost', () => {
    const unpriced = summarise(results, prices)[1];

    expect(unpriced).toMatchObject({ model: 'claude-test-unpriced', cases: 1, passed: 1, cost: null });
  });
});

describe('formatMicros', () => {
  it('writes micro-dollars as dollars, from the integer and never through a float', () => {
    expect(formatMicros(500)).toBe('$0.000500');
    expect(formatMicros(1_234_567)).toBe('$1.234567');
    expect(formatMicros(0)).toBe('$0.000000');
  });
});
