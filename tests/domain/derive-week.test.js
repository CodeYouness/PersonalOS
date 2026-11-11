import { describe, expect, it } from 'vitest';

import { weekFigures } from '@/lib/domain/derive/week.js';

const ZONE = 'Europe/Rome';
const MONDAY = '2026-10-05';
const SUNDAY = '2026-10-11';
const NEXT_WEDNESDAY = '2026-10-14';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** @returns {any} */
const habit = (/** @type {string} */ id, /** @type {any[]} */ periods, type = 'check') => ({ id, label: id, type, periods });
const period = (/** @type {string} */ from, /** @type {string | null} */ to = null, /** @type {number[]} */ days = ALL_DAYS, /** @type {number | null} */ target = null) => ({ from, to, days, target });

/** @returns {any} */
const log = (/** @type {string} */ date, /** @type {any} */ habits = {}, /** @type {any} */ extra = {}) => ({
  date, habits, meals: [], measurements: [], notes: [], rating: null, ...extra,
});

/** @returns {any} */
const task = (/** @type {any} */ over) => ({
  id: 't', title: 't', note: '', band: 'week', bandSetOn: MONDAY, temperature: 'warm', tags: [], position: 0,
  completedAt: null, createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z', source: 'user', ...over,
});

/** @returns {any} */
const goal = (/** @type {any} */ over) => ({
  id: 'g', name: 'g', kind: 'objective', horizon: 'week', horizonSetOn: MONDAY, done: false, progress: null,
  targetDate: null, createdAt: '2026-09-01T08:00:00.000Z', updatedAt: '2026-09-01T08:00:00.000Z', source: 'user', ...over,
});

const categories = /** @type {any[]} */ ([
  { id: 'cat_food', name: 'Food', kind: 'expense', parentId: null, fixedCost: false, archived: false },
  { id: 'cat_pizza', name: 'Pizza', kind: null, parentId: 'cat_food', fixedCost: false, archived: false },
  { id: 'cat_rent', name: 'Rent', kind: 'expense', parentId: null, fixedCost: true, archived: false },
  { id: 'cat_fun', name: 'Fun', kind: 'expense', parentId: null, fixedCost: false, archived: false },
  { id: 'cat_gear', name: 'Gear', kind: 'expense', parentId: null, fixedCost: false, archived: false },
  { id: 'cat_pay', name: 'Pay', kind: 'income', parentId: null, fixedCost: false, archived: false },
]);

/** @returns {any} */
const tx = (/** @type {string} */ date, /** @type {number} */ amount, /** @type {any} */ over = {}) => ({
  id: 'tx_' + date + amount, date, amount, currency: 'EUR', description: 'x', accountId: 'acc_a', counterAccountId: null,
  categoryId: 'cat_food', notCounted: false, tags: [], note: '', origin: null, createdAt: '', updatedAt: '', source: 'user', ...over,
});

/** @param {any} over */
function figures(over = {}) {
  return weekFigures({
    profile: { habits: [], financeCategories: categories },
    dailyLogs: [], tasks: [], goals: [], journalEntries: [], transactions: [], captures: [],
    from: MONDAY, today: NEXT_WEDNESDAY, timezone: ZONE, ...over,
  });
}

/** @param {any[]} habits @param {any[]} logs */
const habitRow = (habits, logs, id = habits[0].id, over = {}) =>
  /** @type {any} */ (
    figures({ profile: { habits, financeCategories: categories }, dailyLogs: logs, ...over }).habits.find((row) => row.habit.id === id)
  );

describe('weekFigures: the frame', () => {
  it('covers Monday to Sunday of a finished week', () => {
    const result = figures();
    expect(result.from).toBe(MONDAY);
    expect(result.to).toBe(SUNDAY);
    expect(result.inProgress).toBe(false);
    expect(result.days).toHaveLength(7);
  });

  it('covers Monday up to today for the week containing today, and says so', () => {
    const result = figures({ today: '2026-10-07' });
    expect(result.inProgress).toBe(true);
    expect(result.to).toBe('2026-10-07');
    expect(result.days).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
  });

  it('refuses a first day that is not a Monday', () => {
    expect(() => figures({ from: '2026-10-06' })).toThrow(/Monday/);
  });
});

