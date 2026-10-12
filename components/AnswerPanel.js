'use client';

import Link from 'next/link';
import { useId, useState } from 'react';

import { summarisedNote, TOO_LARGE_TEXT } from './answerNotes.js';
import { citationBadgeText, citationBadgeTone, citationDetailId, citationKey, citationTarget } from './answerCitations.js';

/**
 * The answer panel above the capture bar, ported from design/mockup.html's
 * `.answer`. Presentational: the bar owns the state and says what to do on
 * close and retry.
 *
 * A citation is a chip -- the type and the label the system read off the
 * record itself, never the model's wording. One whose record has a screen is
 * a client-side link (the bar is mounted once in the layout, so the panel
 * stays open behind it); one without expands in place. Which is the context's
 * call, made from the record (#173), never the model's.
 *
 * @param {object} props
 * @param {import('./captureBarReducer.js').AnswerState} props.answer
 * @param {() => void} props.onClose
 * @param {() => void} props.onRetry resends the same question
 */
export default function AnswerPanel({ answer, onClose, onRetry }) {
  const statements = answer.statements ?? [];
  // Only an answer or a "not in your data" was asked of the model, so only
  // those can have read part of the archive as totals.
  const summarised = answer.outcome === 'answer' || answer.outcome === 'not-in-data' ? summarisedNote(answer.summarised) : null;
  const panelId = useId();
  // Local UI state, never stored. A new answer is a new panel state, so it
  // starts collapsed: `key` on the component would do, but the bar keeps one
  // panel mounted, so the state is dropped when the answer object changes.
  const [expandedFor, setExpandedFor] = useState(/** @type {typeof answer | null} */ (null));
  const [expanded, setExpanded] = useState(/** @type {Set<string>} */ (new Set()));
  if (expandedFor !== answer) {
    setExpandedFor(answer);
    setExpanded(new Set());
  }

  /** @param {string} key */
  function toggle(key) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  return (
    <div className="answer" data-outcome={answer.outcome} data-left-out={String(answer.leftOut === true)} data-summarised={String(summarised !== null)} role="region" aria-label="Answer">
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
                {statement.citations.map((citation) => {
                  const target = citationTarget(citation);
                  const chip = (
                    <>
                      <span className={'badge ' + citationBadgeTone(citation)}>{citationBadgeText(citation)}</span>
                      {citation.label}
                    </>
                  );
                  if (target.kind === 'link') {
                    return (
                      <Link className="cite" href={target.href} key={citation.id}>
                        {chip}
                      </Link>
                    );
                  }
                  const key = citationKey(index, citation.id);
                  const open = expanded.has(key);
                  return (
                    <button
                      type="button"
                      className="cite"
                      key={citation.id}
                      aria-expanded={open}
                      aria-controls={open ? citationDetailId(panelId, index, citation.id) : undefined}
                      onClick={() => toggle(key)}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
              {/* Under its statement, not inside the chip row: the detail is a
                  block of text and would break the row's wrap. */}
              {statement.citations.map((citation) => {
                const target = citationTarget(citation);
                if (target.kind !== 'expand' || !expanded.has(citationKey(index, citation.id))) return null;
                return (
                  <div className="cite-detail" id={citationDetailId(panelId, index, citation.id)} key={citation.id}>
                    {/* Said, since the content alone may not name its record
                        (a capture's sentence) and details stack in citation
                        order, not the order they were opened. */}
                    <strong className="cite-detail-label">{citation.label}</strong>
                    {target.detail}
                  </div>
                );
              })}
            </div>
          ))}
          {/* A statement the system would not stand behind is dropped, and the
              panel says so rather than letting the answer look complete. */}
          {answer.leftOut === true && (
            <p className="caption answer-note note-left-out">
              Something was left out: a statement cited nothing the system was shown.
            </p>
          )}
          {summarised && <p className="caption answer-note note-summarised">{summarised}</p>}
        </div>
      )}

      {answer.outcome === 'not-in-data' && (
        <div className="answer-outcome outcome-not-in-data">
          <p className="caption">Not in your data</p>
          {summarised && <p className="caption answer-note note-summarised">{summarised}</p>}
        </div>
      )}
      {answer.outcome === 'no-model' && <p className="caption answer-outcome outcome-no-model">No model configured</p>}
      {/* Not retryable: asking again sends the same data and is refused again. */}
      {answer.outcome === 'too-large' && <p className="caption answer-outcome outcome-too-large">{TOO_LARGE_TEXT}</p>}
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
