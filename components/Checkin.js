'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState, useSyncExternalStore, useTransition } from 'react';

import { CheckinNotes } from '@/components/CheckinNotes.js';
import { NoteBox, QuestionCard } from '@/components/CheckinQuestions.js';
import { CheckinSheet } from '@/components/CheckinSheet.js';
import { CheckinSummary } from '@/components/CheckinSummary.js';
import { DayProgress, WeekStrip, YesterdayBanner } from '@/components/CheckinWeek.js';
import { checkinReducer, currentQuestion, initialCheckinState, progress, todayOf, yesterdayOpen } from '@/components/checkinReducer.js';
import { dayName, headline } from '@/components/checkinWords.js';
import { dayHeading } from '@/components/format.js';
import { readDraft, writeDraft } from '@/components/journal.js';
import { messageOf, request } from '@/components/request.js';
import { OPEN_QUESTION_ID } from '@/lib/domain/derive/checkin.js';

/**
 * @typedef {import('@/components/checkinReducer.js').CheckinState} CheckinState
 * @typedef {import('@/components/checkinReducer.js').CheckinServerState} CheckinServerState
 * @typedef {import('@/components/CheckinQuestions.js').CheckinSettings} CheckinSettings
 */

/**
 * The panel as drawn from its state. At the top, the strip of the last
 * seven days, the day's headline -- "Today · 4 left", "Friday is filled" --
 * and its progress, one segment per question; under them, when today is
 * shown and yesterday is not filled, the banner that offers it. Then one of
 * three: the sheet of every answer when it is open; the card asking the
 * question shown while the day has questions left, with a way to the sheet;
 * or, once the day is filled, how it went, its notes, the box for another
 * and "Edit answers". Pure, for the render test.
 *
 * @param {{
 *   state: CheckinState,
 *   openText: string,
 *   switching: boolean,
 *   onPick: (day: string) => void,
 *   onAnswer: (questionId: string, value: unknown) => void,
 *   onCount: (questionId: string, value: number) => void,
 *   onTime: (area: string, minutes: number) => void,
 *   onType: (text: string) => void,
 *   onUndo: (actionId: string) => void,
 *   onBack: () => void,
 *   onNext: () => void,
 *   onOpenSheet: () => void,
 *   onCloseSheet: () => void,
 * } & CheckinSettings} props `switching` while another day is being opened
 */
export function CheckinView(props) {
  const { state, openText, switching, areas, step, max, scale, skipReasons } = props;
  const { onPick, onAnswer, onCount, onTime, onType, onUndo, onBack, onNext, onOpenSheet, onCloseSheet } = props;
  const today = todayOf(state);
  const busy = state.pending !== null || switching;
  const counted = progress(state);
  const shown = state.sheet ? null : currentQuestion(state);
  const yesterday = yesterdayOpen(state);
  const name = dayName(state.day, today);
  const settings = { areas, step, max, scale, skipReasons };

  return (
    <article id="card-checkin" className={'card span-12 checkin' + (state.done ? ' is-done' : '')} aria-busy={busy}>
      <div className="checkin-inner">
        <div className="card-head">
          <span className="eyebrow">Check-in</span>
          <span className="caption">{dayHeading(state.day)}</span>
        </div>
        <WeekStrip week={state.week} day={state.day} today={today} disabled={busy} onPick={onPick} />
        <h2 id="checkin-headline" className="title checkin-headline" aria-live="polite" tabIndex={-1}>
          {headline(state.day, today, counted)}
        </h2>
        <DayProgress questions={state.questions} shown={shown?.id ?? null} />
        {yesterday !== null && <YesterdayBanner yesterday={yesterday} today={today} disabled={busy} onPick={onPick} />}

        {state.sheet ? (
          <CheckinSheet
            state={state}
            name={name}
            openText={openText}
            {...settings}
            onAnswer={onAnswer}
            onCount={onCount}
            onTime={onTime}
            onType={onType}
            onUndo={onUndo}
            onClose={onCloseSheet}
          />
        ) : shown !== null ? (
          <>
            <QuestionCard question={shown} state={state} today={today} {...settings} onAnswer={onAnswer} onCount={onCount} onTime={onTime} onBack={onBack} onNext={onNext} />
            <p className="checkin-more">
              <button type="button" className="link-btn" disabled={busy} onClick={onOpenSheet}>
                See and change every answer
              </button>
            </p>
          </>
        ) : (
          <CheckinSummary state={state} name={name} areas={areas} scale={scale} skipReasons={skipReasons}>
            <CheckinNotes notes={state.notes} problems={state.noteProblems} lineErrors={state.lineErrors} pending={state.pending} removable={false} onUndo={onUndo} />
            <NoteBox
              label={state.notes.length === 0 ? 'Anything worth noting?' : 'Anything else worth noting?'}
              text={openText}
              busy={busy}
              error={state.errors[OPEN_QUESTION_ID]}
              filled
              onType={onType}
              onSave={() => onAnswer(OPEN_QUESTION_ID, { text: openText })}
            />
            <div className="checkin-summary-foot">
              <button type="button" className="btn-ghost" disabled={busy} onClick={onOpenSheet}>
                Edit answers
              </button>
            </div>
          </CheckinSummary>
        )}
      </div>
    </article>
  );
}

