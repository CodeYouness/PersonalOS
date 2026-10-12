/**
 * The life figures of the question context (#174): the numbers the Habits,
 * Nutrition & Health and Goals screens show, each made citable. The seam is
 * `lifeFigures` over the archive the context reads, and every expected value
 * is what the screen's own derivation returns for the same stored days and
 * the faked date -- never a number typed in here -- so the figure in an
 * answer is the number on the screen (rule 6).
 *
 * The route-level test of what the model is sent lives in
 * questions-route-model.test.js.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { dayKeysEndingAt, shiftDayKey } from '@/lib/domain/dates.js';
import { goalsAddress, habitsAddress, nutritionAddress } from '@/lib/domain/addresses.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';
import { HABITS_WINDOW_DAYS, historyRows, STREAK_WINDOW_DAYS, streak, windowSummary } from '@/lib/domain/derive/habits.js';
import { healthAverages, weightTrend } from '@/lib/domain/derive/health.js';
import { calorieStanding, dayTotals } from '@/lib/domain/derive/nutrition.js';
import { limits } from '@/personalos.config.js';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const TODAY = '2026-09-24';
const WINDOW = limits.healthWindowDays;

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/ai/context/read.js')} */
let read;
/** @type {typeof import('@/lib/ai/context/figures-life.js')} */
let figures;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-figures-life-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  read = await import('@/lib/ai/context/read.js');
  figures = await import('@/lib/ai/context/figures-life.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The figures as the context builds them. */
async function build() {
  const archive = await read.readArchive();
  return figures.lifeFigures(archive, { today: TODAY });
}

/**
 * @param {Awaited<ReturnType<typeof build>>} items
 * @param {string} id
 */
function find(items, id) {
  return items.find((item) => item.id === id);
}

/** @param {number} value what a screen formats with one fixed locale */
const count = (value) => value.toLocaleString('en-GB');

/**
 * @param {string} date
 * @param {string} name
 * @param {Partial<Record<'calories' | 'protein' | 'carbs' | 'fat', number | null>>} numbers
 */
function meal(date, name, numbers) {
  return store.createMeal({ date, name, time: null, calories: null, protein: null, carbs: null, fat: null, ...numbers });
}

/**
 * Backdate the clock to write at a past day, then come back to today.
 *
 * @param {string} dayKey
 * @param {() => Promise<unknown>} write
 */
async function at(dayKey, write) {
  vi.setSystemTime(new Date(dayKey + 'T10:00:00Z'));
  try {
    await write();
  } finally {
    vi.setSystemTime(NOON);
  }
}

describe('the shape of a life figure', () => {
  it('is an ordinary context item: a figure type, no labels, and the screen it opens', async () => {
    await meal(shiftDayKey(TODAY, -2), 'Lunch', { calories: 700, protein: 30, carbs: 80, fat: 20 });
    await meal(TODAY, 'Breakfast', { calories: 400, protein: 20, carbs: 40, fat: 10 });
    await store.createMeasurement({ date: shiftDayKey(TODAY, -2), metric: 'weight', value: 75 });
    const items = await build();

    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.type).toBe('figure');
      expect(item.labels).toEqual([]);
      expect(item.id).toMatch(/^figure:[a-z0-9-]+(:[A-Za-z0-9._-]+)*$/);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.label.length).toBeLessThanOrEqual(60);
    }
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);

    expect(find(items, 'figure:habit-streak:now')?.opens).toBe(habitsAddress());
    expect(find(items, `figure:health-calories-avg:${WINDOW}d`)?.opens).toBe(nutritionAddress());
    expect(find(items, 'figure:calories:today')?.opens).toBe(nutritionAddress());
    expect(find(items, 'figure:weight:latest')?.opens).toBe(nutritionAddress());
    expect(find(items, 'figure:goal-progress:goal_seed_2')?.opens).toBe(goalsAddress('goal_seed_2'));
  });

  it('is the same for the same data and date, in the same order', async () => {
    await meal(shiftDayKey(TODAY, -1), 'Lunch', { calories: 700 });
    expect((await build()).map((item) => item.id)).toEqual((await build()).map((item) => item.id));
  });
});

