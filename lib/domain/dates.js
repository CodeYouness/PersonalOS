/**
 * The single answer to "what day is it".
 *
 * Every date in PersonalOS is a day key: the string YYYY-MM-DD, resolved in
 * the user's timezone. Habit ticks, meals, daily logs and snapshots are all
 * filed under one, so if two places in the codebase computed "today"
 * differently, sooner or later they would disagree by a day and nothing would
 * report an error -- the streak would just break on a day you did not miss.
 *
 * That is why this module exists and why nothing else may call
 * `new Date().toISOString().slice(0, 10)`. The server clock is UTC; in Rome
 * its midnight arrives at 1am or 2am, while you are still awake.
 */

import { env } from '@/lib/config/env.js';

const DAY_KEY_SHAPE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The day key of an instant, as seen from a timezone.
 *
 * @param {Date} instant
 * @param {string} [timezone] IANA zone; defaults to the configured one.
 * @returns {string} YYYY-MM-DD
 */
export function toDayKey(instant, timezone = env.timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  /** @param {string} type */
  const part = (type) => {
    const found = parts.find((candidate) => candidate.type === type);
    if (!found) throw new Error('Intl did not return a ' + type + ' part');
    return found.value;
  };

  return part('year') + '-' + part('month') + '-' + part('day');
}

/**
 * Today, in the user's timezone. The function the rest of the app calls.
 *
 * @param {string} [timezone]
 * @returns {string} YYYY-MM-DD
 */
export function today(timezone = env.timezone) {
  return toDayKey(new Date(), timezone);
}

/**
 * True when the string is a real calendar day, not merely well shaped.
 * Rejects 2026-02-30 as well as "yesterday".
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isDayKey(value) {
  if (typeof value !== 'string' || !DAY_KEY_SHAPE.test(value)) return false;
  return toUtcMidnight(value) !== null;
}

/**
 * Calendar-day arithmetic, done in UTC on purpose: day keys have no time and
 * no zone, so shifting them must not be affected by a daylight saving change.
 *
 * @param {string} dayKey
 * @param {number} days may be negative
 * @returns {string} YYYY-MM-DD
 */
export function shiftDayKey(dayKey, days) {
  const midnight = requireDayKey(dayKey);
  return fromUtcMidnight(new Date(midnight.getTime() + days * MS_PER_DAY));
}

/**
 * The `count` most recent day keys, oldest first, ending on `endDayKey`.
 * Used by every card that looks back over a window.
 *
 * @param {number} count
 * @param {string} endDayKey
 * @returns {string[]}
 */
export function dayKeysEndingAt(count, endDayKey) {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('count must be a positive integer, received ' + String(count));
  }
  requireDayKey(endDayKey);
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    keys.push(shiftDayKey(endDayKey, -offset));
  }
  return keys;
}

/**
 * Every day key from `from` to `to` inclusive, oldest first.
 *
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
export function dayKeyRange(from, to) {
  const start = requireDayKey(from);
  const end = requireDayKey(to);
  if (start.getTime() > end.getTime()) {
    throw new Error('range start ' + from + ' is after end ' + to);
  }
  const keys = [];
  for (let time = start.getTime(); time <= end.getTime(); time += MS_PER_DAY) {
    keys.push(fromUtcMidnight(new Date(time)));
  }
  return keys;
}

/**
 * @param {string} dayKey
 * @returns {Date}
 */
function requireDayKey(dayKey) {
  const midnight = toUtcMidnight(dayKey);
  if (midnight === null) {
    throw new Error('not a valid day key: ' + JSON.stringify(dayKey));
  }
  return midnight;
}

/**
 * @param {string} dayKey
 * @returns {Date | null} null when the string is not a real calendar day
 */
function toUtcMidnight(dayKey) {
  if (typeof dayKey !== 'string' || !DAY_KEY_SHAPE.test(dayKey)) return null;
  const [year, month, day] = dayKey.split('-').map(Number);
  const midnight = new Date(Date.UTC(year, month - 1, day));
  return fromUtcMidnight(midnight) === dayKey ? midnight : null;
}

/**
 * @param {Date} midnight
 * @returns {string}
 */
function fromUtcMidnight(midnight) {
  return midnight.toISOString().slice(0, 10);
}
