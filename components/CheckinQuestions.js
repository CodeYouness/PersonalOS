import { questionText, whenSaid } from '@/components/checkinWords.js';
import { canGoBack, canGoOn, closedQuestions, counterValue, savedCount, timeChanges, timeShown } from '@/components/checkinReducer.js';
import { RatingButtons } from '@/components/DayRating.js';
import { TimeSteppers } from '@/components/DayTime.js';
import { formatMinutes } from '@/components/format.js';
import ProseBox from '@/components/ProseBox.js';
import { dayTimeTotal } from '@/lib/domain/derive/time.js';

/**
 * The check-in's questions, one at a time (ADR 0037): the card that asks the
 * question shown, the pieces the sheet of every answer reuses -- a habit's
 * reasons, a counter's stepper -- and the note's box. Pure: what each shows
 * comes from the panel's state, and every tap goes back through a handler as
 * the closed shape lib/checkin/closed.js takes, so nothing here decides what
 * is filed. Every button says what it answers, so a screen reader hears
 * "Read: Too heavy", not "Too heavy"; nothing hangs on a key, so it works
 * the same on a phone.
 *
 * @typedef {import('@/lib/domain/derive/checkin.js').Question} Question
 * @typedef {import('@/components/checkinReducer.js').CheckinState} CheckinState
 *
 * @typedef {object} CheckinSettings
 * @property {readonly { key: string, label: string }[]} areas
 * @property {number} step
 * @property {number} max
 * @property {readonly number[]} scale
 * @property {readonly { key: string, label: string }[]} skipReasons
 *
 * @typedef {object} AnswerHandlers
 * @property {(questionId: string, value: unknown) => void} onAnswer
 * @property {(questionId: string, value: number) => void} onCount
 * @property {(area: string, minutes: number) => void} onTime
 */

/** What the two readings are called, where a tap group needs a name. */
export const READING_NAMES = Object.freeze({ mood: 'Mood', energy: 'Energy' });

/**
 * Why a question's last answer did not land, said once where it was asked.
 *
 * @param {{ error: string | undefined }} props
 */
export function AnswerError({ error }) {
  if (error === undefined) return null;
  return (
    <p className="caption is-error" role="status">
      {error}
    </p>
  );
}

/**
 * A habit's skip reasons, each its own button. The one the day holds is
 * chosen; picking another answers again. Off for a counter already at its
 * target -- a reason is never beside a habit kept; the count comes down first.
 *
 * @param {{
 *   question: Question,
 *   chosen: string | null,
 *   disabled: boolean,
 *   skipReasons: CheckinSettings['skipReasons'],
 *   onAnswer: AnswerHandlers['onAnswer'],
 * }} props
 */
