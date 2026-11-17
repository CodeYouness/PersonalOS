import { describe, expect, it } from 'vitest';

import { dayKeyRange } from '@/lib/domain/dates.js';
import { homeClock, homeTiles, keptSoFar, missedRuns, needsYou, worthNoting } from '@/lib/domain/derive/home.js';

// A Wednesday. Its Monday is 2026-11-16, last week's 2026-11-09.
const TODAY = '2026-11-18';
const MONDAY = '2026-11-16';
const LAST_MONDAY = '2026-11-09';
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** @returns {any} */
const habit = (/** @type {string} */ id, /** @type {any} */ over = {}) => ({
  id, label: id, type: 'check', periods: [{ from: '2026-01-01', to: null, days: ALL_DAYS, target: null }], ...over,
});

/** @returns {any} */
const log = (/** @type {string} */ date, /** @type {any} */ habits = {}, /** @type {any} */ extra = {}) => ({
  date, habits, skips: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, time: null, ...extra,
});

/** @returns {any} */
const task = (/** @type {any} */ over) => ({
  id: 't', title: 't', note: '', band: 'today', bandSetOn: TODAY, temperature: 'warm', tags: [], position: 0,
  completedAt: null, createdAt: '2026-11-01T08:00:00.000Z', updatedAt: '2026-11-01T08:00:00.000Z', source: 'user', ...over,
});

/** @returns {any} */
const appointment = (/** @type {any} */ over) => ({
  id: 'a', title: 'a', date: TODAY, startTime: '10:00', endTime: null, calendarLabel: '', note: '', confirmed: true,
  origin: null, createdAt: '', updatedAt: '', source: 'user', ...over,
});

const reviewed = { from: LAST_MONDAY, lever: null, pending: false, started: true };

/** @param {any} over */
const needs = (over = {}) =>
  needsYou({ appointments: [], tasks: [], captures: [], lastWeek: reviewed, today: TODAY, now: '12:00', ...over });

/** A log for every day from `from` to `to`. */
const days = (/** @type {string} */ from, /** @type {string} */ to, /** @type {(day: string, i: number) => any} */ make) =>
  dayKeyRange(from, to).map(make);

describe('homeClock', () => {
  it('is the zone\'s day and time, not UTC\'s, just past midnight', () => {
    expect(homeClock(new Date('2026-11-17T23:30:00Z'), 'Europe/Rome')).toEqual({ today: '2026-11-18', now: '00:30' });
    expect(homeClock(new Date('2026-11-18T04:30:00Z'), 'America/New_York')).toEqual({ today: '2026-11-17', now: '23:30' });
  });

  it('decides which appointments are today\'s at the zone\'s midnight', () => {
    const clock = homeClock(new Date('2026-11-17T23:30:00Z'), 'Europe/Rome');
    const result = needs({
      ...clock,
      appointments: [appointment({ id: 'tue', date: '2026-11-17', startTime: '23:45' }), appointment({ id: 'wed', date: TODAY, startTime: '09:00' })],
    });
    expect(result.appointments.map((row) => row.id)).toEqual(['wed']);
  });
});