describe('weekFigures: habits', () => {
  it('counts scheduled days and days complete, and lists the rest as recorded-missed or unrecorded', () => {
    const row = habitRow([habit('h', [period('2026-01-01')])], [
      log('2026-10-05', { h: true }),
      log('2026-10-06', { h: true }),
      log('2026-10-07', { other: true }), // recorded, this habit not ticked
      // 08..11 nothing recorded
    ]);
    expect(row.scheduled).toBe(7);
    expect(row.complete).toBe(2);
    expect(row.notComplete).toEqual([
      { date: '2026-10-07', state: 'missed' },
      { date: '2026-10-08', state: 'unrecorded' },
      { date: '2026-10-09', state: 'unrecorded' },
      { date: '2026-10-10', state: 'unrecorded' },
      { date: '2026-10-11', state: 'unrecorded' },
    ]);
  });

  it('does not count a day off', () => {
    const row = habitRow([habit('h', [period('2026-01-01', null, [1, 2, 3, 4, 5])])], [log('2026-10-05', { h: true })]);
    expect(row.scheduled).toBe(5);
    expect(row.notComplete.map((/** @type {any} */ d) => d.date)).not.toContain('2026-10-10');
  });

  it('measures a mid-week schedule change against the period that held on each day', () => {
    // Mon-Wed every day, then from Thursday weekdays only: Thu, Fri scheduled, Sat, Sun off.
    const row = habitRow([habit('h', [period('2026-01-01', '2026-10-08'), period('2026-10-08', null, [1, 2, 3, 4, 5])])], []);
    expect(row.scheduled).toBe(5);
  });

  it('measures a counter against the target its period had', () => {
    const periods = [period('2026-01-01', '2026-10-07', ALL_DAYS, 8), period('2026-10-07', null, ALL_DAYS, 4)];
    const row = habitRow([habit('w', periods, 'counter')], [
      log('2026-10-06', { w: 5 }), // target 8: not complete
      log('2026-10-07', { w: 5 }), // target 4: complete
    ]);
    expect(row.complete).toBe(1);
    expect(row.notComplete[0]).toEqual({ date: '2026-10-05', state: 'unrecorded' });
    expect(row.notComplete[1]).toEqual({ date: '2026-10-06', state: 'missed' });
  });

  it('counts only the days before a habit was archived mid-week', () => {
    const row = habitRow([habit('h', [period('2026-01-01', '2026-10-08')])], [log('2026-10-05', { h: true })]);
    expect(row.scheduled).toBe(3);
    expect(row.complete).toBe(1);
  });

  it('omits a habit archived the whole week, and one that started after it', () => {
    const result = figures({
      profile: {
        habits: [habit('gone', [period('2026-01-01', '2026-10-05')]), habit('later', [period('2026-10-12')]), habit('on', [period('2026-01-01')])],
        financeCategories: categories,
      },
    });
    expect(result.habits.map((/** @type {any} */ row) => row.habit.id)).toEqual(['on']);
  });

  it('omits a habit with no scheduled day in the week', () => {
    // Active, but scheduled on Mondays only and the week in progress is... Tuesday.
    const result = figures({
      today: '2026-10-06',
      from: MONDAY,
      profile: { habits: [habit('sat', [period('2026-01-01', null, [6])])], financeCategories: categories },
    });
    expect(result.habits).toEqual([]);
  });

  it('gives the week before the same two figures, and null when it had no scheduled day', () => {
    const logs = [log('2026-09-28', { h: true }), log('2026-09-29', { h: true }), log('2026-09-30', { x: true })];
    const row = habitRow([habit('h', [period('2026-01-01')])], logs);
    expect(row.previous).toEqual({ scheduled: 7, complete: 2 });

    const fresh = habitRow([habit('h', [period('2026-10-05')])], []);
    expect(fresh.previous).toBeNull();
  });

  it('counts days not complete as of today in a week in progress', () => {
    const row = habitRow([habit('h', [period('2026-01-01')])], [log('2026-10-05', { h: true })], 'h', { today: '2026-10-07' });
    expect(row.scheduled).toBe(3);
    expect(row.complete).toBe(1);
  });
});

