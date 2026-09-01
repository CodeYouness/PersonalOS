/**
 * Stable identifiers.
 *
 * Every record carries one, and the UI tracks a selection by id rather than by
 * position in a list. That is not a style preference: a capture can insert a
 * row at the top of a list while a detail panel is open, and a panel that
 * remembers "item number 3" would silently start editing somebody else.
 */

/**
 * @param {string} [prefix] short kind marker, e.g. "task", to make ids
 *   readable when you are looking at the raw data file with your own eyes.
 * @returns {string}
 */
export function createId(prefix) {
  const uuid = globalThis.crypto.randomUUID();
  return prefix ? prefix + '_' + uuid : uuid;
}
