import { CheckinNotes } from '@/components/CheckinNotes.js';
import { AnswerError, CounterStepper, NoteBox, READING_NAMES, ReasonChips, TimeBody, countKeeps } from '@/components/CheckinQuestions.js';
import { counterValue, savedCount } from '@/components/checkinReducer.js';
import { RatingButtons } from '@/components/DayRating.js';

/**
 * The sheet of every answer of a day (ADR 0037): each question with what the
 * day holds, changeable in place -- a changed answer is a new answer through
 * the same POST, filed at once, so there is nothing to save but a count or
 * the time, which wait for their Save. Then the day's notes, each removable
 * with what was filed from it, and a box for another. Open from the summary
 * and from a day still being filled. Done, the view's one filled button,
 * closes it. Pure.
 *
 * @typedef {import('@/components/CheckinQuestions.js').CheckinSettings} CheckinSettings
 * @typedef {import('@/components/CheckinQuestions.js').AnswerHandlers} AnswerHandlers
 *
 * @param {{
 *   state: import('@/components/checkinReducer.js').CheckinState,
 *   name: string,
 *   openText: string,
 *   onType: (text: string) => void,
 *   onUndo: (actionId: string) => void,
 *   onClose: () => void,
 * } & CheckinSettings & AnswerHandlers} props `name` the day as the panel names it
 */
export function CheckinSheet({ state, name, openText, areas, step, max, scale, skipReasons, onAnswer, onCount, onTime, onType, onUndo, onClose }) {
  const busy = state.pending !== null;
  const habits = state.questions.filter((question) => question.kind === 'habit');
  const time = state.questions.find((question) => question.kind === 'time');

  return (
    <section className="checkin-sheet" aria-labelledby="checkin-sheet-title">
      <h3 id="checkin-sheet-title" className="subhead" tabIndex={-1}>
        {name}&rsquo;s answers
      </h3>

      {habits.length > 0 && (
        <div className="checkin-sheet-group">
          <h4 className="eyebrow">Habits</h4>
          <ul className="checkin-sheet-rows">
            {habits.map((question) => {
              const habitId = question.subjectId ?? '';
              const skip = state.answers.skips[habitId] ?? null;
              const counter = question.habitType === 'counter';
              const count = counterValue(state, question);
              const kept = state.answers.habits[habitId] === true;
              return (
                <li key={question.id} className={'checkin-sheet-row' + (question.answered ? '' : ' is-open')}>
                  <span className="checkin-label">
                    {question.label}
                    {!question.answered && <span className="caption"> · not answered</span>}
                  </span>
                  <div className="checkin-actions">
                    {counter ? (
                      <>
                        <CounterStepper question={question} count={count} disabled={busy} onCount={onCount} />
                        {count !== savedCount(state, question) && (
                          <button type="button" className="btn-ghost" aria-label={'Save ' + question.label} disabled={busy} onClick={() => onAnswer(question.id, { value: count })}>
                            Save
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        type="button"
                        className={'btn-ghost checkin-chip' + (kept ? ' is-chosen' : '')}
                        aria-label={'Yes: ' + question.label}
                        aria-pressed={kept}
                        disabled={busy}
                        onClick={() => {
                          if (!kept) onAnswer(question.id, { done: true });
                        }}
                      >
                        Yes
                      </button>
                    )}
                  </div>
                  <ReasonChips
                    question={question}
                    chosen={skip}
                    disabled={busy || (counter && countKeeps(question, count))}
                    skipReasons={skipReasons}
                    onAnswer={onAnswer}
                  />
                  <AnswerError error={state.errors[question.id]} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="checkin-sheet-group">
        <h4 className="eyebrow">How it felt</h4>
        <ul className="checkin-sheet-rows">
          {state.questions
            .filter((question) => question.kind === 'mood' || question.kind === 'energy')
            .map((question) => {
              const kind = /** @type {'mood' | 'energy'} */ (question.kind);
              return (
                <li key={question.id} className={'checkin-sheet-row is-reading' + (question.answered ? '' : ' is-open')}>
                  <span className="checkin-label">{READING_NAMES[kind]}</span>
                  <RatingButtons scale={scale} value={state.answers[kind]} label={READING_NAMES[kind]} disabled={busy} onPick={(value) => onAnswer(question.id, { value })} />
                  <AnswerError error={state.errors[question.id]} />
                </li>
              );
            })}
        </ul>
      </div>

      {time !== undefined && (
        <div className={'checkin-sheet-group' + (time.answered ? '' : ' is-open')}>
          <h4 className="eyebrow">Time{time.answered ? '' : ' · not declared'}</h4>
          <TimeBody question={time} state={state} busy={busy} filled={false} areas={areas} step={step} max={max} onAnswer={onAnswer} onTime={onTime} />
          <AnswerError error={state.errors[time.id]} />
        </div>
      )}

      <div className="checkin-sheet-group">
        <h4 className="eyebrow">Note</h4>
        <CheckinNotes notes={state.notes} problems={state.noteProblems} lineErrors={state.lineErrors} pending={state.pending} removable onUndo={onUndo} />
        <NoteBox
          label={state.notes.length === 0 ? 'Anything worth noting?' : 'Anything else worth noting?'}
          text={openText}
          busy={busy}
          error={state.errors.open}
          filled={false}
          onType={onType}
          onSave={() => onAnswer('open', { text: openText })}
        />
      </div>

      <div className="checkin-sheet-foot">
        <button type="button" className="btn-primary" disabled={busy} onClick={onClose}>
          Done
        </button>
      </div>
    </section>
  );
}
