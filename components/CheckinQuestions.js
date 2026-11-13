import { RatingButtons } from '@/components/DayRating.js';
import { TimeSteppers } from '@/components/DayTime.js';
import { formatMinutes } from '@/components/format.js';
import { counterValue, savedCount } from '@/components/checkinReducer.js';
import { dayTimeTotal } from '@/lib/domain/derive/time.js';

/**
 * The check-in's rows (ADR 0037): one per question still to ask, and the box
 * for the open one under them. Pure: what each row shows comes from the
 * panel's state, and every tap goes back through a handler -- an answer as
 * the closed shape lib/checkin/closed.js takes, so the row never decides
 * what is filed. Every button names what it answers, so a screen reader
 * hears "Done: Read", not "Done"; nothing hangs on a key, so it works the
 * same on a phone.
 *
 * @typedef {import('@/lib/domain/derive/checkin.js').Question} Question
 * @typedef {import('@/components/checkinReducer.js').CheckinState} CheckinState
 *
 * @typedef {object} RowHandlers
 * @property {(questionId: string, value: unknown) => void} onAnswer
 * @property {(questionId: string) => void} onToggleSkip
 * @property {(questionId: string, value: number) => void} onCount
 * @property {(area: string, minutes: number) => void} onTime
 *
 * @typedef {object} RowSettings
 * @property {readonly { key: string, label: string }[]} areas
 * @property {number} step
 * @property {number} max
 * @property {readonly number[]} scale
 * @property {readonly { key: string, label: string }[]} skipReasons
 */

/** What the two readings are called, where a tap group needs a name. */
const READING_NAMES = Object.freeze({ mood: 'Mood', energy: 'Energy' });

/** @param {{ error: string | undefined }} props */
function RowError({ error }) {
  if (error === undefined) return null;
  return (
    <p className="caption is-error" role="status">
      {error}
    </p>
  );
}

/**
 * A habit: Done, or Skip with a reason; a counter steps its count to its
 * target first, and Save sends the count once it moved.
 *
 * @param {{ question: Question, state: CheckinState, busy: boolean, skipReasons: RowSettings['skipReasons'] } & RowHandlers} props
 */
function HabitRow({ question, state, busy, skipReasons, onAnswer, onToggleSkip, onCount }) {
  const { id, label, target } = question;
  const counter = question.habitType === 'counter';
  const count = counterValue(state, question);
  const moved = counter && count !== savedCount(state, question);
  const atTarget = typeof target === 'number' && target > 0 && count >= target;
  const skipping = state.skipping === id;
  const reasonsId = 'checkin-skip-' + question.subjectId;

  return (
    <li className={'checkin-row checkin-habit' + (counter ? ' is-counter' : '')}>
      <div className="checkin-line">
        <span className="checkin-label">{label}</span>
        {counter && (
          <span className="checkin-stepper">
            <button
              type="button"
              className="time-step-btn"
              aria-label={'Fewer ' + label}
              disabled={busy || count === 0}
              onClick={() => onCount(id, count - 1)}
            >
              &minus;
            </button>
            <span className="checkin-count num">
              {count}
              {typeof target === 'number' && target > 0 ? <> / {target}</> : null}
            </span>
            <button
              type="button"
              className="time-step-btn"
              aria-label={'More ' + label}
              disabled={busy || atTarget}
              onClick={() => onCount(id, count + 1)}
            >
              +
            </button>
          </span>
        )}
        <span className="checkin-buttons">
          {moved && (
            <button type="button" className="btn-ghost" aria-label={'Save ' + label} disabled={busy} onClick={() => onAnswer(id, { value: count })}>
              Save
            </button>
          )}
          <button type="button" className="btn-ghost" aria-label={'Done: ' + label} disabled={busy} onClick={() => onAnswer(id, { done: true })}>
            Done
          </button>
          <button
            type="button"
            className={'btn-ghost' + (skipping ? ' is-open' : '')}
            aria-label={'Skip ' + label + '…'}
            aria-expanded={skipping}
            aria-controls={skipping ? reasonsId : undefined}
            onClick={() => onToggleSkip(id)}
          >
            Skip…
          </button>
        </span>
      </div>
      {skipping && (
        <div id={reasonsId} className="checkin-reasons" role="group" aria-label={'Why ' + label + ' was skipped'}>
          {skipReasons.map((reason) => (
            <button
              key={reason.key}
              type="button"
              className="btn-ghost"
              aria-label={label + ': ' + reason.label}
              disabled={busy}
              onClick={() => onAnswer(id, { skip: reason.key })}
            >
              {reason.label}
            </button>
          ))}
        </div>
      )}
      <RowError error={state.errors[id]} />
    </li>
  );
}