describe('needsYou', () => {
  it('is empty when nothing needs you', () => {
    const result = needs();
    expect(result.empty).toBe(true);
    expect(result.appointments).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.moreTasks).toBeNull();
    expect(result.unclassified).toBe(0);
    expect(result.review).toBeNull();
  });

  it('lists today\'s appointments still to come, earliest first; past, other days and unconfirmed ones are left out', () => {
    const result = needs({
      appointments: [
        appointment({ id: 'late', startTime: '18:00' }),
        appointment({ id: 'past', startTime: '09:00' }),
        appointment({ id: 'now', startTime: '12:00' }),
        appointment({ id: 'tomorrow', date: '2026-11-19', startTime: '13:00' }),
        appointment({ id: 'gone', startTime: '15:00', confirmed: false }),
      ],
    });
    expect(result.appointments.map((row) => row.id)).toEqual(['now', 'late']);
    expect(result.empty).toBe(false);
  });

  it('lists tasks overdue or due today, overdue first with its days; a later task is not listed', () => {
    const result = needs({
      tasks: [
        task({ id: 'today' }),
        task({ id: 'late', bandSetOn: '2026-11-15' }),
        task({ id: 'week', band: 'week', bandSetOn: '2026-11-10' }),
        task({ id: 'done', bandSetOn: '2026-11-15', completedAt: '2026-11-17T10:00:00.000Z' }),
      ],
    });
    expect(result.tasks.map((row) => [row.task.id, row.overdueDays])).toEqual([['late', 3], ['today', 0]]);
    expect(result.tasks[0].href).toBe('/crm?task=late');
    expect(result.moreTasks).toBeNull();
  });

  it('caps the tasks and says how many more, linking to the CRM', () => {
    const tasks = Array.from({ length: 7 }, (_, i) => task({ id: 't' + i, position: i }));
    const result = needs({ tasks });
    expect(result.tasks).toHaveLength(5);
    expect(result.moreTasks).toEqual({ count: 2, href: '/crm' });
    expect(needs({ tasks: tasks.slice(0, 5) }).moreTasks).toBeNull();
    expect(needsYou({ appointments: [], tasks, captures: [], lastWeek: reviewed, today: TODAY, now: '12:00' }, { taskCount: 3 }).moreTasks?.count).toBe(4);
  });

  it('counts the captures left unclassified', () => {
    const result = needs({ captures: [{ route: 'unclassified' }, { route: 'model' }, { route: 'rules' }, { route: 'unclassified' }] });
    expect(result.unclassified).toBe(2);
    expect(result.empty).toBe(false);
  });

  it('asks for last week\'s review while it is absent or unfinished, and not once completed', () => {
    expect(needs({ lastWeek: { from: LAST_MONDAY, lever: null, pending: true, started: false } }).review).toEqual({
      from: LAST_MONDAY, started: false, href: '/review?week=' + LAST_MONDAY,
    });
    expect(needs({ lastWeek: { from: LAST_MONDAY, lever: null, pending: true, started: true } }).review?.started).toBe(true);
    expect(needs({ lastWeek: { ...reviewed, lever: 'Ship it' } }).review).toBeNull();
  });
});

describe('keptSoFar', () => {
  it('counts Monday to yesterday, and today only for a habit already answered', () => {
    const habits = [habit('a'), habit('b')];
    const logs = [
      log(MONDAY, { a: true, b: true }),
      log('2026-11-17', { a: true }),
      // Today: a kept, b still open -- b is not a miss yet.
      log(TODAY, { a: true }),
    ];
    expect(keptSoFar(habits, logs, TODAY)).toEqual({ kept: 4, scheduled: 5, rate: 0.8 });
  });

  it('counts today\'s habit given a reason as a miss, and a paused one not at all', () => {
    const habits = [habit('a'), habit('b')];
    const logs = [log(TODAY, {}, { skips: { a: 'forgotten', b: 'paused' } })];
    // Monday and Tuesday unrecorded: two misses each; today a once, b not at all.
    expect(keptSoFar(habits, logs, TODAY)).toEqual({ kept: 0, scheduled: 5, rate: 0 });
  });

  it('is unknown, not zero, on a Monday morning with nothing answered', () => {
    expect(keptSoFar([habit('a')], [], MONDAY)).toEqual({ kept: 0, scheduled: 0, rate: null });
  });
});

