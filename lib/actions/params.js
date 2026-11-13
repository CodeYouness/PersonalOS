/**
 * What every action's `parse` shares: the answer's two shapes, and the check
 * that params are an object holding only the fields the action takes. The
 * rules about a field's value are not here -- each definition reuses the
 * domain's own (`isDayReading`, `isTimeMinutes`, ...), so the store's
 * refusal and an action's never disagree.
 */

/**
 * @typedef {{ ok: true, params: Record<string, unknown> } | { ok: false, error: string }} ParseResult
 */

/**
 * @param {Record<string, unknown>} params
 * @returns {ParseResult}
 */
export function accepted(params) {
  return { ok: true, params };
}

/**
 * @param {string} error
 * @returns {ParseResult}
 */
export function rejected(error) {
  return { ok: false, error };
}

/**
 * Params as an object holding every required field and nothing it does not
 * take -- what a schema with `additionalProperties: false` says, so a model
 * that sends a field the action ignores is told rather than half-obeyed.
 *
 * @param {unknown} raw
 * @param {readonly string[]} required
 * @param {readonly string[]} [optional]
 * @returns {{ fields: Record<string, unknown>, error: null } | { fields: null, error: string }}
 */
export function fieldsOf(raw, required, optional = []) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { fields: null, error: 'params must be an object, received ' + JSON.stringify(raw ?? null) };
  }
  const fields = /** @type {Record<string, unknown>} */ (raw);
  const unknown = Object.keys(fields).find((key) => !required.includes(key) && !optional.includes(key));
  if (unknown !== undefined) return { fields: null, error: 'unknown field ' + JSON.stringify(unknown) };
  const missing = required.find((key) => fields[key] === undefined);
  if (missing !== undefined) return { fields: null, error: missing + ' is required' };
  return { fields, error: null };
}

/**
 * Text a person said or wrote: a string with something in it, trimmed --
 * the store's own rule for a title or an entry's text.
 *
 * @param {unknown} value
 * @returns {value is string}
 */
export function isText(value) {
  return typeof value === 'string' && value.trim() !== '';
}
