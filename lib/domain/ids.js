/**
 * Stable identifiers.
 *
 * Every record carries one, and the id carries its entity type as a prefix so
 * that a reference is self-describing -- see lib/domain/refs.js.
 *
 * The UI tracks a selection by id rather than by position in a list. That is
 * not a style preference: a capture can insert a row at the top of a list
 * while a detail panel is open, and a panel that remembers "item number 3"
 * would silently start editing somebody else.
 */

import { ENTITY_TYPES } from '../../personalos.config.js';

/**
 * @param {string} type one of ENTITY_TYPES; becomes the id's prefix
 * @returns {string}
 */
export function createId(type) {
  if (!ENTITY_TYPES.includes(type)) {
    throw new Error(
      'unknown entity type ' + JSON.stringify(type) + '. Add it to ENTITY_TYPES first.'
    );
  }
  return type + '_' + globalThis.crypto.randomUUID();
}
