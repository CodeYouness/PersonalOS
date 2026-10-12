/**
 * What a citation chip does, decided without a DOM so it is testable.
 *
 * Where a citation opens was decided by the context from the record (#173),
 * never by the model; the panel only follows it. A record with a screen is a
 * link; one without expands in place and shows its content.
 */

/**
 * @typedef {{ kind: 'link', href: string } | { kind: 'expand', detail: string }} CitationTarget
 */

/**
 * @param {import('./captureBarReducer.js').CitationChip} citation
 * @returns {CitationTarget}
 */
export function citationTarget(citation) {
  // A missing `opens` is read as null -- expand in place -- not as an error.
  // So is anything that is not a site-relative address: the panel never
  // navigates off the site, whatever a response says.
  if (isSiteAddress(citation.opens)) return { kind: 'link', href: citation.opens };
  return { kind: 'expand', detail: citation.content ?? citation.label };
}

/**
 * Key of one chip's expanded state: statement index and citation id, so the
 * same record cited by two statements expands independently.
 *
 * @param {number} statementIndex
 * @param {string} citationId
 * @returns {string}
 */
export function citationKey(statementIndex, citationId) {
  return statementIndex + ':' + citationId;
}

/**
 * The id of one expanded detail, so its chip can point at it (`aria-controls`).
 * `panelId` keeps two panels' ids apart; the rest is the same key as the
 * expanded state.
 *
 * @param {string} panelId
 * @param {number} statementIndex
 * @param {string} citationId
 * @returns {string}
 */
export function citationDetailId(panelId, statementIndex, citationId) {
  return panelId + '-cite-' + citationKey(statementIndex, citationId);
}

/** Any origin will do: the check is that an address resolves to the same one. */
const SITE_BASE = 'http://site.invalid';

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isSiteAddress(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false;
  // The URL parser Next's Link and the browser both use reads a backslash as
  // a slash and drops tabs and newlines, so '/\\evil.example' and
  // '/<tab>/evil.example' look site-relative here and are not there. Addresses
  // the context builds are encoded and contain neither, so refuse them
  // outright, then check the parser agrees the address stays on this site.
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    return new URL(value, SITE_BASE).origin === SITE_BASE;
  } catch {
    return false;
  }
}

