/**
 * The formats a screen and an answer's figure both write a number with.
 *
 * One implementation per format (CODING_STANDARDS.md), here because lib/ runs
 * under plain Node and cannot import a component: components/format.js
 * re-exports these, so a screen and the question context (#174, ADR 0028)
 * round, sign and group the same number the same way -- the number in an
 * answer is the number on the screen. Change a format here and both change.
 *
 * Money is not here: a screen shows whole euros, the model is given the
 * currency and the cents (lib/ai/context/render.js), on purpose.
 */

import { STREAK_WINDOW_DAYS } from './derive/habits.js';

/** The real minus a negative is written with. */
export const MINUS = '−';

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
 * A count as it is shown: "1,780". One fixed locale, so the server's render
 * and the browser's never disagree about a separator.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatCount(value) {
  return value.toLocaleString('en-GB');
}

/**
 * A weight as a scale shows it: always one decimal, "75.0" -- so a column of
 * weights lines up.
 *
 * @param {number} kg
 * @returns {string}
 */
export function formatWeight(kg) {
  return kg.toLocaleString('en-GB', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/**
 * A change as it is shown: "+0.4", "−1.2", "0" -- signed, with a real minus.
 *
 * @param {number} value
 * @returns {string}
 */
export function formatChange(value) {
  return value.toLocaleString('en-GB', { signDisplay: 'exceptZero' }).replace('-', MINUS);
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

const ORDINAL_RULES = new Intl.PluralRules('en-GB', { type: 'ordinal' });
/** @type {Record<string, string>} */
const ORDINAL_SUFFIX = { one: 'st', two: 'nd', few: 'rd', other: 'th' };

/**
 * A count as an English ordinal: "2nd", "11th", "21st".
 *
 * @param {number} count
 * @returns {string}
 */
export function ordinal(count) {
  return count + ORDINAL_SUFFIX[ORDINAL_RULES.select(count)];
}

/**
 * A ratio as whole percent, a negative one with a real minus. One
 * implementation, so the habits ring, a history row's rate and a savings
 * rate can never round the same number differently.
 *
 * @param {number} ratio
 * @returns {string}
 */
export function percent(ratio) {
  const whole = Math.round(ratio * 100);
  return (whole < 0 ? MINUS : '') + Math.abs(whole) + '%';
}

/**
 * A change as a whole percent: "+25%", "−8%", "0%" -- or "n.d." when there
 * was nothing to compare with, so a new expense never reads as +∞%.
 *
 * @param {number | null} ratio
 * @returns {string}
 */
export function formatPercentChange(ratio) {
  if (ratio === null) return 'n.d.';
  const whole = Math.round(ratio * 100);
  if (whole === 0) return '0%';
  return (whole < 0 ? MINUS : '+') + Math.abs(whole) + '%';
}

/**
 * A month as a heading names it: "January 2026".
 *
 * @param {string} month YYYY-MM
 * @returns {string}
 */
export function monthLabel(month) {
  return dayKeyToUtcDate(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