describe('habits', () => {
  it('carries the running streak the home card and the Habits screen show, over contiguous days', async () => {
    // Yesterday and the day before, but not the day before that: a gap breaks
    // it, and the archive only holds the days that have a log.
    await store.logHabitValue({ date: shiftDayKey(TODAY, -1), habitId: 'habit_move', value: true });
    await store.logHabitValue({ date: shiftDayKey(TODAY, -2), habitId: 'habit_move', value: true });
    await store.logHabitValue({ date: shiftDayKey(TODAY, -4), habitId: 'habit_move', value: true });

    const profile = await store.getProfile();
    const logs = await store.getDailyLogs(dayKeysEndingAt(STREAK_WINDOW_DAYS, TODAY)[0], TODAY);
    const expected = streak(profile.habits, logs, TODAY);
    expect(expected).toBe(2);

    const item = find(await build(), 'figure:habit-streak:now');
    expect(item?.content).toContain('2 days');
    expect(item?.content).toContain('24 Sep 2026');
  });

  it('carries the 30-day completion, perfect days and days recorded as the summary strip does', async () => {
    await store.logHabitValue({ date: shiftDayKey(TODAY, -1), habitId: 'habit_move', value: true });
    await store.logHabitValue({ date: shiftDayKey(TODAY, -1), habitId: 'habit_read', value: true });
    await store.logHabitValue({ date: shiftDayKey(TODAY, -1), habitId: 'habit_water', value: 8 });
    await store.logHabitValue({ date: shiftDayKey(TODAY, -1), habitId: 'habit_deep_work', value: 3 });
    await store.logHabitValue({ date: shiftDayKey(TODAY, -3), habitId: 'habit_water', value: 4 });

    const profile = await store.getProfile();
    const logs = await store.getDailyLogs(dayKeysEndingAt(30, TODAY)[0], TODAY);
    const summary = windowSummary(profile.habits, logs);
    expect(summary.recordedDays).toBe(2);
    expect(summary.perfectDays).toBe(1);

    const item = find(await build(), 'figure:habit-completion:30d');
    expect(item?.content).toContain(Math.round(summary.completion * 100) + '%');
    expect(item?.content).toContain(`${summary.perfectDays} of ${summary.recordedDays}`);
    expect(item?.content).toContain(`${summary.recordedDays} of ${summary.days}`);
    expect(item?.opens).toBe(habitsAddress());
  });

  it('states no completion percentage when no day in the window was recorded', async () => {
    const item = find(await build(), 'figure:habit-completion:30d');
    expect(item?.content).not.toMatch(/\d%/);
    expect(item?.content).toContain('0 of 30');
    expect(find(await build(), 'figure:habit-streak:now')?.content).toContain('0 days');
  });

  it('follows the schedule as the screen does: a habit kept on weekdays is rated on its weekdays only', async () => {
    // Deep work is Monday to Friday in the seed. Saturday 19 is a day off and
    // ticked anyway; Monday to Wednesday are done in full.
    for (const date of ['2026-09-19', '2026-09-21', '2026-09-22', '2026-09-23']) {
      await store.logHabitValue({ date, habitId: 'habit_deep_work', value: 3 });
    }

    const profile = await store.getProfile();
    const streakLogs = await store.getDailyLogs(dayKeysEndingAt(STREAK_WINDOW_DAYS, TODAY)[0], TODAY);
    const logs = streakLogs.slice(-HABITS_WINDOW_DAYS);
    const row = historyRows(profile.habits, logs).find((entry) => entry.habit.id === 'habit_deep_work');
    const summary = windowSummary(profile.habits, logs);
    expect(row?.rate).toBe(1);
    expect(row?.ratedDays).toBe(3);

    const items = await build();
    const rate = find(items, 'figure:habit-rate:habit_deep_work:30d');
    expect(rate?.content).toContain('100%');
    expect(rate?.content).toContain('rests on 3 days');
    const completion = find(items, 'figure:habit-completion:30d');
    expect(completion?.content).toContain(Math.round(summary.completion * 100) + '%');
    expect(completion?.content).toContain(`${summary.perfectDays} of ${summary.recordedDays}`);
    const streakDays = streak(profile.habits, streakLogs, TODAY);
    expect(find(items, 'figure:habit-streak:now')?.content).toContain(streakDays + ' days');
  });

  it('carries a rate per habit that was active in the window, an archived one too, and no other', async () => {
    const yesterday = shiftDayKey(TODAY, -1);
    await store.logHabitValue({ date: yesterday, habitId: 'habit_read', value: true });
    await store.logHabitValue({ date: yesterday, habitId: 'habit_water', value: 4 });
    // Archived yesterday-ish: its period closed, its days still count.
    await at(TODAY, () => store.updateHabit('habit_read', { archived: true }));
    // Archived long before the window: it has no row on the screen either.
    await at('2026-01-10', () => store.updateHabit('habit_deep_work', { archived: true }));

    const profile = await store.getProfile();
    const logs = await store.getDailyLogs(dayKeysEndingAt(30, TODAY)[0], TODAY);
    const rows = historyRows(profile.habits, logs);
    const items = await build();

    const rate = (/** @type {string} */ id) => rows.find((row) => row.habit.id === id)?.rate ?? NaN;
    const water = find(items, 'figure:habit-rate:habit_water:30d');
    expect(water?.content).toContain(Math.round(rate('habit_water') * 100) + '%');
    expect(water?.content).not.toContain('archived');

    const archivedRead = find(items, 'figure:habit-rate:habit_read:30d');
    expect(archivedRead?.content).toContain(Math.round(rate('habit_read') * 100) + '%');
    expect(archivedRead?.content).toContain('archived');

    expect(find(items, 'figure:habit-rate:habit_deep_work:30d')).toBeUndefined();
    expect(rows.some((row) => row.habit.id === 'habit_deep_work')).toBe(false);
  });

  it('leaves out the rate of a habit that was active in the window but on no recorded day', async () => {
    await store.logHabitValue({ date: shiftDayKey(TODAY, -1), habitId: 'habit_read', value: true });
    // A new habit, made today: it is active today, but today holds nothing.
    await store.createHabit({ label: 'Stretch', type: 'check', target: null });
    const items = await build();
    expect(items.some((item) => item.id.startsWith('figure:habit-rate:habit_read'))).toBe(true);
    expect(items.filter((item) => item.id.startsWith('figure:habit-rate:')).every((item) => /\d%/.test(item.content))).toBe(true);
    const profile = await store.getProfile();
    const stretch = profile.habits.find((habit) => habit.label === 'Stretch');
    expect(find(items, `figure:habit-rate:${stretch?.id}:30d`)).toBeUndefined();
  });
});