/**
 * The check-in panel on Home (ADR 0037). Rendered by CheckinPanel with the
 * day the address names -- `?checkin=YYYY-MM-DD`, one of the last seven, else
 * today -- as the server read it. Picking a day in the strip changes the
 * address, so the server reads that day; nothing is fetched by hand and a
 * reload stays on it.
 *
 * Every answer POSTs one closed answer to /api/checkin for the day shown,
 * and the panel is redrawn from what the server answered, then the page is
 * re-read (`router.refresh()`) so the Habits and Today cards follow; the
 * next question's heading takes the focus. An undo POSTs to
 * /api/actions/[id]/undo and re-reads the day with GET /api/checkin, refused
 * or not. A request that fails says so where it was asked, and the page is
 * re-read all the same: a refused write may still have landed
 * (CODING_STANDARDS, Screens). One request at a time.
 *
 * When the page is re-read the new server state replaces the old (`loaded`),
 * and what is being typed stays. The note's text is also kept in this
 * browser for its day, as the Journal's write box keeps its draft, so a
 * closed tab never loses it.
 *
 * @param {{ server: CheckinServerState } & CheckinSettings} props
 */
export default function Checkin({ server, areas, step, max, scale, skipReasons }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [switching, startSwitch] = useTransition();
  const [state, dispatch] = useReducer(checkinReducer, server, initialCheckinState);

  // The page re-read gives new props: they are the server's state, so they
  // replace the panel's, during render, as React adjusts state to props.
  const { day, questions, done, answers, notes, week } = server;
  const snapshot = JSON.stringify([day, questions, done, answers, notes, week]);
  const [seen, setSeen] = useState(snapshot);
  if (seen !== snapshot) {
    setSeen(snapshot);
    dispatch({ type: 'loaded', day, questions, done, answers, notes, week });
  }

  // The kept draft is read once hydrated -- the server has none, so the
  // first render is the empty box.
  const stored = useSyncExternalStore(subscribeToNothing, () => readDraft(state.day, 'checkin'), () => '');
  const openText = state.openText ?? stored;
  useEffect(() => {
    if (state.openText !== null) writeDraft(state.day, state.openText, 'checkin');
  }, [state.day, state.openText]);

  // After an answer lands the card has moved on: the focus goes to what it
  // asks now, or to the headline once the day is filled.
  const [landed, setLanded] = useState(0);
  const focused = useRef(0);
  useEffect(() => {
    if (landed === focused.current) return;
    focused.current = landed;
    const next = document.getElementById('checkin-question') ?? document.getElementById('checkin-headline');
    next?.focus();
  }, [landed]);

  // The sheet replaces the card or the summary, and the button that opened
  // or closed it is gone: the focus goes to what took its place.
  const sheetWas = useRef(state.sheet);
  useEffect(() => {
    if (sheetWas.current === state.sheet) return;
    sheetWas.current = state.sheet;
    const next = state.sheet ? document.getElementById('checkin-sheet-title') : document.getElementById('checkin-question') ?? document.getElementById('checkin-headline');
    next?.focus();
  }, [state.sheet]);

  function reread() {
    startRefresh(() => router.refresh());
  }

  /** @param {string} target */
  function pick(target) {
    if (state.pending !== null) return;
    const url = new URL(window.location.href);
    if (target === todayOf(state)) url.searchParams.delete('checkin');
    else url.searchParams.set('checkin', target);
    startSwitch(() => router.replace(url.pathname + url.search, { scroll: false }));
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
        body: JSON.stringify({ day: state.day, answers: [{ questionId, value }] }),
      });
      dispatch({ type: 'answered', questionId, response });
      if (!state.sheet && questionId !== OPEN_QUESTION_ID) setLanded((count) => count + 1);
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
    /** @type {CheckinServerState | null} */
    let read = null;
    try {
      read = await request('/api/checkin?day=' + state.day, { method: 'GET' });
    } catch (caught) {
      error ??= 'Undone, but the check-in could not be read again: ' + messageOf(caught);
    }
    dispatch({ type: 'undoSettled', actionId, error, server: read });
    reread();
  }

  return (
    <CheckinView
      state={state}
      openText={openText}
      switching={switching}
      areas={areas}
      step={step}
      max={max}
      scale={scale}
      skipReasons={skipReasons}
      onPick={pick}
      onAnswer={answer}
      onCount={(questionId, value) => dispatch({ type: 'count', questionId, value })}
      onTime={(area, minutes) => dispatch({ type: 'time', area, minutes })}
      onType={(text) => dispatch({ type: 'type', text })}
      onUndo={undo}
      onBack={() => dispatch({ type: 'back' })}
      onNext={() => dispatch({ type: 'next' })}
      onOpenSheet={() => dispatch({ type: 'openSheet' })}
      onCloseSheet={() => dispatch({ type: 'closeSheet' })}
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
