/**
 * "Is it due" for a schedule (ADR 0062). Derived, never stored: from the
 * schedule's rule, the start of its last run, and now. There is no next-run
 * time anywhere in the data.
 *
 * A *slot* is one moment a schedule is meant to run: its time of day, on a
 * day its `days` allow, in the user's timezone. A schedule is due when its
 * latest slot that has passed is later than its last run. A machine that
 * slept across several slots owes one run, not one per slot; `same-day`
 * drops a slot once its day is over.
 *
 * Any run counts as the last run -- ok, failed or skipped, by whoever
 * started it -- so a failing job is tried once per slot, not once a minute.
 */

import { instantAt, shiftDayKey, toDayKey, weekdayOf } from '../dates.js';

/**
 * @typedef {object} Slot
 * @property {string} day day key the slot belongs to, in the timezone
 * @property {Date} at the instant
 */

/** A schedule looks this many days back (or ahead) for a slot. */
const WINDOW_DAYS = 7;

/**
 * The latest slot at or before `now`, or null when none in the last week.
 *
 * @param {import('../types.js').Schedule} schedule
 * @param {Date} now
 * @param {string} [timezone]
 * @returns {Slot | null}
 */
export function latestSlot(schedule, now, timezone) {
  const todayKey = toDayKey(now, timezone);
  for (let back = 0; back <= WINDOW_DAYS; back += 1) {
    const day = shiftDayKey(todayKey, -back);
    if (!schedule.days.includes(weekdayOf(day))) continue;
    const at = instantAt(day, schedule.time, timezone);
    if (at.getTime() <= now.getTime()) return { day, at };
  }
  return null;
}

/**
 * The slot a run is owed for, or null when nothing is due.
 *
 * @param {import('../types.js').Schedule} schedule
 * @param {string | null} lastRunAt ISO start of the schedule's last run
 * @param {Date} now
 * @param {string} [timezone]
 * @returns {Slot | null}
 */
export function dueSlot(schedule, lastRunAt, now, timezone) {
  const slot = latestSlot(schedule, now, timezone);
  if (slot === null) return null;
  if (lastRunAt !== null && new Date(lastRunAt).getTime() >= slot.at.getTime()) return null;
  if (schedule.catchUp === 'same-day' && slot.day !== toDayKey(now, timezone)) return null;
  return slot;
}

/**
 * The first slot after `now`. For a page that says when a schedule next runs.
 *
 * @param {import('../types.js').Schedule} schedule
 * @param {Date} now
 * @param {string} [timezone]
 * @returns {Date}
 */
export function nextSlot(schedule, now, timezone) {
  const todayKey = toDayKey(now, timezone);
  for (let ahead = 0; ahead <= WINDOW_DAYS; ahead += 1) {
    const day = shiftDayKey(todayKey, ahead);
    if (!schedule.days.includes(weekdayOf(day))) continue;
    const at = instantAt(day, schedule.time, timezone);
    if (at.getTime() > now.getTime()) return at;
  }
  throw new Error('schedule ' + schedule.id + ' has no day it runs on');
}