describe('habit window', () => {
  it('is the one the Habits screen reads, named once', async () => {
    const items = await build();

    expect(find(items, 'figure:habit-completion:' + HABITS_WINDOW_DAYS + 'd')).toBeDefined();
    expect(find(items, 'figure:habit-completion:' + HABITS_WINDOW_DAYS + 'd')?.content).toContain('0 of ' + HABITS_WINDOW_DAYS);
    // The page imports the constant; a copy of its own is how the two drift apart.
    const page = await readFile('app/habits/page.js', 'utf8');
    expect(page).toMatch(/HABITS_WINDOW_DAYS[^;]*from '@\/lib\/domain\/derive\/habits\.js'/s);
    expect(page).not.toMatch(/const \w*WINDOW_DAYS\s*=/);
  });
});

describe('health', () => {
  beforeEach(async () => {
    await meal(shiftDayKey(TODAY, -3), 'Lunch', { calories: 2000, protein: 100, carbs: 200, fat: 70 });
    await meal(shiftDayKey(TODAY, -2), 'Dinner', { calories: 2400, protein: 130, carbs: 250, fat: 80 });
    // A recorded day whose meal has no numbers at all: not a day for calories.
    await meal(shiftDayKey(TODAY, -1), 'Something', {});
    await store.createMeasurement({ date: shiftDayKey(TODAY, -20), metric: 'weight', value: 76.4 });
    await store.createMeasurement({ date: shiftDayKey(TODAY, -2), metric: 'weight', value: 75.2 });
  });

  it('carries each average the Health card shows, over the days before today', async () => {
    const profile = await store.getProfile();
    const logs = await store.getDailyLogs(shiftDayKey(TODAY, -WINDOW), TODAY);
    const averages = healthAverages(logs, TODAY);
    expect(averages.calories).toBe(2200);
    const items = await build();

    const calories = find(items, `figure:health-calories-avg:${WINDOW}d`);
    expect(calories?.content).toContain(count(/** @type {number} */ (averages.calories)) + ' kcal');
    expect(calories?.content).toContain(`${averages.days.calories} days`);
    expect(calories?.content).toContain(count(profile.calorieTarget));
    expect(calories?.content).toContain('1 meal missing numbers');
    for (const metric of /** @type {const} */ (['protein', 'carbs', 'fat'])) {
      const item = find(items, `figure:health-${metric}-avg:${WINDOW}d`);
      expect(item?.content).toContain(count(/** @type {number} */ (averages[metric])) + ' g');
    }
  });

  it('carries the latest weight and the change since the first, as the card does', async () => {
    const logs = await store.getDailyLogs(shiftDayKey(TODAY, -WINDOW), TODAY);
    const trend = weightTrend(logs);
    expect(trend).toEqual({ latest: 75.2, change: -1.2, since: shiftDayKey(TODAY, -20) });
    const items = await build();

    expect(find(items, 'figure:weight:latest')?.content).toContain('75.2 kg');
    const change = find(items, `figure:weight-change:${WINDOW}d`);
    expect(change?.content).toContain('−1.2 kg');
    expect(change?.content).toContain('4 Sep 2026');
  });

  it('leaves out the change when only one day has a weight', async () => {
    await store.deleteMeasurement(
      /** @type {string} */ (
        (await store.getDailyLog(shiftDayKey(TODAY, -20))).measurements[0]?.id
      )
    );
    const items = await build();
    expect(find(items, 'figure:weight:latest')?.content).toContain('75.2 kg');
    expect(find(items, `figure:weight-change:${WINDOW}d`)).toBeUndefined();
  });

  it('carries today against the target, with what is left', async () => {
    await meal(TODAY, 'Breakfast', { calories: 500, protein: 20, carbs: 60, fat: 15 });
    await meal(TODAY, 'Snack', { calories: 140, protein: 3, carbs: 20, fat: 5 });
    await meal(TODAY, 'Mystery', {});
    const profile = await store.getProfile();
    const totals = dayTotals(await store.getDailyLog(TODAY));
    const standing = calorieStanding(totals, profile.calorieTarget);
    expect(standing).toEqual({ kind: 'left', kcal: profile.calorieTarget - 640 });
    const items = await build();

    const calories = find(items, 'figure:calories:today');
    expect(calories?.content).toContain(count(/** @type {number} */ (totals.calories)) + ' kcal');
    expect(calories?.content).toContain(count(profile.calorieTarget));
    expect(calories?.content).toContain(count(/** @type {{ kcal: number }} */ (standing).kcal) + ' kcal left');
    expect(calories?.content).toContain('1 meal missing numbers');
    expect(find(items, 'figure:protein:today')?.content).toContain(count(/** @type {number} */ (totals.protein)) + ' g');
    expect(find(items, 'figure:carbs:today')?.content).toContain(count(/** @type {number} */ (totals.carbs)) + ' g');
    expect(find(items, 'figure:fat:today')?.content).toContain(count(/** @type {number} */ (totals.fat)) + ' g');
  });

  it('says how far over the target today is, as information', async () => {
    await meal(TODAY, 'Feast', { calories: 3000 });
    const profile = await store.getProfile();
    const content = find(await build(), 'figure:calories:today')?.content;
    expect(content).toContain(count(3000 - profile.calorieTarget) + ' kcal over');
  });
});

