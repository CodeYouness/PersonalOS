import { CheckinReceipt } from '@/components/CheckinReceipt.js';

/**
 * A day's notes in the check-in (ADR 0037): each open answer kept, in its
 * words, and under it what the small model filed from it -- a habit ticked,
 * an expense, a task -- each line with its Undo, since nothing else shows
 * them. Then, once, what was drawn from the last note and not filed. In the
 * sheet a note can be taken back whole, with what was filed from it. Pure.
 *
 * @param {{
 *   notes: readonly import('@/lib/checkin/day.js').CheckinNote[],
 *   problems: readonly import('@/lib/actions/registry.js').ReceiptLine[],
 *   lineErrors: Readonly<Record<string, string>>,
 *   pending: string | null,
 *   removable: boolean,
 *   onUndo: (actionId: string) => void,
 * }} props `problems` the last note's lines not filed; `removable` whether
 *   each note offers Remove
 */
export function CheckinNotes({ notes, problems, lineErrors, pending, removable, onUndo }) {
  if (notes.length === 0 && problems.length === 0) return null;
  return (
    <div className="checkin-notes">
      {notes.map((note) => {
        const refused = lineErrors[note.actionId];
        return (
          <figure key={note.actionId} className="checkin-note">
            <blockquote className="checkin-note-text">{note.text}</blockquote>
            {removable && note.undoable && (
              <button
                type="button"
                className="btn-ghost checkin-note-remove"
                aria-label="Remove this note and what was filed from it"
                disabled={pending !== null}
                onClick={() => onUndo(note.actionId)}
              >
                Remove
              </button>
            )}
            {refused !== undefined && (
              <p className="caption is-error" role="status">
                {refused}
              </p>
            )}
            {note.filed.length > 0 && <CheckinReceipt lines={note.filed} errors={lineErrors} pending={pending} onUndo={onUndo} />}
          </figure>
        );
      })}
      {problems.length > 0 && <CheckinReceipt title="Not filed from your note" lines={problems} errors={lineErrors} pending={pending} onUndo={onUndo} />}
    </div>
  );
}
