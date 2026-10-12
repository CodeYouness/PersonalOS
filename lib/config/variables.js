/**
 * How a set of environment variables is read: trimmed, an empty value
 * counted as unset. It reads only the set it is given and runs nothing on
 * import -- lib/config/env.js hands it this process's own and validates the
 * result; scripts/dev-sandbox.js hands it the variables `next dev` will
 * see, without starting that validation in the parent process.
 */

import { defaultModel, defaultTimezone } from '../../personalos.config.js';

/** @typedef {Record<string, string | undefined>} Variables */

/**
 * @param {Variables} variables
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
export function readString(variables, name, fallback) {
  const value = variables[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/**
 * @param {Variables} variables
 * @param {string} name
 * @returns {string | null}
 */
export function readOptional(variables, name) {
  const value = variables[name];
  return value === undefined || value.trim() === '' ? null : value.trim();
}

/**
 * Which model the variables point at, and the key to call it with. No key
 * means no model: the rule-based classifier covers for it.
 *
 * @param {Variables} variables
 * @returns {{ anthropicApiKey: string | null, anthropicModel: string }}
 */
export function readModelSettings(variables) {
  return {
    anthropicApiKey: readOptional(variables, 'ANTHROPIC_API_KEY'),
    // Model names change, so this is a variable and not a constant in code.
    anthropicModel: readString(variables, 'ANTHROPIC_MODEL', defaultModel),
  };
}

/**
 * The zone that decides when "today" becomes "yesterday", validated: read the
 * same way by lib/config/env.js and by the sandbox, which moves the demo
 * history to end on the server's yesterday.
 *
 * @param {Variables} variables
 * @returns {string}
 */
export function readTimezone(variables) {
  return assertTimezone(readString(variables, 'USER_TIMEZONE', defaultTimezone));
}

/**
 * Rejects a timezone the platform cannot resolve. Without this check an
 * unknown zone falls back to the server's own -- which on a serverless host
 * is UTC, and that is exactly the failure this project must not have.
 *
 * @param {string} timezone
 * @returns {string}
 */
function assertTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new Error(
      'USER_TIMEZONE is not a valid IANA timezone: ' +
        JSON.stringify(timezone) +
        '. Use something like "Europe/Rome".'
    );
  }
}