describe('what is unknown stays out', () => {
  it('has no health, weight or nutrition figure when nothing is recorded in the window', async () => {
    const ids = (await build()).map((item) => item.id);
    expect(ids.filter((id) => /^figure:(health-|weight|calories|protein|carbs|fat)/.test(id))).toEqual([]);
  });

  it('has no today figure on a day with no meals, though earlier days have some', async () => {
    await meal(shiftDayKey(TODAY, -1), 'Lunch', { calories: 900, protein: 40, carbs: 90, fat: 30 });
    const ids = (await build()).map((item) => item.id);
    expect(ids).toContain(`figure:health-calories-avg:${WINDOW}d`);
    expect(ids.filter((id) => id.endsWith(':today'))).toEqual([]);
  });

  it('has no calories figure for today when its meals carry no calories, but keeps the macros it knows', async () => {
    await meal(TODAY, 'Protein shake', { protein: 25 });
    const items = await build();
    expect(find(items, 'figure:calories:today')).toBeUndefined();
    expect(find(items, 'figure:protein:today')?.content).toContain('25 g');
    expect(find(items, 'figure:carbs:today')).toBeUndefined();
  });

  it('has no average for a number no recorded day knows', async () => {
    await meal(shiftDayKey(TODAY, -1), 'Shake', { protein: 25 });
    const ids = (await build()).map((item) => item.id);
    expect(ids).toContain(`figure:health-protein-avg:${WINDOW}d`);
    expect(ids).not.toContain(`figure:health-calories-avg:${WINDOW}d`);
  });
});

