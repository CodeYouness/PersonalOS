/**
 * A day's time, declared against areas (ADR 0037): `null` when the day was
 * not declared, otherwise minutes by area, where an area with no time has no
 * key and `{}` is "declared, nothing". Declared by you in half hours, never
 * measured from a screen or a calendar.
 *
 * The one implementation of "is this an area" and "is this a value an area
 * can hold", so the store's refusal and the route that writes several areas
 * at once agree.
 */

import { limits, TIME_AREAS } from '../../personalos.config.js';

/** Every area, in the order they are asked and shown. */
export const TIME_AREA_KEYS = /** @type {readonly string[]} */ (Object.freeze(Object.keys(TIME_AREAS)));

/**
 * @param {unknown} value
 * @returns {value is string} one of `TIME_AREAS`
 */
export function isTimeArea(value) {
  return typeof value === 'string' && TIME_AREA_KEYS.includes(value);
}

/**
 * @param {unknown} value
 * @returns {value is number} whole minutes on the step, from 0 (the area's
 *   time removed) to the most one area can take in a day
 */
export function isTimeMinutes(value) {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= limits.timeAreaMaxMinutes &&
    value % limits.timeStepMinutes === 0
  );
}

/**
 * An area's label as the screens show it, or the key itself for an area
 * that is no longer one -- a record kept from before it went (ADR 0039).
 *
 * @param {string} area
 * @returns {string}
 */
export function timeAreaLabel(area) {
  return Object.hasOwn(TIME_AREAS, area) ? TIME_AREAS[area] : area.charAt(0).toUpperCase() + area.slice(1);
}

/**
 * Why a habit counted from a time area is not ticked by hand (ADR 0039): the
 * one sentence the store's refusal, the action's and the screens say.
 *
 * @param {{ label: string, countedFrom: string }} habit
 * @returns {string}
 */
export function countedFromRefusal(habit) {
  return (
    habit.label + ' is counted from ' + timeAreaLabel(habit.countedFrom) +
    " time, not ticked: declare the day's " + timeAreaLabel(habit.countedFrom) + ' time instead'
  );
}
