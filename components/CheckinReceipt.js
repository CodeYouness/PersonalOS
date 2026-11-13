/**
 * The day's check-in receipt (ADR 0037, docs/domain.md "Receipt"): one line
 * per thing filed, in the order it was made, newest last. A done line that
 * can still be undone offers Undo, named after the line; an undone one is
 * struck through; a rejected or failed one says why. Pure: the lines, which
 * undo is running and why one was refused come in as props.
 *
 * A rejected line's text already carries its reason ("Not done: ..."), so
 * the reason is not said twice.
 *
 * @param {{
 *   lines: readonly import('@/lib/actions/registry.js').ReceiptLine[],
 *   errors: Readonly<Record<string, string>>,
 *   pending: string | null,
 *   onUndo: (actionId: string) => void,
 * }} props `errors` why an undo was refused, by action id; `pending` the
 *   panel's running request, `undo:<actionId>` for an undo
 */
export function CheckinReceipt({ lines, errors, pending, onUndo }) {
  return (
    <section className="checkin-receipt" aria-label="What the check-in filed today">
      <span className="eyebrow">Filed today</span>
      <ol className="checkin-lines">
        {lines.map((line, index) => {
          const actionId = line.actionId;
          const refused = actionId === null ? undefined : errors[actionId];
          return (
            <li key={actionId ?? 'unkept-' + index} className={'checkin-receipt-line is-' + line.status}>
              <span className="checkin-receipt-text">{line.status === 'undone' ? <s>{line.text}</s> : line.text}</span>
              {line.status === 'undone' && <span className="caption">Undone</span>}
              {line.status === 'done' && line.undoable && actionId !== null && (
                <button
                  type="button"
                  className="btn-ghost"
                  aria-label={'Undo ' + line.text}
                  disabled={pending !== null}
                  onClick={() => onUndo(actionId)}
                >
                  Undo
                </button>
              )}
              {line.error !== null && !line.text.includes(line.error) && (
                <span className="caption is-error" role="status">
                  {line.error}
                </span>
              )}
              {refused !== undefined && (
                <span className="caption is-error" role="status">
                  {refused}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