describe('missedRuns', () => {
  it('names a habit missed on its last three scheduled days, not two', () => {
    const habits = [habit('gym'), habit('read')];
    const logs = [
      log('2026-11-14', { gym: true, read: true }),
      log('2026-11-15', { gym: false, read: true }),
      log('2026-11-16', { gym: false, read: false }),
      log('2026-11-17', { gym: false, read: false }),
    ];
    expect(missedRuns(habits, logs, TODAY, 3).map((run) => [run.habit.id, run.days])).toEqual([['gym', 3]]);
    expect(missedRuns(habits, logs, TODAY, 2).map((run) => run.habit.id)).toEqual(['gym', 'read']);
    expect(missedRuns(habits, logs, TODAY, 4)).toEqual([]);
  });

  it('passes over a paused day and a day with nothing recorded, and only scheduled days count', () => {
    const gym = habit('gym', { periods: [{ from: '2026-01-01', to: null, days: [1, 3, 5], target: null }] });
    const logs = [
      log('2026-11-09', { gym: false }), // Mon
      log('2026-11-11', {}, { skips: { gym: 'paused' } }), // Wed, paused
      log('2026-11-13', {}), // Fri, nothing recorded at all
      log('2026-11-14', { gym: true }), // Sat, a day off: does not end the run
      log('2026-11-16', { gym: false }), // Mon
    ];
    logs.unshift(log('2026-11-06', { gym: true })); // Fri, kept: ends the run
    expect(missedRuns([gym], logs, TODAY, 2).map((run) => run.days)).toEqual([2]);
    expect(missedRuns([gym], logs, TODAY, 3)).toEqual([]);
  });

  it('does not count today, which is not over', () => {
    const logs = [log('2026-11-16', { a: false }), log('2026-11-17', { a: false }), log(TODAY, { a: false })];
    expect(missedRuns([habit('a')], logs, TODAY, 3)).toEqual([]);
  });

  it('passes over a day whose time is not declared for a habit counted from it', () => {
    const gym = habit('gym', { countedFrom: 'training' });
    const logs = [
      log('2026-11-15', {}, { time: { training: 0 }, mood: 3, skips: {} }),
      log('2026-11-16', { other: true }), // recorded, but no time declared
      log('2026-11-17', {}, { time: { training: 0 } }),
    ];
    expect(missedRuns([gym, habit('other')], logs, TODAY, 2).find((run) => run.habit.id === 'gym')?.days).toBe(2);
  });

  it('leaves out a habit not active today', () => {
    const old = habit('old', { periods: [{ from: '2026-01-01', to: '2026-11-17', days: ALL_DAYS, target: null }] });
    const logs = [log('2026-11-15', { old: false }), log('2026-11-16', { old: false }), log('2026-11-17', { old: false })];
    expect(missedRuns([old], logs, TODAY, 3)).toEqual([]);
  });
});

