/**
 * Habit completion and streaks, computed from the daily logs.
 *
 * Nothing here is stored. A streak recomputed from the logs can never drift
 * away from them, which a stored counter eventually does.
 *
 * A habit is measured only on the days it is *scheduled* -- active, and the
 * weekday one of its period's days (ADR 0029). "Active" alone still decides
 * whether a day can be ticked at all and whether a habit has a history row;
 * every number asks "scheduled?".
 */

import { weekdayOf } from '../dates.js';

/**
 * The period a day falls in -- half-open, so a period's `to` day itself is
 * not in it -- or null when the habit did not exist or was archived that
 * day. The period says what that day was measured against: its days and its
 * target (ADR 0029), never the habit's current ones.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @returns {import('../types.js').HabitPeriod | null}
 */
export function periodOn(habit, dayKey) {
  return (
    habit.periods.find((period) => dayKey >= period.from && (period.to === null || dayKey < period.to)) ?? null
  );
}

/**
 * A habit counts on a day only inside one of its periods. "Archived" has no
 * field of its own: it is simply having no period open on that day. See ADR
 * 0015.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @returns {boolean}
 */
export function isActiveOn(habit, dayKey) {
  return periodOn(habit, dayKey) !== null;
}

/**
 * Whether a habit was expected on a day: active, and the day's weekday one
 * of that period's days. Active but not scheduled is a **day off** -- the
 * habit exists and nothing counts against it, which is not the same as not
 * existing (docs/domain.md).
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @returns {boolean}
 */
export function isScheduledOn(habit, dayKey) {
  const period = periodOn(habit, dayKey);
  return period !== null && period.days.includes(weekdayOf(dayKey));
}

/**
 * What is expected of a habit now: its open period, or its last one when it
 * is archived -- which is what restoring reopens with. A habit always has at
 * least one period, so there is always an answer.
 *
 * @param {import('../types.js').Habit} habit
 * @returns {import('../types.js').HabitPeriod}
 */
export function currentPeriod(habit) {
  return habit.periods[habit.periods.length - 1];
}

/**
 * How much of a day was completed, 0..1. Checks count whole, counters count
 * in proportion to their target. Only habits scheduled that day count -- a
 * tick on a day off neither raises the day nor hides something skipped.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog} log
 * @returns {number}
 */
export function completionRatio(habits, log) {
  const scheduled = habits.filter((habit) => isScheduledOn(habit, log.date));
  if (scheduled.length === 0) return 0;

  const total = scheduled.reduce((sum, habit) => sum + fillRatio(habit, log.date, log.habits[habit.id]), 0);

  return total / scheduled.length;
}

/**
 * True when at least one habit scheduled that day was completed.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog} log
 * @returns {boolean}
 */
export function hasAnyCompletion(habits, log) {
  return habits.some((habit) => isScheduledOn(habit, log.date) && didAnything(habit, log.habits[habit.id]));
}

/**
 * Whether anything at all was done: a check ticked, a counter above zero.
 * Less than complete -- one glass of eight keeps a streak alive -- and the
 * test for a day off having something done on it.
 *
 * @param {import('../types.js').Habit} habit
 * @param {boolean | number | undefined} value
 * @returns {boolean}
 */
function didAnything(habit, value) {
  if (habit.type === 'check') return value === true;
  return typeof value === 'number' && value > 0;
}

/**
 * How far back a streak is counted (docs/spec.md: "the last 365 days"). Here
 * rather than in a card, because the home card and the Habits screen summary
 * both show the streak and must show the same one.
 */
export const STREAK_WINDOW_DAYS = 365;

/**
 * How far back the Habits screen's summary and history look (docs/spec.md:
 * "the last 30 days"). Exported for the same reason as the streak's window:
 * the screen and the question context's habit figures read one window, and
 * a figure named for thirty days must not outlive the screen's.
 */
export const HABITS_WINDOW_DAYS = 30;

/**
 * Consecutive days with at least one scheduled habit completed, counting
 * backwards.
 *
 * A day with nothing scheduled is skipped: a rest day neither breaks the
 * streak nor pads it. A day still in progress does not break it either:
 * today counts only if something was done, and otherwise the count simply
 * starts from yesterday. Breaking a streak at 00:01 because the day is young
 * would be punishing someone for waking up.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs oldest first, contiguous
 * @param {string} todayKey
 * @returns {number}
 */
