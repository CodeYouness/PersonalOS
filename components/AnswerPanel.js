/**
 * The answer panel above the capture bar, ported from design/mockup.html's
 * `.answer`. Presentational: the bar owns the state and says what to do on
 * close and retry.
 *
 * A citation is a chip -- the type and the label the system read off the
 * record itself, never the model's wording -- and not yet a link: where a
 * citation opens is #173.
 *
 * @param {object} props
 * @param {import('./captureBarReducer.js').AnswerState} props.answer
 * @param {() => void} props.onClose
 * @param {() => void} props.onRetry resends the same question
 */
export default function AnswerPanel({ answer, onClose, onRetry }) {
  const statements = answer.statements ?? [];

  return (
    <div className="answer" data-outcome={answer.outcome} data-left-out={String(answer.leftOut === true)} role="region" aria-label="Answer">
      <div className="answer-head">
        <span className="eyebrow">Answer</span>
        <button type="button" className="icon-btn" aria-label="Close the answer" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="answer-question">&ldquo;{answer.question}&rdquo;</p>

      {answer.outcome === 'answer' && (
        <div className="answer-outcome outcome-answer">
          {statements.map((statement, index) => (
            <div className="statement" key={index}>
              <p>{statement.text}</p>
              <div className="cites">
                {statement.citations.map((citation) => (
                  <span className="cite" key={citation.id}>
                    <span className={'badge ' + badgeTone(citation)}>{badgeText(citation)}</span>
                    {citation.label}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {/* A statement the system would not stand behind is dropped, and the
              panel says so rather than letting the answer look complete. */}
          <p className="caption answer-note note-left-out">
            Something was left out: a statement cited nothing the system was shown.
          </p>
        </div>
      )}

      {answer.outcome === 'not-in-data' && <p className="caption answer-outcome outcome-not-in-data">Not in your data</p>}
      {answer.outcome === 'no-model' && <p className="caption answer-outcome outcome-no-model">No model configured</p>}
      {answer.outcome === 'failed' && (
        <p className="caption answer-outcome outcome-failed">
          <span className="down">{answer.message ?? "The model didn't answer."}</span>{' '}
          {/* Not for a question the route refused: it would be refused again. */}
          {answer.retryable !== false && (
            <button type="button" className="link-btn" onClick={onRetry}>
              Try again
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/**
 * "Memory · expired": the type as the context named it, and how the record
 * stands when it is not simply current -- what the model was told to say.
 *
 * @param {import('./captureBarReducer.js').CitationChip} citation
 */
function badgeText(citation) {
  const type = citation.type.charAt(0).toUpperCase() + citation.type.slice(1);
  const labels = citation.labels ?? [];
  return labels.length === 0 ? type : type + ' \u00b7 ' + labels.join(', ');
}

/**
 * The mockup's tones: warm for a record that is past or unconfirmed -- not
 * what is true now -- cold for a person, plain for the rest.
 *
 * @param {import('./captureBarReducer.js').CitationChip} citation
 */
function badgeTone(citation) {
  const labels = citation.labels ?? [];
  if (labels.includes('expired') || labels.includes('unconfirmed')) return 'badge-warm';
  return citation.type === 'person' ? 'badge-cold' : 'badge-tag';
}
