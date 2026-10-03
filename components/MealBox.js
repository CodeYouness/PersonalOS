'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useState } from 'react';

import { captureBarReducer, INITIAL_STATE } from '@/components/captureBarReducer.js';
import { submitCapture } from '@/components/captureBarSubmit.js';

/** How long "Filed" or an error sits before returning to idle, as in the bar. */
const AUTO_DISMISS_MS = 4000;

/**
 * The Nutrition card's "Describe a meal" box: the capture bar with the
 * destination already chosen. What you type is a capture like any other --
 * its sentence kept and in the capture log -- filed as `nutrition` whatever
 * the classifier would have said, so a meal typed here is never a task.
 *
 * Same states and reducer as CaptureBar. On success the server-rendered card
 * is refreshed in place (`router.refresh()`), so the new meal and the totals
 * appear without a reload wiping anything typed meanwhile.
 */
export default function MealBox() {
  const router = useRouter();
  const [state, dispatch] = useReducer(captureBarReducer, INITIAL_STATE);
  const [draft, setDraft] = useState('');

  // Only the status line is dismissed -- never the draft (see CaptureBar).
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
    const action = await submitCapture(text, fetch, 'nutrition');
    dispatch(action);
    if (action.type === 'receiptReceived') {
      setDraft('');
      router.refresh();
    }
  }

  return (
    <form className="meal-box" data-state={state.status} onSubmit={handleSubmit}>
      <input
        className="input"
        aria-label="Describe a meal"
        placeholder="Describe a meal — chicken breast with rice and an apple"
        value={draft}
        disabled={state.status === 'processing'}
        onChange={(event) => setDraft(event.target.value)}
      />
      <p className="caption meal-box-status" aria-live="polite">
        {state.status === 'processing' && 'Filing…'}
        {state.status === 'done' && 'Filed “' + state.text + '”'}
        {state.status === 'error' && (
          <span className="receipt-error">The meal did not land: {state.error}</span>
        )}
      </p>
    </form>
  );
}