export function ReasonChips({ question, chosen, disabled, skipReasons, onAnswer }) {
  return (
    <div className="checkin-chips" role="group" aria-label={'Why ' + question.label + ' was not done'}>
      {skipReasons.map((reason) => (
        <button
          key={reason.key}
          type="button"
          className={'btn-ghost checkin-chip' + (chosen === reason.key ? ' is-chosen' : '')}
          aria-label={question.label + ': ' + reason.label}
          aria-pressed={chosen === reason.key}
          disabled={disabled}
          onClick={() => {
            if (chosen !== reason.key) onAnswer(question.id, { skip: reason.key });
          }}
        >
          {reason.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A counter's − / + stepper, from nothing to its target that day.
 *
 * @param {{ question: Question, count: number, disabled: boolean, onCount: AnswerHandlers['onCount'] }} props
 */
export function CounterStepper({ question, count, disabled, onCount }) {
  const { id, label, target } = question;
  const atTarget = typeof target === 'number' && target > 0 && count >= target;
  return (
    <span className="checkin-stepper">
      <button type="button" className="time-step-btn" aria-label={'Fewer: ' + label} disabled={disabled || count === 0} onClick={() => onCount(id, count - 1)}>
        &minus;
      </button>
      <span className="checkin-count num" aria-live="polite">
        {count}
        {typeof target === 'number' && target > 0 ? <> / {target}</> : null}
      </span>
      <button type="button" className="time-step-btn" aria-label={'More: ' + label} disabled={disabled || atTarget} onClick={() => onCount(id, count + 1)}>
        +
      </button>
    </span>
  );
}

/**
 * Whether a counter's count reaches its target: the day kept.
 *
 * @param {Question} question
 * @param {number} count
 * @returns {boolean}
 */
export function countKeeps(question, count) {
  return typeof question.target === 'number' && question.target > 0 && count >= question.target;
}

/**
 * The body of a habit's card. A check: one Yes, the view's filled button,
 * and the reasons for a no. A counter: its stepper and Save, then the reasons.
 *
 * @param {{ question: Question, state: CheckinState, busy: boolean, when: string, skipReasons: CheckinSettings['skipReasons'] } & AnswerHandlers} props
 */
function HabitBody({ question, state, busy, when, skipReasons, onAnswer, onCount }) {
  const habitId = question.subjectId ?? '';
  const chosen = state.answers.skips[habitId] ?? null;
  if (question.habitType === 'counter') {
    const count = counterValue(state, question);
    const moved = count !== savedCount(state, question);
    return (
      <>
        <p className="checkin-sub">How many {when}?</p>
        <div className="checkin-actions">
          <CounterStepper question={question} count={count} disabled={busy} onCount={onCount} />
          <button type="button" className="btn-primary" aria-label={'Save ' + question.label} disabled={busy || !moved} onClick={() => onAnswer(question.id, { value: count })}>
            Save
          </button>
        </div>
        <p className="caption">Not done? Say why:</p>
        <ReasonChips question={question} chosen={chosen} disabled={busy || countKeeps(question, count)} skipReasons={skipReasons} onAnswer={onAnswer} />
      </>
    );
  }
  const kept = state.answers.habits[habitId] === true;
  return (
    <>
      <p className="checkin-sub">Done {when}?</p>
      <button
        type="button"
        className="btn-primary checkin-yes"
        aria-label={'Yes: ' + question.label}
        aria-pressed={kept}
        disabled={busy}
        onClick={() => {
          if (!kept) onAnswer(question.id, { done: true });
        }}
      >
        Yes
      </button>
      <p className="caption">No, because…</p>
      <ReasonChips question={question} chosen={chosen} disabled={busy} skipReasons={skipReasons} onAnswer={onAnswer} />
    </>
  );
}

/**
 * The body of the time card: a stepper per area in half hours, each saying
 * which habits its time counts as (ADR 0039), then "Nothing to declare" on
 * a day not declared, and Save.
 *
 * @param {{ question: Question, state: CheckinState, busy: boolean, filled: boolean } & Pick<CheckinSettings, 'areas' | 'step' | 'max'> & Pick<AnswerHandlers, 'onAnswer' | 'onTime'>} props
 *   `filled` whether Save is the view's filled button
 */
export function TimeBody({ question, state, busy, filled, areas, step, max, onAnswer, onTime }) {
  const shown = timeShown(state);
  const changes = timeChanges(state);
  const total = dayTimeTotal({ time: shown }) ?? 0;
  const changed = Object.keys(changes).length > 0;
  /** @type {Record<string, string>} what each area's time answers: "counts as Gym" (ADR 0039) */
  const counts = {};
  for (const habit of state.counted ?? []) {
    counts[habit.area] = (counts[habit.area] === undefined ? 'Counts as ' : counts[habit.area] + ', ') + habit.label;
  }
  return (
    <>
      <TimeSteppers areas={areas} time={shown} step={step} max={max} disabled={busy} onSet={onTime} counts={counts} />
      <div className="checkin-actions">
        <span className="caption num">{total === 0 ? 'In half hours, as best you remember.' : formatMinutes(total) + ' in all'}</span>
        {state.answers.time === null && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAnswer(question.id, { none: true })}>
            Nothing to declare
          </button>
        )}
        <button
          type="button"
          className={filled ? 'btn-primary' : 'btn-ghost'}
          aria-label="Save time"
          disabled={busy || !changed}
          onClick={() => onAnswer(question.id, { areas: changes })}
        >
          Save
        </button>
      </div>
    </>
  );
}

/**
 * The card that asks one question: where it stands in the day ("3 of 7"),
 * the question put for its day, its taps, why its last answer did not land,
 * and Back and Skip for now -- Next when you went back to one answered. Its
 * heading takes the focus when an answer moves the card on (./Checkin.js).
 *
 * @param {{
 *   question: Question,
 *   state: CheckinState,
 *   today: string,
 *   onBack: () => void,
 *   onNext: () => void,
 * } & CheckinSettings & AnswerHandlers} props
 */
export function QuestionCard({ question, state, today, areas, step, max, scale, skipReasons, onAnswer, onCount, onTime, onBack, onNext }) {
  const busy = state.pending !== null;
  const closed = closedQuestions(state);
  const when = whenSaid(state.day, today);
  const kind = question.kind;
  return (
    <section className={'checkin-card is-' + kind} aria-labelledby="checkin-question">
      <span className="caption num">
        {closed.indexOf(question) + 1} of {closed.length}
        {question.answered ? ' · answered' : ''}
      </span>
      <h3 id="checkin-question" className="checkin-question" tabIndex={-1}>
        {questionText(question, state.day, today)}
      </h3>
      {kind === 'habit' && (
        <HabitBody question={question} state={state} busy={busy} when={when} skipReasons={skipReasons} onAnswer={onAnswer} onCount={onCount} onTime={onTime} />
      )}
      {(kind === 'mood' || kind === 'energy') && (
        <div className="checkin-reading">
          <RatingButtons scale={scale} value={state.answers[kind]} label={READING_NAMES[kind]} disabled={busy} onPick={(value) => onAnswer(question.id, { value })} />
          <span className="checkin-scale-ends caption" aria-hidden="true">
            <span>Low</span>
            <span>High</span>
          </span>
        </div>
      )}
      {kind === 'time' && (
        <TimeBody question={question} state={state} busy={busy} filled areas={areas} step={step} max={max} onAnswer={onAnswer} onTime={onTime} />
      )}
      <AnswerError error={state.errors[question.id]} />
      <div className="checkin-nav">
        <button type="button" className="link-btn" disabled={busy || !canGoBack(state)} onClick={onBack}>
          Back
        </button>
        <button type="button" className="link-btn" disabled={busy || !canGoOn(state)} onClick={onNext}>
          {question.answered ? 'Next' : 'Skip for now'}
        </button>
      </div>
    </section>
  );
}

/**
 * The note's box: kept as a journal entry, word for word, and emptied once
 * kept so it can be used again. A save that did not land leaves the text
 * where it was, and says so.
 *
 * @param {{
 *   label: string,
 *   text: string,
 *   busy: boolean,
 *   error: string | undefined,
 *   filled: boolean,
 *   onType: (text: string) => void,
 *   onSave: () => void,
 * }} props `filled` whether Save is the view's filled button
 */
export function NoteBox({ label, text, busy, error, filled, onType, onSave }) {
  return (
    <form
      className="checkin-open"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <label className="checkin-label" htmlFor="checkin-open-text">
        {label}
      </label>
      <ProseBox
        id="checkin-open-text"
        rows={2}
        placeholder="Optional. Kept word for word in the journal."
        value={text}
        onChange={(event) => onType(event.target.value)}
      />
      <div className="checkin-actions">
        {error === undefined ? (
          <span className="caption">If the save fails, the text stays here.</span>
        ) : (
          <span className="caption is-error" role="status">
            {error.replace(/\.$/, '') + '. The text is still here.'}
          </span>
        )}
        <button type="submit" className={filled ? 'btn-primary' : 'btn-ghost'} aria-label="Save note" disabled={busy || text.trim() === ''}>
          Save
        </button>
      </div>
    </form>
  );
}
