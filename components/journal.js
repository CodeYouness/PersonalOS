import { journalAddress } from '@/lib/domain/addresses.js';

/**
 * What the Journal screen's components share: the address of a day, and the
 * draft kept in the browser while you write -- also the check-in's open
 * answer's, which is a journal entry (ADR 0037) kept under its own name.
 */

/**
 * The Journal screen on a day: `/journal?date=<day key>`.
 *
 * @param {string} dayKey
 * @returns {string}
 */
export function journalHref(dayKey) {
  return journalAddress(dayKey);
}

/**
 * Where a box's drafts are kept apart: the Journal's write box, or the
 * check-in's open answer, so text half-written in one never shows in the other.
 *
 * @typedef {'journal' | 'checkin'} DraftPlace
 */

/**
 * @param {string} dayKey
 * @param {DraftPlace} place
 */
function draftKey(dayKey, place) {
  return 'personalos.' + place + '.draft.' + dayKey;
}

/**
 * What was being typed for a day, or ''. A draft is UI state, not a record:
 * it lives in this browser only and never goes through the store. Storage a
 * browser blocks reads as no draft, never as a broken page.
 *
 * @param {string} dayKey
 * @param {DraftPlace} [place]
 * @returns {string}
 */
export function readDraft(dayKey, place = 'journal') {
  try {
    return window.localStorage.getItem(draftKey(dayKey, place)) ?? '';
  } catch {
    return '';
  }
}

/**
 * Keeps what is being typed for a day; an empty draft is forgotten. Storage
 * a browser blocks keeps nothing, silently: the box still works.
 *
 * @param {string} dayKey
 * @param {string} text
 * @param {DraftPlace} [place]
 */
export function writeDraft(dayKey, text, place = 'journal') {
  try {
    if (text === '') window.localStorage.removeItem(draftKey(dayKey, place));
    else window.localStorage.setItem(draftKey(dayKey, place), text);
  } catch {
    // Blocked storage: the draft lives only as long as the page.
  }
}
