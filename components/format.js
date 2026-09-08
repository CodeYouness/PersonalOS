/**
 * Small display-formatting helpers shared across components. Not domain
 * logic -- lib/domain/ stays plain-Node-importable, and initials are a
 * rendering concern, not a rule about what a name means.
 */

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