describe('goals', () => {
  it('carries the progress of an open goal that has one, and how far each slipped goal has slipped', async () => {
    const { groups } = goalBoard(await store.getGoals(), TODAY);
    const rows = groups.flatMap((group) => group.rows);
    const items = await build();

    for (const { goal, slipped } of rows) {
      const progress = find(items, `figure:goal-progress:${goal.id}`);
      if (goal.progress === null) expect(progress).toBeUndefined();
      else {
        expect(progress?.content).toContain(`${goal.progress.current} of ${goal.progress.target}`);
        expect(progress?.opens).toBe(goalsAddress(goal.id));
      }
      const slip = find(items, `figure:goal-slip:${goal.id}`);
      if (slipped === null) expect(slip).toBeUndefined();
      else {
        expect(slip?.content).toContain(goal.horizon);
        expect(slip?.opens).toBe(goalsAddress(goal.id));
      }
    }
    // The seed's week and month goals were chosen in January: all are slipped.
    expect(rows.filter((row) => row.slipped !== null).length).toBe(3);
    const weekGoal = rows.find((row) => row.goal.id === 'goal_seed_2');
    expect(find(items, 'figure:goal-slip:goal_seed_2')?.content).toMatch(new RegExp(`${weekGoal?.slipped}(st|nd|rd|th) week`));
  });

  it('has neither figure for a done goal, and no slip for a goal that is not past its first period or has no horizon', async () => {
    await store.updateGoal('goal_seed_2', { done: true });
    const fresh = await store.createGoal({ name: 'Ship it', horizon: 'week', progress: { current: 2, target: 5 } });
    const open = await store.createGoal({ name: 'Someday', horizon: 'open', progress: { current: 1, target: 10 } });
    const items = await build();

    expect(find(items, 'figure:goal-progress:goal_seed_2')).toBeUndefined();
    expect(find(items, 'figure:goal-slip:goal_seed_2')).toBeUndefined();
    expect(find(items, `figure:goal-progress:${fresh.id}`)?.content).toContain('2 of 5');
    expect(find(items, `figure:goal-slip:${fresh.id}`)).toBeUndefined();
    expect(find(items, `figure:goal-progress:${open.id}`)?.content).toContain('1 of 10');
    expect(find(items, `figure:goal-slip:${open.id}`)).toBeUndefined();
  });
});
