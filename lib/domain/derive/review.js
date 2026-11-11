/**
 * What the last week's review means for this week (#241, spec #232).
 *
 * Nothing here is stored: whether a lever shows, and whether the link to last
 * week's review does, are read off the review of the week before and today.
 */

import { shiftDayKey, weekDayKeys } from '../dates.js';

/**
 * @typedef {object} LastWeekReview
 * @property {string} from the Monday of the week before today's week; the review the lever comes from
 * @property {string | null} lever this week's lever, or null when there is none
 * @property {boolean} pending last week's review is absent or unfinished
 */

/**
 * The lever of the completed review whose week is the one before today's.
 * Empty, absent, unfinished, or from any other week means no lever: a lever set
 * this Sunday shows on Monday, an unfinished review's never shows.
 *
 * @param {{ period?: string, from: string, lever: string, completedAt: string | null } | null | undefined} review
 *   the stored review for `lastWeekFrom(today)`, if any
 * @param {string} today day key
 * @returns {LastWeekReview}
 */
export function lastWeekReview(review, today) {
  const from = lastWeekFrom(today);
  if (!review || review.from !== from || !review.completedAt) return { from, lever: null, pending: true };
  return { from, lever: review.lever.trim() === '' ? null : review.lever, pending: false };
}

/**
 * The Monday of the week before the week containing `today`.
 *
 * @param {string} today day key
 */
export function lastWeekFrom(today) {
  return shiftDayKey(weekDayKeys(today)[0], -7);
}