describe('worthNoting', () => {
  /** @param {any} over @param {any} [thresholds] */
  const notes = (over = {}, thresholds) =>
    worthNoting({ habits: [], dailyLogs: [], today: TODAY, lastWeek: reviewed, spending: null, netWorth: null, ...over }, thresholds);

  it('says nothing when nothing differs', () => {
    expect(notes()).toEqual([]);
  });

  it('notes this week\'s lever when one is set', () => {
    expect(notes({ lastWeek: { ...reviewed, lever: 'Pricing page first' } })).toEqual([
      { kind: 'lever', lever: 'Pricing page first', href: '/review?week=' + LAST_MONDAY },
    ]);
  });

  describe('the habits kept this week against the four weeks before', () => {
    // Baseline: four weeks, one habit every day, kept on `baselineKept` of 28 days.
    // This week: Monday and Tuesday, two habits, all kept or not.
    function keptInputs(/** @type {number} */ baselineKept, /** @type {boolean[]} */ week) {
      const habits = [habit('a')];
      const dailyLogs = [
        ...days('2026-10-19', '2026-11-15', (day, i) => log(day, { a: i < baselineKept })),
        ...week.map((kept, i) => log(['2026-11-16', '2026-11-17', TODAY][i], { a: kept })),
      ];
      return { habits, dailyLogs };
    }

    it('notes at the threshold and above, not below', () => {
      // This week 3 of 3 (100%). Baseline 24/28 = 86% (14 points off), 23/28 = 82% (18).
      expect(notes(keptInputs(24, [true, true, true]), { keptPoints: 15, keptMinDays: 3 })).toEqual([]);
      expect(notes(keptInputs(23, [true, true, true]), { keptPoints: 18, keptMinDays: 3 })[0]).toMatchObject({
        kind: 'kept', week: { kept: 3, scheduled: 3 }, baseline: { kept: 23, scheduled: 28 }, href: '/habits',
      });
      expect(notes(keptInputs(23, [true, true, true]), { keptPoints: 19, keptMinDays: 3 })).toEqual([]);
    });

    it('notes a week below usual as well as above', () => {
      expect(notes(keptInputs(28, [false, false, true]), { keptPoints: 15, keptMinDays: 3 })[0]).toMatchObject({ kind: 'kept' });
    });

    it('waits for enough habit-days this week', () => {
      expect(notes(keptInputs(28, [false, false, false]), { keptPoints: 15, keptMinDays: 4 })).toEqual([]);
    });
  });

  describe('last week\'s spending against the weeks before', () => {
    const spending = (/** @type {number} */ total, /** @type {number} */ mean, weeks = 4) => ({ total, baseline: { mean, weeks }, topCategories: [] });

    it('notes at 30% off and above, either way, not below', () => {
      expect(notes({ spending: spending(13000, 10000) })[0]).toMatchObject({ kind: 'spending', total: 13000, mean: 10000, weeks: 4, href: '/finances' });
      expect(notes({ spending: spending(7000, 10000) })[0]).toMatchObject({ kind: 'spending' });
      expect(notes({ spending: spending(12999, 10000) })).toEqual([]);
      expect(notes({ spending: spending(7001, 10000) })).toEqual([]);
    });

    it('says nothing without a total, a baseline, or enough weeks behind it', () => {
      expect(notes({ spending: { total: null, baseline: { mean: 10000, weeks: 4 }, topCategories: [] } })).toEqual([]);
      expect(notes({ spending: { total: 20000, baseline: { mean: null, weeks: 0 }, topCategories: [] } })).toEqual([]);
      expect(notes({ spending: spending(20000, 0) })).toEqual([]);
      expect(notes({ spending: spending(20000, 10000, 1) })).toEqual([]);
    });
  });

  describe('net worth over 30 days', () => {
    it('notes a move of 5% of what it was and above, not below', () => {
      // 100,000 before, 105,000 now.
      expect(notes({ netWorth: { value: 10_500_000, change30: 500_000 } })[0]).toMatchObject({ kind: 'net-worth', change: 500_000, href: '/finances' });
      expect(notes({ netWorth: { value: 9_500_000, change30: -500_000 } })[0]).toMatchObject({ kind: 'net-worth' });
      expect(notes({ netWorth: { value: 10_499_999, change30: 499_999 } })).toEqual([]);
    });

    it('says nothing while net worth or its change is unknown, or it was zero', () => {
      expect(notes({ netWorth: null })).toEqual([]);
      expect(notes({ netWorth: { value: 10_000, change30: null } })).toEqual([]);
      expect(notes({ netWorth: { value: 10_000, change30: 10_000 } })).toEqual([]);
    });
  });

  it('keeps at most three, in order: lever, a missed habit, then figures', () => {
    const result = notes({
      lastWeek: { ...reviewed, lever: 'Ship it' },
      habits: [habit('gym')],
      dailyLogs: [log('2026-11-15', { gym: false }), log('2026-11-16', { gym: false }), log('2026-11-17', { gym: false })],
      spending: { total: 20000, baseline: { mean: 10000, weeks: 4 }, topCategories: [] },
      netWorth: { value: 20_000, change30: 10_000 },
    });
    expect(result.map((note) => note.kind)).toEqual(['lever', 'missed', 'spending']);
  });
});

describe('homeTiles', () => {
  const base = {
    habits: [], dailyLogs: [], today: TODAY, goals: [], journalEntries: [],
    finance: { asOf: null, netWorth: 0, changes: { days30: null } },
  };

  it('says unknown, not zero, with no balance, no habits, no goals and no journal', () => {
    const tiles = homeTiles(base);
    expect(tiles.money).toEqual({ netWorth: null, change30: null, href: '/finances' });
    expect(tiles.habits).toMatchObject({ active: 0, rate: null, href: '/habits' });
    expect(tiles.goals).toEqual({ open: 0, href: '/goals' });
    expect(tiles.journal).toEqual({ thisWeek: 0, last: null, href: '/journal?date=' + TODAY });
  });

  it('reads net worth and its change once a value exists, open goals, and the journal', () => {
    const tiles = homeTiles({
      ...base,
      habits: [habit('a')],
      dailyLogs: [log(MONDAY, { a: true })],
      finance: { asOf: '2026-11-01', netWorth: 1_234_500, changes: { days30: -2_000 } },
      goals: [{ done: false }, { done: true }, { done: false }],
      journalEntries: [{ date: '2026-11-02' }, { date: MONDAY }, { date: TODAY }],
    });
    expect(tiles.money).toMatchObject({ netWorth: 1_234_500, change30: -2_000 });
    expect(tiles.habits).toMatchObject({ active: 1, kept: 1, scheduled: 2 });
    expect(tiles.goals.open).toBe(2);
    expect(tiles.journal).toMatchObject({ thisWeek: 2, last: TODAY });
  });
});