/**
 * Mood or energy: five taps, the tap is the answer.
 *
 * @param {{ question: Question, state: CheckinState, busy: boolean, scale: readonly number[], onAnswer: RowHandlers['onAnswer'] }} props
 */
function ReadingRow({ question, state, busy, scale, onAnswer }) {
  const name = question.kind === 'mood' || question.kind === 'energy' ? READING_NAMES[question.kind] : question.label;
  return (
    <li className="checkin-row checkin-reading">
      <span className="checkin-label">{question.label}</span>
      <RatingButtons scale={scale} value={null} label={name} disabled={busy} onPick={(value) => onAnswer(question.id, { value })} />
      <RowError error={state.errors[question.id]} />
    </li>
  );
}

/**
 * The day's time: steppers per area, kept here until Save time sends them
 * as one answer; or "Nothing to declare".
 *
 * @param {{ question: Question, state: CheckinState, busy: boolean } & Pick<RowSettings, 'areas' | 'step' | 'max'> & Pick<RowHandlers, 'onAnswer' | 'onTime'>} props
 */
function TimeRow({ question, state, busy, areas, step, max, onAnswer, onTime }) {
  const total = dayTimeTotal({ time: state.time }) ?? 0;
  return (
    <li className="checkin-row checkin-time">
      <span className="checkin-label">{question.label}</span>
      <TimeSteppers areas={areas} time={state.time} step={step} max={max} disabled={busy} onSet={onTime} />
      <div className="checkin-actions">
        <span className="caption">{total === 0 ? 'In half hours, as best you remember.' : formatMinutes(total) + ' to save'}</span>
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => onAnswer(question.id, { none: true })}>
          Nothing to declare
        </button>
        <button type="button" className="btn-ghost" disabled={busy || total === 0} onClick={() => onAnswer(question.id, { areas: state.time })}>
          Save time
        </button>
      </div>
      <RowError error={state.errors[question.id]} />
    </li>
  );
}

/**
 * The rows still to ask, in the order the day asks them.
 *
 * @param {{ rows: readonly Question[], state: CheckinState } & RowSettings & RowHandlers} props
 */
export function CheckinRows({ rows, state, areas, step, max, scale, skipReasons, onAnswer, onToggleSkip, onCount, onTime }) {
  const busy = state.pending !== null;
  return (
    <ul className="checkin-rows">
      {rows.map((question) => {
        switch (question.kind) {
          case 'habit':
            return (
              <HabitRow
                key={question.id}
                question={question}
                state={state}
                busy={busy}
                skipReasons={skipReasons}
                onAnswer={onAnswer}
                onToggleSkip={onToggleSkip}
                onCount={onCount}
                onTime={onTime}
              />
            );
          case 'mood':
          case 'energy':
            return <ReadingRow key={question.id} question={question} state={state} busy={busy} scale={scale} onAnswer={onAnswer} />;
          case 'time':
            return (
              <TimeRow
                key={question.id}
                question={question}
                state={state}
                busy={busy}
                areas={areas}
                step={step}
                max={max}
                onAnswer={onAnswer}
                onTime={onTime}
              />
            );
          default:
            return null;
        }
      })}
    </ul>
  );
}

/**
 * The open question's box: saved as a journal entry, word for word, and
 * emptied once saved so it can be used again. A save that did not land
 * leaves the text where it was, and says so.
 *
 * @param {{
 *   label: string,
 *   text: string,
 *   busy: boolean,
 *   error: string | undefined,
 *   onType: (text: string) => void,
 *   onSave: () => void,
 * }} props
 */
export function CheckinOpen({ label, text, busy, error, onType, onSave }) {
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
      <textarea
        id="checkin-open-text"
        className="input"
        rows={2}
        aria-label={label}
        placeholder="Kept word for word in today's journal"
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
        <button type="submit" className="btn-ghost" disabled={busy || text.trim() === ''}>
          Save
        </button>
      </div>
    </form>
  );
}
