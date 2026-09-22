/**
 * Everything about the Calendar card that is computed rather than stored.
 */

/**
 * The ordered schedule for one day: earliest start time first.
 *
 * @param {import('../types.js').Appointment[]} appointments
 * @param {string} dayKey
 * @returns {import('../types.js').Appointment[]}
 */
export function dayAgenda(appointments, dayKey) {
  return appointments
    .filter((appointment) => appointment.date === dayKey)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
}

/**
 * How many appointments fall on each day of a week, capped at 3 -- the week
 * strip shows density, not a precise count.
 *
 * @param {import('../types.js').Appointment[]} appointments
 * @param {string[]} week the 7 day keys of the week, in order (see weekDayKeys in lib/domain/dates.js)
 * @returns {number[]} parallel to week
 */
export function weekDensity(appointments, week) {
  return week.map(
    (dayKey) => Math.min(3, appointments.filter((appointment) => appointment.date === dayKey).length)
  );
}
