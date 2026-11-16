import { dayName, weekDayLabel } from '@/components/checkinWords.js';
import { dayOfMonth, WEEKDAY_SHORT } from '@/components/format.js';
import { weekdayOf } from '@/lib/domain/dates.js';

/**
 * Where the check-in stands across days (ADR 0037): the strip of the last
 * seven days, the day's progress one segment per question, and the one
 * banner that asks for yesterday. Pure.
 *
 * @typedef {import('@/lib/domain/derive/checkin.js').CheckinWeekDay} CheckinWeekDay
 * @typedef {import('@/lib/domain/derive/checkin.js').Question} Question
 */

/**
 * The last seven days ending today, oldest first: a button each, with its
 * weekday, its date and a mark -- filled, partly filled or not. The day shown
 * is pressed, today is the current date, and each says all of it in words
 * ("Friday 14 November, filled"), so the mark is never the only way to tell.
 * No future day is offered.
 *
 * @param {{
 *   week: readonly CheckinWeekDay[],
 *   day: string,
 *   today: string,
 *   disabled: boolean,
 *   onPick: (day: string) => void,
 * }} props
 */
export function WeekStrip({ week, day, today, disabled, onPick }) {
  return (
    <div className="checkin-week" role="group" aria-label="The last seven days">
      {week.map((entry) => (
        <button
          key={entry.day}
          type="button"
          className={'checkin-day is-' + entry.fill + (entry.day === day ? ' is-shown' : '')}
          aria-label={weekDayLabel(entry.day, entry.fill, today)}
          aria-pressed={entry.day === day}
          aria-current={entry.day === today ? 'date' : undefined}
          disabled={disabled}
          onClick={() => {
            if (entry.day !== day) onPick(entry.day);
          }}
        >
          <span className="checkin-day-name">{WEEKDAY_SHORT[weekdayOf(entry.day) - 1]}</span>
          <span className="checkin-day-num num">{dayOfMonth(entry.day)}</span>
          <span className="checkin-mark" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/**
 * The day's progress: one segment per question but the open one, filled
 * once answered, the one asked now outlined.
 *
 * @param {{ questions: readonly Question[], shown: string | null }} props
 *   `shown` the question the card asks, if one
 */
export function DayProgress({ questions, shown }) {
  const closed = questions.filter((question) => question.kind !== 'open');
  const answered = closed.filter((question) => question.answered).length;
  return (
    <div
      className="checkin-progress-bar"
      role="progressbar"
      aria-label="Questions answered"
      aria-valuemin={0}
      aria-valuemax={closed.length}
      aria-valuenow={answered}
      aria-valuetext={answered + ' of ' + closed.length + ' answered'}
    >
      {closed.map((question) => (
        <span key={question.id} className={'checkin-segment' + (question.answered ? ' is-answered' : '') + (question.id === shown ? ' is-asked' : '')} />
      ))}
    </div>
  );
}

/**
 * "Yesterday isn't filled yet -- Fill it", quietly: only while today is
 * shown and yesterday still has questions left.
 *
 * @param {{ yesterday: CheckinWeekDay, today: string, disabled: boolean, onPick: (day: string) => void }} props
 */
export function YesterdayBanner({ yesterday, today, disabled, onPick }) {
  const left = yesterday.total - yesterday.answered;
  return (
    <p className="checkin-banner" role="note">
      <span>
        {dayName(yesterday.day, today)} isn&rsquo;t filled yet
        <span className="caption num"> · {left} left</span>
      </span>
      <button type="button" className="link-btn" disabled={disabled} onClick={() => onPick(yesterday.day)}>
        Fill it
      </button>
    </p>
  );
}
