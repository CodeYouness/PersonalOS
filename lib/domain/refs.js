/**
 * References between entities.
 *
 * An id carries its type as a prefix: `task_9f2c...`, `person_1a4e...`. That
 * one decision is what lets a reference be a plain string everywhere -- in a
 * link, in an event subject, in a memory's provenance -- instead of a
 * {type, id} pair that every caller has to assemble and every store has to
 * store as two columns.
 *
 * The cost is that a reference can be malformed, so it gets validated here,
 * at the boundary, rather than trusted.
 */

import { ENTITY_TYPES } from '../../personalos.config.js';

// Deliberately looser than a UUID: seed and demo data are written by hand
// ("task_seed_1"), and an id must stay readable when you open the data file
// with your own eyes.
const REF_SHAPE = /^([a-z]+)_([A-Za-z0-9][A-Za-z0-9_-]{0,63})$/;

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isRef(value) {
  return parseRef(value) !== null;
}

/**
 * Splits a reference into its type and its unique part, or returns null when
 * the string is not a reference to a known entity type.
 *
 * @param {unknown} value
 * @returns {{ type: string, key: string } | null}
 */
export function parseRef(value) {
  if (typeof value !== 'string') return null;
  const match = REF_SHAPE.exec(value);
  if (!match) return null;
  const [, type, key] = match;
  return ENTITY_TYPES.includes(type) ? { type, key } : null;
}

/**
 * The entity type a reference points at.
 *
 * @param {string} ref
 * @returns {string | null}
 */
export function refType(ref) {
  return parseRef(ref)?.type ?? null;
}

/**
 * Throws rather than letting a malformed reference into storage, where it
 * would become a link pointing at nothing.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
export function requireRef(value, field) {
  if (!isRef(value)) {
    throw new Error(
      field + ' must be a reference like "<type>_<key>", received ' + JSON.stringify(value)
    );
  }
  return /** @type {string} */ (value);
}

/**
 * Throws unless the reference points at one of the expected types. Used where
 * a relation only makes sense between particular kinds of thing.
 *
 * @param {unknown} value
 * @param {string} field
 * @param {readonly string[]} allowed
 * @returns {string}
 */
export function requireRefOfType(value, field, allowed) {
  const ref = requireRef(value, field);
  const type = /** @type {{ type: string }} */ (parseRef(ref)).type;
  if (!allowed.includes(type)) {
    throw new Error(
      field + ' must reference one of ' + allowed.join(', ') + ', received a ' + type
    );
  }
  return ref;
}
