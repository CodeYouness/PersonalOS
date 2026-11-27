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
    // Only on a context that is part of the archive (ADR 0070): a whole one
    // is sent exactly as it always was.
    ...(context.read ? { read: context.read } : {}),
    items: context.items.map(({ id, type, label, content, labels }) => ({ id, type, label, content, labels })),
  };
  // `<` is escaped so no record can close the block early and have the rest
  // read as something else. It is counted in the budget: it is sent.
  return JSON.stringify(seen).replace(/</g, '\\u003c');
}

/**
 * What the model is told, beside the block, when the block is part of the
 * archive (ADR 0070). Here because it is sent, so the budget counts it.
 */
export const READ_NOTE =
  'Only part of the user\'s data is in the block: the parts named in "read.parts" (of: life, money, categories, ' +
  'transactions, investments) and, of anything that belongs to a month, the months from "read.months.from" to ' +
  '"read.months.to". Everything else was not read: it is unknown, never absent and never zero. If the answer ' +
  'needs something that was not read, answer with notInData.';
