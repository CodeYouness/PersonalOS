/**
 * The notes the answer panel prints about what the model was and was not
 * shown (#175), kept out of the component so they are testable without a DOM.
 */

import { shiftMonth } from '@/lib/domain/dates.js';
import { monthLabel } from '@/lib/domain/format.js';

/** The refusal when even the summarised context is over the budget. */
export const TOO_LARGE_TEXT = 'Too much data to ask over, even summarised. Nothing was sent.';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * What the route said was summarised, trusted only when it is the shape the
 * route sends. A response is untrusted until checked, and the note is built
 * from this, so anything else reads as "nothing summarised" rather than being
 * rendered.
 *
 * @param {unknown} value
 * @returns {import('./captureBarReducer.js').Summarised | null}
 */
export function readSummarised(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { since, before } = /** @type {{ since?: unknown, before?: unknown }} */ (value);
  if (typeof before !== 'string' || !MONTH_KEY.test(before)) return null;
  // A range that is empty or backwards is not one the route sends.
  if (typeof since === 'string' && MONTH_KEY.test(since) && since < before) return { since, before };
  return { before };
}

/**
 * @param {import('./captureBarReducer.js').Summarised | null | undefined} summarised
 * @returns {string | null}
 */
export function summarisedNote(summarised) {
  if (!summarised) return null;
  if (summarised.since !== undefined) {
    // Older months stayed whole, so "before" alone would claim too much.
    const last = shiftMonth(summarised.before, -1);
    if (last === summarised.since) return 'Transactions of ' + monthLabel(last) + ' were read as monthly totals.';
    return 'Transactions from ' + monthLabel(summarised.since) + ' to ' + monthLabel(last) + ' were read as monthly totals.';
  }
  return 'Transactions before ' + monthLabel(summarised.before) + ' were read as monthly totals.';
}