export function streak(habits, logs, todayKey) {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const ordered = [...logs].map((log) => log.date).sort();
  let streakLength = 0;

  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const date = ordered[index];
    const log = byDate.get(date);
    // Nothing was asked of this day, so it says nothing either way.
    if (!habits.some((habit) => isScheduledOn(habit, date))) continue;
    const done = log !== undefined && hasAnyCompletion(habits, log);

    if (done) {
      streakLength += 1;
      continue;
    }
    // Today not yet done is not a break -- the day is not over.
    if (date === todayKey) continue;
    break;
  }

  return streakLength;
}

/**
 * The target a counter's day is measured against: the one its period had.
 * Zero for a check, and outside every period, where nothing is measured at
 * all. Exported so the home card counts against today's target with the
 * same lookup every number uses.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @returns {number}
 */
export function targetOn(habit, dayKey) {
  return periodOn(habit, dayKey)?.target ?? 0;
}

/**
 * Whether a habit's day is complete at a given value: a check ticked, or a
 * counter at or past that day's target.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @param {boolean | number | undefined} value
 * @returns {boolean}
 */
function isComplete(habit, dayKey, value) {
  if (habit.type === 'check') return value === true;
  const target = targetOn(habit, dayKey);
  return typeof value === 'number' && target > 0 && value >= target;
}

/**
 * Whether writing `nextValue` is the moment a habit's day becomes complete --
 * the one transition `habit.ticked` fires on. Not on untick (complete ->
 * not), not on a decrement that stays complete, and not on an intermediate
 * step that was never complete either side.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey the day written, whose target decides
 * @param {boolean | number | undefined} previousValue
 * @param {boolean | number} nextValue
 * @returns {boolean}
 */
export function justCompleted(habit, dayKey, previousValue, nextValue) {
  return !isComplete(habit, dayKey, previousValue) && isComplete(habit, dayKey, nextValue);
}

/**
 * The days a habit's rate rests on: recorded, and the habit scheduled on them.
 * The one statement of that rule, for the rate and for whoever needs to know
 * whether a rate rests on anything.
 *
 * @param {import('../types.js').Habit} habit
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {import('../types.js').DailyLog[]}
 */
function ratedLogs(habit, logs) {
  return logs.filter((log) => Object.keys(log.habits).length > 0 && isScheduledOn(habit, log.date));
}

/**
 * Completion rate per habit over a window, counting only days it was both
 * recorded and scheduled -- the gym at three out of three is 100%, not 43%.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs
 * @returns {Record<string, number>} habit id to 0..1
 */
export function ratesByHabit(habits, logs) {
  /** @type {Record<string, number>} */
  const rates = {};

  for (const habit of habits) {
    const eligible = ratedLogs(habit, logs);
    if (eligible.length === 0) {
      rates[habit.id] = 0;
      continue;
    }
    const total = eligible.reduce((sum, log) => sum + fillRatio(habit, log.date, log.habits[habit.id]), 0);
    rates[habit.id] = total / eligible.length;
  }

  return rates;
}

/**
 * How full a habit's day was, 0..1. A check is all or nothing; a counter is
 * its value over that day's target, capped -- ten glasses out of eight is a
 * full cell, not a cell and a quarter.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @param {boolean | number | undefined} value
 * @returns {number}
 */
function fillRatio(habit, dayKey, value) {
  if (habit.type === 'check') return value === true ? 1 : 0;
  const target = targetOn(habit, dayKey);
  if (target <= 0) return 0;
  return Math.min((typeof value === 'number' ? value : 0) / target, 1);
}

/**
 * The state of one heatmap cell. Exported because the history card recomputes
 * a single cell optimistically after a correction, and the shades it shows
 * must be the ones this module decides.
 *
 * `recorded` is a property of the *day*, not of the habit: a day on which
 * nothing at all was written is drawn as an outline, because forgetting to
 * record is not the same as doing nothing (docs/spec.md).
 *
 * A day off is its own state, and so is a day off with something done on
 * it: it happened, and it is not graded because it counts toward nothing.
 * Inactive and unrecorded come first, in that order -- a day the habit did
 * not exist is not a day off, and a forgotten day is forgotten either way.
 *
 * @param {import('../types.js').Habit} habit
 * @param {string} dayKey
 * @param {boolean | number | undefined} value
 * @param {boolean} recorded whether anything was recorded that day
 * @returns {'inactive' | 'unrecorded' | 'off' | 'off-done' | 'zero' | 'low' | 'mid' | 'high' | 'full'}
 */