describe('weekFigures: tasks', () => {
  it('counts a task completed just before midnight in the user timezone, not the UTC day', () => {
    // 23:30 Rome on Sunday the 11th is 21:30Z on the 11th -- inside the week either way;
    // 00:30 Rome on Monday the 12th is 22:30Z on the 11th: UTC says in the week, Rome says out.
    const inside = task({ id: 'in', completedAt: '2026-10-11T21:30:00.000Z' });
    const outside = task({ id: 'out', completedAt: '2026-10-11T22:30:00.000Z' });
    const before = task({ id: 'before', completedAt: '2026-10-04T22:30:00.000Z' }); // Monday 00:30 Rome: inside
    const result = figures({ tasks: [inside, outside, before] });
    expect(result.tasks.completed.map((/** @type {any} */ t) => t.id).sort()).toEqual(['before', 'in']);
  });

  it('lists the overdue tasks as of today with how long', () => {
    const late = task({ id: 'late', band: 'today', bandSetOn: '2026-10-09' });
    const fine = task({ id: 'fine', band: 'week' });
    const result = figures({ tasks: [late, fine] });
    expect(result.tasks.overdue).toEqual([{ task: late, days: 5 }]);
  });
});

describe('weekFigures: goals', () => {
  it('lists goals completed in the week by their own state', () => {
    const done = goal({ id: 'done', done: true, updatedAt: '2026-10-08T10:00:00.000Z' });
    const old = goal({ id: 'old', done: true, updatedAt: '2026-09-20T10:00:00.000Z' });
    const open = goal({ id: 'open', updatedAt: '2026-10-08T10:00:00.000Z' });
    expect(figures({ goals: [done, old, open] }).goals.completed.map((/** @type {any} */ g) => g.id)).toEqual(['done']);
  });

  it('lists slipped goals with the period they are in as of today', () => {
    const slipped = goal({ id: 's', horizonSetOn: MONDAY });
    const result = figures({ goals: [slipped, goal({ id: 'done', done: true })] });
    expect(result.goals.slipped).toEqual([{ goal: slipped, period: 2 }]);
  });
});

describe('weekFigures: spending', () => {
  it('totals the week excluding transfers and not-counted rows, with a refund reducing it', () => {
    const result = figures({
      transactions: [
        tx('2026-10-06', -5000),
        tx('2026-10-07', -2000, { categoryId: 'cat_pizza' }),
        tx('2026-10-08', 1500), // refund on Food
        tx('2026-10-08', -99900, { counterAccountId: 'acc_b', categoryId: null }), // transfer
        tx('2026-10-09', -70000, { notCounted: true }),
        tx('2026-10-10', 300000, { categoryId: 'cat_pay' }), // income, not spending
      ],
    });
    expect(result.spending.total).toBe(5500);
  });

  it('names the three largest top-level categories, a subcategory rolling into its parent', () => {
    const result = figures({
      transactions: [
        tx('2026-10-06', -1000, { categoryId: 'cat_food' }),
        tx('2026-10-06', -2500, { categoryId: 'cat_pizza' }),
        tx('2026-10-07', -9000, { categoryId: 'cat_rent' }),
        tx('2026-10-07', -500, { categoryId: 'cat_fun' }),
        tx('2026-10-07', -700, { categoryId: 'cat_gear' }),
        tx('2026-10-07', -4000, { categoryId: null }), // uncategorised is not a category
      ],
    });
    expect(result.spending.topCategories).toEqual([
      { id: 'cat_rent', name: 'Rent', total: 9000 },
      { id: 'cat_food', name: 'Food', total: 3500 },
      { id: 'cat_gear', name: 'Gear', total: 700 },
    ]);
  });

  it('averages the four weeks before over only those with a transaction, and says how many', () => {
    const result = figures({
      transactions: [
        tx('2026-10-06', -1000),
        tx('2026-09-30', -2000), // week of 09-28
        tx('2026-09-22', -4000), // week of 09-21
        tx('2026-09-23', -2000), // same week -> 6000
        // weeks of 09-14 and 09-07: nothing
        tx('2026-09-01', -50000), // five weeks before: outside the baseline
      ],
    });
    expect(result.spending.baseline).toEqual({ mean: 4000, weeks: 2 });
  });

  it('has no baseline mean when the four weeks before hold nothing', () => {
    const result = figures({ transactions: [tx('2026-10-06', -1000)] });
    expect(result.spending.baseline).toEqual({ mean: null, weeks: 0 });
  });

  it('is unknown, not zero, when the week has no counted transaction', () => {
    const result = figures({ transactions: [tx('2026-10-06', -999, { counterAccountId: 'acc_b' })] });
    expect(result.spending.total).toBeNull();
    expect(result.spending.topCategories).toEqual([]);
  });
});

