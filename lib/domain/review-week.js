/**
 * Which week the Review screen shows (#239), from `?week=` and today.
 *
 * Pure and plain Node: the page passes the raw query value and today in
 * USER_TIMEZONE (rule 4) and gets back the week and its neighbours.
 */

import { isDayKey, shiftDayKey, weekDayKeys, weekdayOf } from './dates.js';

/**
 * @typedef {object} ReviewWeek
 * @property {string} from the week's Monday
 * @property {string} previous the Monday before; there is always one
 * @property {string | null} next the Monday after; null when this week contains today
 * @property {boolean} isCurrent this week contains today (it is in progress)
 */

/**
 * `?week=<monday>` when it is a Monday and not after the week containing
 * today; otherwise the default: the week containing today on a Sunday, the
 * week before on any other day. A malformed, non-Monday or future value falls
 * back to the default rather than erroring.
 *
 * @param {unknown} param the raw query value
 * @param {string} today day key
 * @returns {ReviewWeek}
 */
export function resolveReviewWeek(param, today) {
  const thisMonday = weekDayKeys(today)[0];
  const asked = typeof param === 'string' && isDayKey(param) && weekdayOf(param) === 1 && param <= thisMonday ? param : null;
  const from = asked ?? (weekdayOf(today) === 7 ? thisMonday : shiftDayKey(thisMonday, -7));
  return {
    from,
    previous: shiftDayKey(from, -7),
    next: from >= thisMonday ? null : shiftDayKey(from, 7),
    isCurrent: from === thisMonday,
  };
}
