/**
 * The context as the model sees it: ONE JSON string, and the size budget is
 * measured on that string (#175, ADR 0028). The block the answer module sends
 * and the length the budget compares are the same call, so what is measured
 * cannot drift from what is sent.
 *
 * What the model is shown is a list written out here, not whatever the
 * context object happens to hold: each item is copied field by field, so
 * where an item opens (`opens`, the screen's business) never reaches it, and
 * the context's own bookkeeping (`tooLarge`) is never part of the measure.
 */

/**
 * @param {import('./index.js').QuestionContext} context
 * @returns {string} exactly what goes between the `<context>` tags
 */
export function serializeContext(context) {
  const seen = {
    today: context.today,
    week: context.week,
    timezone: context.timezone,
    trackedSince: context.trackedSince,
    // Null when nothing was summarised: the model reads it, so say it either way.
    summarised: context.summarised,
    items: context.items.map(({ id, type, label, content, labels }) => ({ id, type, label, content, labels })),
  };
  // `<` is escaped so no record can close the block early and have the rest
  // read as something else. It is counted in the budget: it is sent.
  return JSON.stringify(seen).replace(/</g, '\\u003c');
}
