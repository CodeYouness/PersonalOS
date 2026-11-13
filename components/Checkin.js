'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useState, useSyncExternalStore, useTransition } from 'react';

import { CheckinOpen, CheckinRows } from '@/components/CheckinQuestions.js';
import { CheckinReceipt } from '@/components/CheckinReceipt.js';
import { checkinReducer, initialCheckinState, progress, receiptLines, rowsToAsk } from '@/components/checkinReducer.js';
import { dayHeading } from '@/components/format.js';
import { readDraft, writeDraft } from '@/components/journal.js';
import { messageOf, request } from '@/components/request.js';
import { OPEN_QUESTION_ID } from '@/lib/domain/derive/checkin.js';

/**
 * @typedef {import('@/components/checkinReducer.js').CheckinState} CheckinState
 * @typedef {import('@/components/CheckinQuestions.js').RowSettings} RowSettings
 */

/**
 * The panel as drawn from its state: the head with the day and how far the
 * check-in is, the rows still to ask, the open question's box, and the day's
 * receipt once something is filed. Once every question but the open one is
 * answered the rows are gone and it reads "Done for today": the receipt and
 * the box are what is left. Pure, for the render test.
 *
 * @param {{
 *   day: string,
 *   state: CheckinState,
 *   openText: string,
 *   onAnswer: (questionId: string, value: unknown) => void,
 *   onToggleSkip: (questionId: string) => void,
 *   onCount: (questionId: string, value: number) => void,
 *   onTime: (area: string, minutes: number) => void,
 *   onType: (text: string) => void,
 *   onUndo: (actionId: string) => void,
 * } & RowSettings} props
 */
export function CheckinView({ day, state, openText, areas, step, max, scale, skipReasons, onAnswer, onToggleSkip, onCount, onTime, onType, onUndo }) {
  const { answered, total, done } = progress(state);
  const rows = rowsToAsk(state);
  const lines = receiptLines(state);
  const open = state.questions.find((question) => question.id === OPEN_QUESTION_ID);

  return (
    <article id="card-checkin" className={'card span-12 checkin' + (done ? ' is-done' : '')}>
      <div className="card-head">
        <div className="checkin-title">
          <span className="eyebrow">Check-in</span>
          <span className="caption">{dayHeading(day)}</span>
        </div>
        <span className="checkin-progress" role="status">
          {done ? 'Done for today' : answered + ' of ' + total + ' answered'}
        </span>
      </div>
      <div className="checkin-body">
        {rows.length > 0 && (
          <CheckinRows
            rows={rows}
            state={state}
            areas={areas}
            step={step}
            max={max}
            scale={scale}
            skipReasons={skipReasons}
            onAnswer={onAnswer}
            onToggleSkip={onToggleSkip}
            onCount={onCount}
            onTime={onTime}
          />
        )}
        {open !== undefined && (
          <CheckinOpen
            label={open.label}
            text={openText}
            busy={state.pending !== null}
            error={state.errors[OPEN_QUESTION_ID]}
            onType={onType}
            onSave={() => onAnswer(OPEN_QUESTION_ID, { text: openText })}
          />
        )}
        {lines.length > 0 && <CheckinReceipt lines={lines} errors={state.lineErrors} pending={state.pending} onUndo={onUndo} />}
      </div>
    </article>
  );
}

/**
 * The check-in panel on Home (ADR 0037). Rendered by CheckinPanel with the
 * day as the server read it; every answer POSTs one closed answer to
 * /api/checkin -- the time row's areas together, as one -- and the panel is
 * redrawn from what the server answered, then the page is re-read
 * (`router.refresh()`) so the Habits and Today cards follow. An undo POSTs to
 * /api/actions/[id]/undo and re-reads the day with GET /api/checkin, refused
 * or not. A request that fails says so in its row, and the page is re-read
 * all the same: a refused write may still have landed (CODING_STANDARDS,
 * Screens). One request at a time.
 *
 * When the page is re-read -- after an answer here, or a habit ticked on the
 * Habits card -- the new server state replaces the old (`loaded`), and what
 * is being typed stays. The open answer's text is also kept in this browser
 * for the day, as the Journal's write box keeps its draft, so a closed tab
 * never loses it.
 *
 * @param {{
 *   day: string,
 *   questions: import('@/lib/domain/derive/checkin.js').Question[],
 *   done: boolean,
 *   lines: import('@/lib/actions/registry.js').ReceiptLine[],
 *   values: Record<string, boolean | number>,
 * } & RowSettings} props
 */
export default function Checkin({ day, questions, done, lines, values, areas, step, max, scale, skipReasons }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, dispatch] = useReducer(checkinReducer, { questions, done, lines, values }, initialCheckinState);

  // The page re-read gives new props: they are the server's state, so they
  // replace the panel's, during render, as React adjusts state to props.
  const snapshot = JSON.stringify([questions, done, lines, values]);
  const [seen, setSeen] = useState(snapshot);
  if (seen !== snapshot) {
    setSeen(snapshot);
    dispatch({ type: 'loaded', questions, done, lines, values });
  }

  // The kept draft is read once hydrated -- the server has none, so the
  // first render is the empty box.
  const stored = useSyncExternalStore(subscribeToNothing, () => readDraft(day, 'checkin'), () => '');
  const openText = state.openText ?? stored;
  useEffect(() => {
    if (state.openText !== null) writeDraft(day, state.openText, 'checkin');
  }, [day, state.openText]);

  function reread() {
    startTransition(() => router.refresh());
  }

  /**
   * @param {string} questionId
   * @param {unknown} value
   */
  async function answer(questionId, value) {
    if (state.pending !== null) return;
    dispatch({ type: 'submit', questionId });
    try {
      const response = await request('/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day, answers: [{ questionId, value }] }),
      });
      dispatch({ type: 'answered', questionId, response });
    } catch (caught) {
      dispatch({ type: 'failed', questionId, error: messageOf(caught) });
    }
    reread();
  }

  /** @param {string} actionId */
  async function undo(actionId) {
    if (state.pending !== null) return;
    dispatch({ type: 'undoStart', actionId });
    /** @type {string | null} */
    let error = null;
    try {
      await request('/api/actions/' + encodeURIComponent(actionId) + '/undo', { method: 'POST' });
    } catch (caught) {
      error = messageOf(caught);
    }
    /** @type {import('@/components/checkinReducer.js').CheckinServerState | null} */
    let server = null;
    try {
      const read = await request('/api/checkin?day=' + day, { method: 'GET' });
      server = { questions: read.questions, done: read.done, lines: read.receipt.lines };
    } catch (caught) {
      error ??= 'Undone, but the check-in could not be read again: ' + messageOf(caught);
    }
    dispatch({ type: 'undoSettled', actionId, error, server });
    reread();
  }

  return (
    <CheckinView
      day={day}
      state={state}
      openText={openText}
      areas={areas}
      step={step}
      max={max}
      scale={scale}
      skipReasons={skipReasons}
      onAnswer={answer}
      onToggleSkip={(questionId) => dispatch({ type: 'toggleSkip', questionId })}
      onCount={(questionId, value) => dispatch({ type: 'count', questionId, value })}
      onTime={(area, minutes) => dispatch({ type: 'time', area, minutes })}
      onType={(text) => dispatch({ type: 'type', text })}
      onUndo={undo}
    />
  );
}

/**
 * The draft is read once per mount; another tab's typing is not followed.
 *
 * @returns {() => void}
 */
function subscribeToNothing() {
  return () => {};
}
