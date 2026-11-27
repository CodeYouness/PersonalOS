/**
 * `journal.add`: a journal entry on the day, word for word, through
 * `writeJournalEntry` (rule 7: the original is kept). Undo deletes the entry
 * -- refused once it was corrected or a memory was drawn from it, since
 * deleting it would take that memory with it (ADR 0027).
 */

import { deleteJournalEntry, getJournalEntry, getMemoriesDrawnFrom, writeJournalEntry, writeJournalEntryOnce } from '../../store.js';
import { accepted, fieldsOf, isText, rejected } from '../params.js';

/** @type {import('../registry.js').ActionDefinition} */
export const journalAdd = {
  name: 'journal.add',
  risk: 'reversible',
  modelCallable: true,
  schema: {
    type: 'object',
    description: 'Add a journal entry for the day, in the words that were said.',
    properties: { text: { type: 'string', minLength: 1 } },
    required: ['text'],
    additionalProperties: false,
  },

  parse(raw) {
    const { fields, error } = fieldsOf(raw, ['text']);
    if (fields === null) return rejected(error);
    if (!isText(fields.text)) return rejected('text is required and must be a non-empty string');
    return accepted({ text: fields.text });
  },

  async run(params, ctx) {
    const text = /** @type {string} */ (params.text);
    // A channel that may deliver twice gives its own id for the sentence
    // (ADR 0033): the entry is then written once for that id.
    const entry = ctx.clientId === undefined
      ? await writeJournalEntry({ date: ctx.day, text })
      : (await writeJournalEntryOnce({ date: ctx.day, text, clientId: ctx.clientId })).entry;
    return { recordRef: entry.id, before: null };
  },

  async isLocked(record) {
    const entry = await getJournalEntry(/** @type {string} */ (record.recordRef));
    if (entry === null || entry.updatedAt !== entry.createdAt) return true;
    return (await getMemoriesDrawnFrom(entry.id)).length > 0;
  },

  async undo(record) {
    await deleteJournalEntry(/** @type {string} */ (record.recordRef));
  },

  line() {
    return 'Journal entry added';
  },
};
