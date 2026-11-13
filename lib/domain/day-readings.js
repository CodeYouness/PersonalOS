/**
 * A day's two readings, mood and energy (ADR 0037): each a whole number on
 * one scale, or null when not given, and independent of the other. They are
 * fields of the daily log (ADR 0035), given by tap and never read off the
 * journal by a model.
 *
 * The one implementation of "is this a value a reading can hold", so the
 * store's refusal and the route that writes both at once agree.
 */

import { limits } from '../../personalos.config.js';

/** @typedef {'mood' | 'energy'} DayReading */

/** The readings of a day, in the order they are asked and shown. */
export const DAY_READINGS = /** @type {readonly DayReading[]} */ (Object.freeze(['mood', 'energy']));

/** Every value on the scale, lowest first: the taps a reading offers. */
export const DAY_READING_SCALE = Object.freeze(
  Array.from({ length: limits.dayReadingMax - limits.dayReadingMin + 1 }, (_, index) => limits.dayReadingMin + index)
);

/**
 * @param {unknown} value
 * @returns {value is number | null} a whole number on the scale, or null
 *   (unset)
 */
export function isDayReading(value) {
  return (
    value === null ||
    (typeof value === 'number' && Number.isInteger(value) && value >= limits.dayReadingMin && value <= limits.dayReadingMax)
  );
}
