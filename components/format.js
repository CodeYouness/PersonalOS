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
