/**
 * What happened in a week: every figure the Review screen shows, from one call.
 *
 * A composition, not a second implementation. A habit's day is judged by
 * habits.js, a task's lateness by tasks.js, a goal's slip by goals.js, the
 * week's money by finance.js (the month's own rules), intake by nutrition.js;
 * this module chooses the days to ask about and gathers the answers.
 * Nothing it returns is stored.
 *
 * Two conventions run through it:
 *
 * - A week is Monday to Sunday (dates.js). The week containing today is *in
 *   progress*: every figure covers Monday up to today, and `inProgress` says so.
 * - A figure with nothing behind it is unknown, never zero. A scalar is `null`
 *   (and an object of figures `null`) when no day, row or transaction backs
 *   it; lists are simply empty. "Spent 0" and "recorded nothing" differ.
 */

import { dayKeyRange, shiftDayKey, toDayKey, weekDayKeys } from '../dates.js';
import { totalsBetween } from './finance.js';
import { isComplete, isScheduledOn } from './habits.js';
import { averagesOverRecordedDays } from './nutrition.js';
import { slippedPeriod } from './goals.js';
import { daysOverdue, isOverdue } from './tasks.js';

/** How many weeks before the one reviewed make the spending baseline. */
export const BASELINE_WEEKS = 4;

/** How many categories the review names. */
export const TOP_CATEGORIES = 3;

/**
 * A scheduled day a habit was not completed. `missed`: something was recorded
 * that day, just not this habit. `unrecorded`: nothing at all was -- a
 * forgotten day, which is not the same as a failed one.
 *
 * @typedef {object} HabitMiss
 * @property {string} date
 * @property {'missed' | 'unrecorded'} state
 */

/**
 * @typedef {object} HabitWeek
 * @property {import('../types.js').Habit} habit
 * @property {number} scheduled days in the week the habit was scheduled (at least 1)
 * @property {number} complete of those, days complete against that day's target
 * @property {HabitMiss[]} notComplete the scheduled days not complete, oldest first
 * @property {{ scheduled: number, complete: number } | null} previous the same two
 *   for the whole week before; null when the habit had no scheduled day in it
 */

/**
 * @typedef {object} WeekFigures
 * @property {string} from the week's Monday
 * @property {string} to last day covered: Sunday, or today for the week in progress
 * @property {string} today
 * @property {boolean} inProgress the week contains today, so `to` is today
 * @property {string[]} days every day key covered, oldest first
 * @property {HabitWeek[]} habits one per habit with a scheduled day, in profile order
 * @property {{
 *   completed: import('../types.js').Task[],
 *   overdue: { task: import('../types.js').Task, days: number }[],
 * }} tasks `completed`: completedAt falls in the week in the user's timezone;
 *   `overdue`: late as of today, with how many days
 * @property {{
 *   completed: import('../types.js').Goal[],
 *   slipped: { goal: import('../types.js').Goal, period: number }[],
 * }} goals `completed`: done, last touched in the week (a done goal is not
 *   edited, so that is when it was completed); `slipped`: open goals past
 *   their period as of today, `period` being the one they are in (2 = "2nd")
 * @property {{
 *   total: number | null,
 *   baseline: { mean: number | null, weeks: number },
 *   topCategories: { id: string, name: string, total: number }[],
 * }} spending minor units. `total`: the week's spending by the month's rules
 *   (transfers and not-counted left out, refunds reducing), null with no
 *   counted transaction. `baseline`: mean over the preceding four weeks that
 *   had at least one counted transaction, and how many those were; mean null
 *   with none. `topCategories`: top-level categories (subcategories rolled
 *   in) by spending, largest first, at most three, positive totals only
 * @property {{
 *   days: number | null,
 *   entries: import('../types.js').JournalEntry[],
 * }} journal distinct days with an entry (null with none); entries oldest first
 * @property {{ days: number | null, mean: number | null }} rating days rated
 *   and their mean; both null with no rated day
 * @property {ReturnType<typeof averagesOverRecordedDays> | null} intake the
 *   average over the week's recorded days; null when no day had a meal
 * @property {number | null} captures how many were said in the week; null with none
 */

/**
 * @typedef {object} WeekInputs
 * @property {Pick<import('../types.js').Profile, 'habits'> & Partial<import('../types.js').Profile>} profile
 * @property {import('../types.js').DailyLog[]} dailyLogs any days; the week and the one before are picked out
 * @property {import('../types.js').Task[]} tasks
 * @property {import('../types.js').Goal[]} goals
 * @property {import('../types.js').JournalEntry[]} journalEntries
 * @property {import('../types.js').Transaction[]} transactions
 * @property {import('../types.js').FinanceCategory[]} [categories] defaults to the profile's
 * @property {import('../types.js').Capture[]} captures
 * @property {string} from the week's Monday, as a day key
 * @property {string} today
 * @property {string} [timezone] IANA zone for instants; the configured one by default
 */

/**
 * @param {WeekInputs} inputs
 * @returns {WeekFigures}
 */
