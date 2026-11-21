/**
 * The message of anything that was thrown: an Error's own, or the value as
 * text. The one place that says so.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
