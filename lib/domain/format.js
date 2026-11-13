/**
 * The formats a screen and an answer's figure both write a number with.
 *
 * One implementation per format (CODING_STANDARDS.md), here because lib/ runs
 * under plain Node and cannot import a component: components/format.js
 * re-exports these, so a screen and the question context (#174, ADR 0028)
 * round, sign and group the same number the same way -- the number in an
 * answer is the number on the screen. Change a format here and both change.
 *
 * Money as a screen shows it is here too, since a receipt line written in
 * lib/ (lib/actions/) shows an amount the way a table does. The model is
 * still given the currency and the cents in its own format
 * (lib/ai/context/render.js), on purpose.
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
 * A mean mood or energy as it is shown: one decimal, "3.5", on the Review
 * screen and in an answer alike.
 *
 * @param {number} mean
 * @returns {string}
 */
export function formatDayReading(mean) {
  return mean.toFixed(1);
}

/**
 * Time as it is shown: "1h 30m", "2h", "30m", "0m" -- hours and minutes, a
 * part that is zero left out, in the check-in, on the Review screen and in
 * an answer alike. Declared time is whole half hours (ADR 0037).
 *
 * @param {number} minutes
 * @returns {string}
 */
export function formatMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return rest + 'm';
  return rest === 0 ? hours + 'h' : hours + 'h ' + rest + 'm';
}

/**
 * An amount of money as a table shows it: whole euros, "12,400", or with the
 * cents when asked, "84,320.55". Money is an integer in minor units (ADR
 * 0009), so the euros and cents are split with integer arithmetic and only
 * the grouping is left to Intl -- no float ever holds the amount. Whole
 * euros round half away from zero; a negative amount gets a real minus.
 *
 * @param {number} minor
 * @param {{ cents?: boolean }} [options]
 * @returns {string}
 */
export function formatMoney(minor, { cents = false } = {}) {
  const sign = minor < 0 ? MINUS : '';
  const magnitude = Math.abs(minor);
  if (!cents) return sign + formatCount(Math.floor((magnitude + 50) / 100));
  const fraction = String(magnitude % 100).padStart(2, '0');
  return sign + formatCount(Math.floor(magnitude / 100)) + '.' + fraction;
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

/**
 * What a capture receipt says it did: `Filed "<sentence>"`, then what the
 * receipt adds (the weight filed, or that none was). The capture bar renders
 * this after its badges; the capture route sends it in `receiptLine` (#228).
 *
 * @param {string} text the sentence that was filed
 * @param {string} [note]
 * @returns {string}
 */
export function formatReceiptWhat(text, note) {
  return 'Filed “' + text + '”' + (note ? ' · ' + note : '');
}

/**
 * The whole receipt as one line, for a client with no badges to render:
 * the destination, then {@link formatReceiptWhat}.
 *
 * @param {string} destination
 * @param {string} text
 * @param {string} [note]
 * @returns {string}
 */
export function formatReceiptLine(destination, text, note) {
  return destination + ' · ' + formatReceiptWhat(text, note);
}

/** The weekdays' names, Monday first -- ISO weekday `n` is index `n - 1`. */
export const WEEKDAY_NAMES = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

/** The same, as the weekday picker and the manage list show them: "Mon". */
export const WEEKDAY_SHORT = Object.freeze(WEEKDAY_NAMES.map((name) => name.slice(0, 3)));

/**
 * A habit's days as the manage list shows them: "Every day", or the short
 * names Monday first -- "Mon Wed Fri".
 *
 * @param {number[]} days ISO weekdays, ascending
 * @returns {string}
 */
export function daysLabel(days) {
  if (days.length === 7) return 'Every day';
  return days.map((day) => WEEKDAY_SHORT[day - 1]).join(' ');
}
