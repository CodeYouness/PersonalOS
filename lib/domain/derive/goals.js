/**
 * Everything about a goal that is computed rather than stored.
 *
 * A goal never expires (docs/domain.md): nothing here closes, moves or
 * flags one. The calendar may only describe a goal -- how long past its
 * period it is, whether its target date has gone by -- and only on the way
 * to the screen (ADR 0021).
 */

import { GOAL_HORIZONS } from '../../../personalos.config.js';
import { dayKeyRange, weekDayKeys } from '../dates.js';

/**
 * @typedef {object} GoalRow
 * @property {import('../types.js').Goal} goal
 * @property {number | null} slipped the period it is in once past its first
 *   -- 2 for "2nd week" -- or null
 * @property {boolean} targetPassed its target date is before today
 */

/**
 * @typedef {object} GoalGroup
 * @property {import('../types.js').Goal['horizon']} horizon
 * @property {GoalRow[]} rows
 */

/**
 * The calendar period an open goal is in, counted from `horizonSetOn`: null
 * in the first one, 2 in the next, and so on. Weeks run Monday to Sunday,
 * so a week goal set on Sunday is in its 2nd week on Monday -- "this week"
 * was over. An `open` goal has no period and never slips.
 *
 * @param {import('../types.js').Goal} goal
 * @param {string} todayKey
 * @returns {number | null}
 */
export function slippedPeriod(goal, todayKey) {
  let passed = 0;
  if (goal.horizon === 'week') {
    const setMonday = weekDayKeys(goal.horizonSetOn)[0];
    const todayMonday = weekDayKeys(todayKey)[0];
    if (setMonday < todayMonday) passed = (dayKeyRange(setMonday, todayMonday).length - 1) / 7;
  } else if (goal.horizon === 'month') {
    passed = monthIndex(todayKey) - monthIndex(goal.horizonSetOn);
  }
  return passed > 0 ? passed + 1 : null;
}

/**
 * What the Goals card and screen render: the open goals grouped by horizon
 * (week, month, open; an empty group left out), each group by target date
 * with undated goals after, ties oldest first; and the done goals, the most
 * recently touched first.
 *
 * @param {import('../types.js').Goal[]} goals
 * @param {string} todayKey
 * @returns {{ groups: GoalGroup[], done: import('../types.js').Goal[] }}
 */
export function goalBoard(goals, todayKey) {
  const open = goals.filter((goal) => !goal.done).sort(byTargetDate);
  const groups = GOAL_HORIZONS.map((horizon) => ({
    horizon: /** @type {GoalGroup['horizon']} */ (horizon),
    rows: open
      .filter((goal) => goal.horizon === horizon)
      .map((goal) => ({
        goal,
        slipped: slippedPeriod(goal, todayKey),
        targetPassed: goal.targetDate !== null && goal.targetDate < todayKey,
      })),
  })).filter((group) => group.rows.length > 0);

  const done = goals
    .filter((goal) => goal.done)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));

  return { groups, done };
}

/**
 * @param {import('../types.js').Goal} a
 * @param {import('../types.js').Goal} b
 */
function byTargetDate(a, b) {
  // '~' sorts after every digit, so an undated goal follows the dated ones.
  const dateA = a.targetDate ?? '~';
  const dateB = b.targetDate ?? '~';
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

/** @param {string} dayKey */
function monthIndex(dayKey) {
  return Number(dayKey.slice(0, 4)) * 12 + Number(dayKey.slice(5, 7));
}