describe('weekFigures: journal, rating, intake, captures', () => {
  const entry = (/** @type {string} */ id, /** @type {string} */ date, /** @type {string} */ saidAt) => ({
    id, date, text: id, tags: [], saidAt, createdAt: saidAt, updatedAt: saidAt, source: 'user',
  });

  it('counts distinct days with an entry and lists the entries oldest first', () => {
    const result = figures({
      journalEntries: [
        entry('c', '2026-10-08', '2026-10-08T18:00:00+02:00'),
        entry('a', '2026-10-06', '2026-10-06T08:00:00+02:00'),
        entry('b', '2026-10-08', '2026-10-08T07:00:00+02:00'),
        entry('out', '2026-10-12', '2026-10-12T07:00:00+02:00'),
      ],
    });
    expect(result.journal.days).toBe(2);
    expect(result.journal.entries.map((/** @type {any} */ e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('averages the rated days only', () => {
    const result = figures({
      dailyLogs: [log('2026-10-05', {}, { rating: 4 }), log('2026-10-06', {}, { rating: 2 }), log('2026-10-07'), { ...log('2026-10-08'), rating: undefined }],
    });
    expect(result.rating).toEqual({ days: 2, mean: 3 });
  });

  it('has no rating mean, not zero, with no rated day', () => {
    expect(figures({ dailyLogs: [log('2026-10-05')] }).rating).toEqual({ days: null, mean: null });
  });

  it('averages intake over the recorded days of the week', () => {
    const meal = (/** @type {number} */ calories) => ({ id: 'm', label: 'm', time: null, calories, protein: null, carbs: null, fat: null });
    const result = figures({
      dailyLogs: [log('2026-10-05', {}, { meals: [meal(2000)] }), log('2026-10-06', {}, { meals: [meal(1000)] }), log('2026-10-07')],
    });
    expect(result.intake?.calories).toBe(1500);
    expect(result.intake?.recordedDays).toBe(2);
  });

  it('counts captures by the day they were said, in the user timezone', () => {
    const capture = (/** @type {string} */ saidAt) => ({ id: saidAt, text: 'x', origin: 'bar', destination: 'task', route: 'rules', createdAt: saidAt, saidAt, updatedAt: saidAt, source: 'capture' });
    const result = figures({
      captures: [capture('2026-10-05T08:00:00.000Z'), capture('2026-10-11T21:30:00.000Z'), capture('2026-10-11T22:30:00.000Z')],
    });
    expect(result.captures).toBe(2);
  });
});

describe('weekFigures: a week with nothing at all', () => {
  it('has every figure unknown and none zero', () => {
    const result = figures();
    expect(result.habits).toEqual([]);
    expect(result.tasks).toEqual({ completed: [], overdue: [] });
    expect(result.goals).toEqual({ completed: [], slipped: [] });
    expect(result.spending).toEqual({ total: null, baseline: { mean: null, weeks: 0 }, topCategories: [] });
    expect(result.journal).toEqual({ days: null, entries: [] });
    expect(result.rating).toEqual({ days: null, mean: null });
    expect(result.intake).toBeNull();
    expect(result.captures).toBeNull();
  });
});
