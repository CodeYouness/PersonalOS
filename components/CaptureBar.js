'use client';

import { useEffect, useReducer, useRef, useState } from 'react';

import AnswerPanel from '@/components/AnswerPanel.js';
import { applyAskGesture, captureBarReducer, INITIAL_STATE } from '@/components/captureBarReducer.js';
import { questionProblem, submitCapture, submitQuestion } from '@/components/captureBarSubmit.js';

/** How long a receipt or error sits before returning to idle on its own. */
const AUTO_DISMISS_MS = 4000;

/**
 * The persistent capture bar, ported from design/mockup.html's
 * `#capture-bar`. Text only this pass -- no mic, no `listening` state; the
 * mockup's `data-state` toggling is reused as-is for the states that remain.
 *
 * Mounted once in app/layout.js, not per screen, since the mockup places it
 * as a fixed element outside every `screen-*` section. That is also why the
 * answer panel survives moving between screens: it is this component's
 * state, and this component is never unmounted.
 *
 * Capture or question is decided by the Ask toggle alone -- never by what
 * the sentence says -- and each goes to its own route, never both (#172).
 */
export default function CaptureBar() {
  const [state, dispatch] = useReducer(captureBarReducer, INITIAL_STATE);
  const [draft, setDraft] = useState('');
  const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const wasAsking = useRef(false);

  // Only dismisses the receipt/error banner. It must never touch `draft`:
  // the user may already be typing their next capture by the time this
  // fires, and wiping the input out from under them would be exactly the
  // silent data loss rule 2 exists to prevent.
  useEffect(() => {
    if (state.status !== 'done' && state.status !== 'error') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'dismiss' }), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  // The input is disabled while a question is in flight, which drops focus to
  // the page. When the answer lands, hand it back -- unless the user has
  // already moved on to something else of their own.
  useEffect(() => {
    const asking = state.status === 'asking';
    const settled = wasAsking.current && !asking;
    wasAsking.current = asking;
    if (!settled) return;
    const active = document.activeElement;
    if (active === null || active === document.body || active === inputRef.current) inputRef.current?.focus();
  }, [state.status]);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (text === '' || state.status === 'processing' || state.status === 'asking') return;

    if (state.mode === 'ask') {
      // Too long to send: say so and keep the draft, in Ask mode, to shorten.
      const problem = questionProblem(text);
      if (problem !== null) {
        dispatch({ type: 'requestFailed', error: problem });
        return;
      }
      dispatch({ type: 'submitQuestion', question: text });
      // The question is the panel's now (a retry resends it from there), so
      // the draft goes the moment it is sent. The input is disabled while
      // asking, so nothing typed can be lost by clearing it.
      setDraft('');
      dispatch(await submitQuestion(text));
      return;
    }

    dispatch({ type: 'submit', text });
    const action = await submitCapture(text);
    dispatch(action);
    // Cleared only on success, and only here -- on failure the text stays
    // so the user can fix and resend it, not retype it from memory.
    if (action.type === 'receiptReceived') setDraft('');
  }

  /** The same question again, from the panel -- never from whatever is in the draft. */
  async function handleRetry() {
    const question = state.answer?.question;
    if (state.answer?.outcome !== 'failed' || state.answer.retryable === false || question === undefined) return;
    if (state.status === 'processing' || state.status === 'asking') return;

    dispatch({ type: 'retryQuestion' });
    dispatch(await submitQuestion(question));
  }

  /** @param {import('react').ChangeEvent<HTMLInputElement>} event */
  function handleChange(event) {
    // A leading "?" turns Ask on and is not part of the question.
    const next = applyAskGesture(state.mode, event.target.value);
    if (next.mode !== state.mode) dispatch({ type: 'enableAsk' });
    setDraft(next.draft);
  }

  return (
    <div id="capture-bar" data-state={state.status} data-mode={state.mode} data-answer={state.answer ? 'open' : 'closed'}>
      {/* A live region that is always there, so an answer, "Not in your data"
          or a failure arriving inside it is announced. */}
      <div aria-live="polite">
        {state.answer && (
          <AnswerPanel
            answer={state.answer}
            onClose={() => {
              dispatch({ type: 'closeAnswer' });
              // The close button goes with the panel: focus goes back to the bar.
              inputRef.current?.focus();
            }}
            onRetry={handleRetry}
          />
        )}
      </div>

      <div className="receipt">
        {state.status === 'done' && state.receipt && (
          <div className="receipt-line">
            <span className="badge badge-ok">{state.receipt.destination}</span>
            <span className={'badge badge-route-' + state.receipt.route}>{state.receipt.route}</span>
            <span className="receipt-what">
              Filed &ldquo;{state.text}&rdquo;{state.receipt.note && ' · ' + state.receipt.note}
            </span>
          </div>
        )}
        {state.status === 'error' && <p className="receipt-error">{state.error}</p>}
      </div>

      <form className="capture-shell" onSubmit={handleSubmit}>
        {/* Always present, with or without a model: a control does not come
            and go with a setting. No model is said by the answer. */}
        <button
          type="button"
          className="btn-ghost ask-toggle"
          aria-pressed={state.mode === 'ask'}
          disabled={state.status === 'asking'}
          onClick={() => dispatch({ type: 'toggleAsk' })}
        >
          Ask
        </button>
        <input
          ref={inputRef}
          className="capture-input"
          placeholder="Say it once — or ask a question"
          value={draft}
          disabled={state.status === 'processing' || state.status === 'asking'}
          onChange={handleChange}
        />
        <div className="capture-status status-processing">
          <i className="spinner" />
          Filing
        </div>
        <div className="capture-status status-asking">
          <i className="spinner" />
          Asking
        </div>
        <div className="capture-status status-done">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 6.3l2.7 2.7L10 3.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Filed
        </div>
      </form>
    </div>
  );
}
