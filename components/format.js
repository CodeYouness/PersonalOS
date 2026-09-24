/**
 * Small display-formatting helpers shared across components. Not domain
 * logic -- lib/domain/ stays plain-Node-importable, and initials are a
 * rendering concern, not a rule about what a name means.
 */

import { STREAK_WINDOW_DAYS } from '@/lib/domain/derive/habits.js';

/** @param {string} name */
export function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** @param {string} isoInstant */
export function formatTime(isoInstant) {
  return new Date(isoInstant).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/**
 * A day key has no time and no zone (lib/domain/dates.js), so it is parsed
 * as UTC midnight purely to hand a Date to Intl -- this is formatting, not a
 * second "what day is it" computation.
 *
 * @param {string} dayKey
 * @returns {Date}
 */
export function dayKeyToUtcDate(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * A streak as it is shown. The count can only ever look back over the window
 * the logs were read for, so at the window's edge it says "365+" rather than
 * claiming a number it cannot know.
 *
 * @param {number} days
 * @returns {string}
 */
export function streakLabel(days) {
  return days >= STREAK_WINDOW_DAYS ? STREAK_WINDOW_DAYS + '+' : String(days);
}

/**
 * A task's age on a board ticket: "0d", "3d". Long form in `ageTitle`.
 *
 * @param {number} days
 */
export function ageLabel(days) {
  return days + 'd';
}

/** @param {number} days */
export function ageTitle(days) {
  if (days === 0) return 'Created today';
  return 'Created ' + days + (days === 1 ? ' day' : ' days') + ' ago';
}

/**
 * A 0..1 ratio as whole percent. One implementation, so the habits ring and
 * a history row's rate can never round the same number differently.
 *
 * @param {number} ratio
 * @returns {string}
 */
export function percent(ratio) {
  return Math.round(ratio * 100) + '%';
}