export function heatCellState(habit, dayKey, value, recorded) {
  if (!isActiveOn(habit, dayKey)) return 'inactive';
  if (!recorded) return 'unrecorded';
  if (!isScheduledOn(habit, dayKey)) return didAnything(habit, value) ? 'off-done' : 'off';

  const ratio = fillRatio(habit, dayKey, value);
  if (ratio <= 0) return 'zero';
  if (ratio >= 1) return 'full';
  if (ratio <= 1 / 3) return 'low';
  if (ratio <= 2 / 3) return 'mid';
  return 'high';
}

/**
 * The history heatmap: one row per habit that was active on at least one day
 * of the window -- even if every one of them was a day off -- one cell per
 * day, plus the habit's rate over the window.
 *
 * An archived habit keeps its row -- archiving hides a habit from today, it
 * does not rewrite what was done. `archived` is derived from the window's
 * last day, which is the day the screen is looking at.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs the window, oldest first
 * `ratedDays` is how many days the rate rests on; with none the rate is 0 by
 * convention, not a measured 0%.
 *
 * @returns {{
 *   habit: import('../types.js').Habit,
 *   archived: boolean,
 *   rate: number,
 *   ratedDays: number,
 *   cells: {
 *     date: string,
 *     state: ReturnType<typeof heatCellState>,
 *     value: boolean | number,
 *     target: number | null,
 *   }[],
 * }[]}
 */
export function historyRows(habits, logs) {
  const rates = ratesByHabit(habits, logs);
  const lastDay = logs.length === 0 ? '' : logs[logs.length - 1].date;

  return habits
    .filter((habit) => logs.some((entry) => isActiveOn(habit, entry.date)))
    .map((habit) => ({
      habit,
      archived: !isActiveOn(habit, lastDay),
      rate: rates[habit.id],
      ratedDays: ratedLogs(habit, logs).length,
      cells: logs.map((entry) => {
        const value = /** @type {boolean | number | undefined} */ (entry.habits[habit.id]);
        return {
          date: entry.date,
          state: heatCellState(habit, entry.date, value, Object.keys(entry.habits).length > 0),
          // A correction starts from what is there, so an unrecorded day
          // offers a check to tick and a counter to raise from zero.
          value: habit.type === 'check' ? value === true : typeof value === 'number' ? value : 0,
          // The target that day was measured against, for the correction's
          // "n / target" -- a past day keeps its own (ADR 0029).
          target: periodOn(habit, entry.date)?.target ?? null,
        };
      }),
    }));
}

/**
 * The Habits screen's summary over a window: how complete the recorded days
 * were on average, how many were perfect, and how many of the window's days
 * were recorded at all.
 *
 * Unrecorded days are left out of the average rather than counted as zero --
 * forgetting to tick is not the same as doing nothing (docs/spec.md), and
 * averaging them in would make a quiet week look like a failed one. So is a
 * day no habit was scheduled on: a rest day is neither a zero nor a perfect
 * day, and archiving closes the period at today, so a habit ticked this
 * morning and archived this afternoon leaves a day with a value on it and
 * nothing left to measure -- calling that 0% would be archiving rewriting
 * the past. Both are still counted in `days`, which is what `recordedDays`
 * is read against. A perfect day is every habit scheduled that day complete.
 *
 * The current streak is not here: it is the home card's number, over the home
 * card's longer window, and computing a second one over thirty days would
 * give the same screen two answers to one question.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs the window, oldest first
 * @returns {{ completion: number, perfectDays: number, recordedDays: number, days: number }}
 */
export function windowSummary(habits, logs) {
  const recorded = logs.filter(
    (log) =>
      Object.keys(log.habits).length > 0 &&
      habits.some((habit) => isScheduledOn(habit, log.date))
  );
  const ratios = recorded.map((log) => completionRatio(habits, log));

  return {
    completion: ratios.length === 0 ? 0 : ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length,
    perfectDays: ratios.filter((ratio) => ratio >= 1).length,
    recordedDays: recorded.length,
    days: logs.length,
  };
}