export function weekFigures(inputs) {
  const { profile, dailyLogs, tasks, goals, journalEntries, transactions, captures, from, today, timezone } = inputs;
  const categories = inputs.categories ?? profile.financeCategories ?? [];

  const week = weekDayKeys(from);
  if (week[0] !== from) throw new Error('from must be a Monday, received ' + JSON.stringify(from));
  const days = week.filter((day) => day <= today);
  const to = days[days.length - 1] ?? from;
  const inProgress = today >= week[0] && today <= week[6];
  const covers = (/** @type {string} */ day) => day >= from && day <= to;
  const dayOf = (/** @type {string} */ instant) => toDayKey(new Date(instant), timezone);

  const logs = new Map(dailyLogs.map((log) => [log.date, log]));
  const logOn = (/** @type {string} */ day) => logs.get(day) ?? emptyLog(day);

  const previousWeek = weekDayKeys(shiftDayKey(from, -7));

  const habits = [];
  for (const habit of profile.habits) {
    const scheduled = days.filter((day) => isScheduledOn(habit, day));
    if (scheduled.length === 0) continue;
    const completeOn = (/** @type {string} */ day) => isComplete(habit, day, logOn(day).habits[habit.id]);
    const before = previousWeek.filter((day) => isScheduledOn(habit, day));
    habits.push({
      habit,
      scheduled: scheduled.length,
      complete: scheduled.filter(completeOn).length,
      notComplete: scheduled
        .filter((day) => !completeOn(day))
        .map((day) => ({
          date: day,
          state: /** @type {HabitMiss['state']} */ (Object.keys(logOn(day).habits).length > 0 ? 'missed' : 'unrecorded'),
        })),
      previous:
        before.length === 0 ? null : { scheduled: before.length, complete: before.filter(completeOn).length },
    });
  }

  const weekLogs = days.map(logOn);
  const rated = weekLogs.map((log) => log.rating).filter((rating) => typeof rating === 'number');
  const intake = averagesOverRecordedDays(weekLogs);

  const journalInWeek = journalEntries
    .filter((entry) => covers(entry.date))
    .sort((a, b) => (a.saidAt < b.saidAt ? -1 : a.saidAt > b.saidAt ? 1 : 0));
  const journalDays = new Set(journalInWeek.map((entry) => entry.date)).size;

  const capturesInWeek = captures.filter((capture) => covers(dayOf(capture.saidAt))).length;

  return {
    from,
    to,
    today,
    inProgress,
    days,
    habits,
    tasks: {
      completed: tasks.filter((task) => task.completedAt !== null && covers(dayOf(task.completedAt))),
      overdue: tasks
        .filter((task) => isOverdue(task, today))
        .map((task) => ({ task, days: daysOverdue(task, today, dayKeyRange) })),
    },
    goals: {
      completed: goals.filter((goal) => goal.done && covers(dayOf(goal.updatedAt))),
      slipped: goals
        .filter((goal) => !goal.done)
        .map((goal) => ({ goal, period: slippedPeriod(goal, today) }))
        .filter((row) => row.period !== null)
        .map((row) => ({ goal: row.goal, period: /** @type {number} */ (row.period) })),
    },
    spending: spendingFigures(transactions, categories, from, to, previousWeek),
    journal: { days: journalDays === 0 ? null : journalDays, entries: journalInWeek },
    rating: {
      days: rated.length === 0 ? null : rated.length,
      mean: rated.length === 0 ? null : rated.reduce((sum, rating) => sum + rating, 0) / rated.length,
    },
    intake: intake.recordedDays === 0 ? null : intake,
    captures: capturesInWeek === 0 ? null : capturesInWeek,
  };
}

/**
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} from
 * @param {string} to
 * @param {string[]} previousWeek the week before `from`, for the baseline's end
 * @returns {WeekFigures['spending']}
 */
function spendingFigures(transactions, categories, from, to, previousWeek) {
  const now = totalsBetween(transactions, categories, from, to);

  const baselineTotals = [];
  for (let back = 0; back < BASELINE_WEEKS; back += 1) {
    const monday = shiftDayKey(previousWeek[0], -7 * back);
    const totals = totalsBetween(transactions, categories, monday, shiftDayKey(monday, 6));
    if (totals.flows > 0) baselineTotals.push(totals.spending);
  }

  /** @type {Map<string, number>} */
  const byTopLevel = new Map();
  for (const [id, total] of now.byCategory) {
    const category = categories.find((row) => row.id === id);
    if (category === undefined) continue;
    const top = category.parentId ?? category.id;
    if (categories.find((row) => row.id === top)?.kind !== 'expense') continue;
    byTopLevel.set(top, (byTopLevel.get(top) ?? 0) + total);
  }
  const topCategories = [...byTopLevel]
    .filter(([, total]) => total > 0)
    .map(([id, total]) => ({ id, name: categories.find((row) => row.id === id)?.name ?? id, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, TOP_CATEGORIES);

  return {
    total: now.flows === 0 ? null : now.spending,
    baseline: {
      mean:
        baselineTotals.length === 0
          ? null
          : Math.round(baselineTotals.reduce((sum, total) => sum + total, 0) / baselineTotals.length),
      weeks: baselineTotals.length,
    },
    topCategories,
  };
}

/**
 * @param {string} date
 * @returns {import('../types.js').DailyLog}
 */
function emptyLog(date) {
  return { date, habits: {}, meals: [], measurements: [], notes: [], rating: null };
}
