/**
 * What the Journal screen's components share: the address of a day, and the
 * draft kept in the browser while you write.
 */

/**
 * The Journal screen on a day: `/journal?date=<day key>`.
 *
 * @param {string} dayKey
 * @returns {string}
 */
export function journalHref(dayKey) {
  return '/journal?date=' + dayKey;
}

/** @param {string} dayKey */
function draftKey(dayKey) {
  return 'personalos.journal.draft.' + dayKey;
}

/**
 * What was being typed for a day, or ''. A draft is UI state, not a record:
 * it lives in this browser only and never goes through the store. Storage a
 * browser blocks reads as no draft, never as a broken page.
 *
 * @param {string} dayKey
 * @returns {string}
 */
export function readDraft(dayKey) {
  try {
    return window.localStorage.getItem(draftKey(dayKey)) ?? '';
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
 */
export function writeDraft(dayKey, text) {
  try {
    if (text === '') window.localStorage.removeItem(draftKey(dayKey));
    else window.localStorage.setItem(draftKey(dayKey), text);
  } catch {
    // Blocked storage: the draft lives only as long as the page.
  }
}
