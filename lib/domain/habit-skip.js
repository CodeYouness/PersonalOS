/**
 * A skip reason (ADR 0037): why a habit scheduled on a day was not kept that
 * day, from the closed list `HABIT_SKIP_REASONS`. It belongs to that habit on
 * that day, in the day's log under `skips`, and it is what tells "could not"
 * from "chose not to".
 *
 * The one implementation of "is this a reason", so the store's refusal and
 * the route that writes one agree.
 */

import { HABIT_SKIP_REASONS } from '../../personalos.config.js';

/**
 * @typedef {'forgotten' | 'too-heavy' | 'on-purpose' | 'paused'} HabitSkipReason
 */

/** Every reason, in the order the screens offer them. */
export const HABIT_SKIP_REASON_KEYS = /** @type {readonly HabitSkipReason[]} */ (
  Object.freeze(Object.keys(HABIT_SKIP_REASONS))
);

/**
 * The one reason that takes a day out of a habit's rate, and out of the
 * streak when every habit scheduled that day has it: the habit was set aside
 * on purpose for the day, which is not a miss.
 */
export const PAUSED = /** @type {const} */ ('paused');

/**
 * @param {unknown} value
 * @returns {value is HabitSkipReason} one of `HABIT_SKIP_REASONS`
 */
export function isHabitSkipReason(value) {
  return typeof value === 'string' && /** @type {readonly string[]} */ (HABIT_SKIP_REASON_KEYS).includes(value);
}
