/**
 * The only module allowed to read process.env.
 *
 * Two reasons this is worth a file. First, environment access is a boundary,
 * and boundaries are where validation belongs: a bad timezone should fail
 * here, loudly, not silently produce dates in the wrong day. Second, when the
 * time comes to add a variable, there is one place to look.
 *
 * Server only. Importing it from a client component is a bug, and the guard
 * below turns that bug into an error instead of a leaked key.
 */

import { defaultModel, defaultTimezone } from '@/personalos.config.js';

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/config/env.js was imported from the browser. Environment values are ' +
      'server-side only; move the import into a route handler or a server component.'
  );
}

/**
 * @param {string} name
 * @param {string} fallback
 * @returns {string}
 */
function readString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? fallback : value.trim();
}

/**
 * @param {string} name
 * @returns {string | null}
 */
function readOptional(name) {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? null : value.trim();
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

/**
 * Resolved environment, validated once at import time.
 */
export const env = Object.freeze({
  /** Absolute or relative directory holding seed.json and the working copy. */
  dataDir: readString('DATA_DIR', 'data'),

  /** The zone that decides when "today" becomes "yesterday". */
  timezone: assertTimezone(readString('USER_TIMEZONE', defaultTimezone)),

  /** Absent on a fresh clone: the rule-based classifier covers for it. */
  anthropicApiKey: readOptional('ANTHROPIC_API_KEY'),

  /** Model names change, so this is a variable and not a constant in code. */
  anthropicModel: readString('ANTHROPIC_MODEL', defaultModel),

  /** Secret iCal address of the calendar. Treat it as a password. */
  calendarIcalUrl: readOptional('GOOGLE_CALENDAR_ICAL_URL'),

  /** Path to the spreadsheet export the finance card reads. */
  financeFilePath: readOptional('FINANCE_FILE_PATH'),
});

/**
 * True when the model can actually be called. Callers use this to choose the
 * model path or the rule-based fallback -- never to fail a capture.
 *
 * @returns {boolean}
 */
export function hasModelAccess() {
  return env.anthropicApiKey !== null;
}
