'use client';

import { useEffect, useReducer, useState } from 'react';

import { captureBarReducer, INITIAL_STATE } from '@/components/captureBarReducer.js';
import { submitCapture } from '@/components/captureBarSubmit.js';

/** How long a receipt or error sits before returning to idle on its own. */
const AUTO_DISMISS_MS = 4000;

/**
 * The persistent capture bar, ported from design/mockup.html's
 * `#capture-bar`. Text only this pass -- no mic, no `listening` state; the
 * mockup's `data-state` toggling is reused as-is for the states that remain.
 *
 * Mounted once in app/layout.js, not per screen, since the mockup places it
 * as a fixed element outside every `screen-*` section.
 */
export default function CaptureBar() {
  const [state, dispatch] = useReducer(captureBarReducer, INITIAL_STATE);
  const [draft, setDraft] = useState('');

  // Only dismisses the receipt/error banner. It must never touch `draft`:
  // the user may already be typing their next capture by the time this
  // fires, and wiping the input out from under them would be exactly the
  // silent data loss rule 2 exists to prevent.
  useEffect(() => {
    if (state.status !== 'done' && state.status !== 'error') return undefined;
    const timer = setTimeout(() => dispatch({ type: 'dismiss' }), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  /** @param {import('react').FormEvent<HTMLFormElement>} event */
  async function handleSubmit(event) {
    event.preventDefault();
    const text = draft.trim();
    if (text === '' || state.status === 'processing') return;

    dispatch({ type: 'submit', text });
    const action = await submitCapture(text);
    dispatch(action);
    // Cleared only on success, and only here -- on failure the text stays
    // so the user can fix and resend it, not retype it from memory.
    if (action.type === 'receiptReceived') setDraft('');
  }

  return (
    <div id="capture-bar" data-state={state.status}>
      <div className="receipt">
        {state.status === 'done' && state.receipt && (
          <div className="receipt-line">
            <span className="badge badge-ok">{state.receipt.destination}</span>
            <span className={'badge badge-route-' + state.receipt.route}>{state.receipt.route}</span>
            <span className="receipt-what">Filed &ldquo;{state.text}&rdquo;</span>
          </div>
        )}
        {state.status === 'error' && <p className="receipt-error">{state.error}</p>}
      </div>

      <form className="capture-shell" onSubmit={handleSubmit}>
        <input
          className="capture-input"
          placeholder="Say it once"
          value={draft}
          disabled={state.status === 'processing'}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="capture-status status-processing">
          <i className="spinner" />
          Filing
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
