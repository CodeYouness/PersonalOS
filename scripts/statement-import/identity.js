/**
 * The stable id of a statement movement (ADR 0041): what makes importing the
 * same export twice, or a later one that overlaps it, write nothing twice.
 *
 *   externalId = <account id> ":" <key>
 *   key        = "id:" <the bank's id>                  when the file has one
 *              | sha256(when, amount, text, occurrence) otherwise, 24 hex
 *   a fee      = <the movement's externalId> ":fee"
 *
 * - `when` is the timestamp the bank gives, or the day when it gives only a
 *   day; `amount` the signed amount in minor units, before any fee; `text`
 *   the bank's own raw text for the row (a format says which columns).
 * - `occurrence` counts otherwise identical rows of one account -- the same
 *   when, amount and text -- in the order they appear: two identical coffees
 *   on one day are two movements, and stay two on every re-import, in any
 *   order, since identical rows cannot be told apart anyway.
 * - The account is the prefix, by id rather than name, so renaming the
 *   account changes nothing and two accounts never share a movement.
 *
 * What it cannot do: a bank that rewrites a past row's text or amount makes a
 * new movement beside the old one. The report counts the imported movements
 * in the file's range that the file no longer has, so that shows.
 */

import { createHash } from 'node:crypto';

const HASH_CHARS = 24;
const SEPARATOR = '\u001f';

/** The key a fee movement adds to the movement it was charged on. */
export const FEE_KEY_SUFFIX = ':fee';

/**
 * The key of each row, in the rows' order, and a problem for each bank id
 * seen twice. The rows are one account's.
 *
 * @param {import('./formats/common.js').StatementRow[]} rows
 * @returns {{ keys: string[], problems: import('./formats/common.js').Problem[] }}
 */
export function movementKeys(rows) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  /** @type {Map<string, number>} */
  const bankIds = new Map();
  /** @type {import('./formats/common.js').Problem[]} */
  const problems = [];
  const keys = rows.map((row) => {
    if (row.bankId !== null) {
      const first = bankIds.get(row.bankId);
      if (first !== undefined) problems.push({ line: row.line, reason: 'the bank id "' + row.bankId + '" is also on line ' + first });
      else bankIds.set(row.bankId, row.line);
      return 'id:' + row.bankId;
    }
    const content = [row.when, String(row.amount), row.identity].join(SEPARATOR);
    const occurrence = seen.get(content) ?? 0;
    seen.set(content, occurrence + 1);
    return createHash('sha256')
      .update(content + SEPARATOR + String(occurrence))
      .digest('hex')
      .slice(0, HASH_CHARS);
  });
  return { keys, problems };
}

/**
 * @param {string} accountId
 * @param {string} key
 * @returns {string}
 */
export function externalIdFor(accountId, key) {
  return accountId + ':' + key;
}
