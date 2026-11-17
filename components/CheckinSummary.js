import { countedHint } from '@/components/checkinWords.js';
import { formatMinutes } from '@/components/format.js';
import { checkinSummary } from '@/lib/domain/derive/checkin.js';

/**
 * How a filled day went (ADR 0037), in place of the list of what was filed:
 * mood, energy, habits kept out of those counted, the time declared -- its
 * total and a bar by area -- then each habit kept or why not. Read off the
 * day's questions and answers by `checkinSummary`, the one implementation.
 * A habit counted from a time area (ADR 0039) says the area's time instead
 * of a tick: "From Training 1h", "No Training time".
 * Pure; what follows it in the panel -- the notes, the note box, "Edit
 * answers" -- comes in as children.
 *
 * Colour follows docs/design/ui-rules.md: the readings are neutral, a habit
 * kept takes the success colour as a state, and the time bar is the neutral
 * series ramp with every part named beside it, so no part is told by colour
 * alone.
 *
 * @param {{
 *   state: import('@/components/checkinReducer.js').CheckinState,
 *   name: string,
 *   areas: readonly { key: string, label: string }[],
 *   scale: readonly number[],
 *   skipReasons: readonly { key: string, label: string }[],
 *   children?: import('react').ReactNode,
 * }} props `name` the day as the panel names it
 */
export function CheckinSummary({ state, name, areas, scale, skipReasons, children }) {
  const summary = checkinSummary({
    questions: state.questions,
    answers: state.answers,
    timeAreas: areas.map((area) => area.key),
    counted: state.counted,
  });
  const top = scale.at(-1) ?? 5;
  const areaLabel = (/** @type {string} */ key) => areas.find((area) => area.key === key)?.label ?? key;
  const reasonLabel = (/** @type {string} */ key) => skipReasons.find((reason) => reason.key === key)?.label ?? key;

  return (
    <section className="checkin-summary" aria-label={'How ' + (name === 'Today' || name === 'Yesterday' ? name.toLowerCase() : name) + ' went'}>
      <dl className="checkin-tiles">
        <div className="checkin-tile">
          <dt className="caption">Mood</dt>
          <dd className="checkin-tile-value num">
            {summary.mood ?? '–'}
            <span className="checkin-tile-unit"> / {top}</span>
          </dd>
        </div>
        <div className="checkin-tile">
          <dt className="caption">Energy</dt>
          <dd className="checkin-tile-value num">
            {summary.energy ?? '–'}
            <span className="checkin-tile-unit"> / {top}</span>
          </dd>
        </div>
        <div className="checkin-tile">
          <dt className="caption">Habits kept</dt>
          <dd className="checkin-tile-value num">
            {summary.kept}
            <span className="checkin-tile-unit"> of {summary.counted}</span>
          </dd>
        </div>
        <div className="checkin-tile">
          <dt className="caption">Time declared</dt>
          <dd className="checkin-tile-value num">{summary.time === null ? 'Not declared' : formatMinutes(summary.time.total)}</dd>
        </div>
      </dl>

      {summary.time !== null && summary.time.total > 0 && (
        <div className="checkin-time-split">
          <div
            className="checkin-timebar"
            role="img"
            aria-label={'Time by area: ' + summary.time.areas.map((part) => areaLabel(part.area) + ' ' + formatMinutes(part.minutes)).join(', ')}
          >
            {summary.time.areas.map((part, index) => (
              <span key={part.area} className={'checkin-timebar-part series-' + ((index % 3) + 1)} style={{ flexGrow: part.minutes }} />
            ))}
          </div>
          <ul className="checkin-legend" aria-hidden="true">
            {summary.time.areas.map((part, index) => (
              <li key={part.area}>
                <span className={'checkin-swatch series-' + ((index % 3) + 1)} />
                {areaLabel(part.area)} <span className="num">{formatMinutes(part.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.habits.length > 0 && (
        <ul className="checkin-habit-list" aria-label="Habits">
          {summary.habits.map((habit) => (
            <li key={habit.id} className={'checkin-habit-line is-' + habit.state}>
              <span className="checkin-habit-name">{habit.label}</span>
              <span className="checkin-habit-state">{habitWord(habit, reasonLabel, areaLabel)}</span>
            </li>
          ))}
        </ul>
      )}

      {children}
    </section>
  );
}

/**
 * What a habit's line says of it: "Kept", "8 of 8", "Skipped: Too heavy",
 * "Paused", "3 of 8, no reason" -- and for a habit counted from a time area,
 * "From Training 1h", "No Training time", "From Training time, not declared".
 *
 * @param {import('@/lib/domain/derive/checkin.js').SummaryHabit} habit
 * @param {(key: string) => string} reasonLabel
 * @param {(key: string) => string} areaLabel
 * @returns {string}
 */
function habitWord(habit, reasonLabel, areaLabel) {
  if (habit.countedFrom !== null && (habit.state === 'kept' || habit.state === 'missed' || habit.state === 'open')) {
    return countedHint(habit.countedFrom, habit.minutes, areaLabel);
  }
  const count = habit.habitType === 'counter' && typeof habit.value === 'number' ? habit.value + ' of ' + (habit.target ?? 0) : null;
  switch (habit.state) {
    case 'kept':
      return count ?? 'Kept';
    case 'paused':
      return 'Paused';
    case 'skipped':
      return 'Skipped: ' + reasonLabel(habit.skip ?? '');
    default:
      return count === null ? 'Not answered' : count + ', no reason';
  }
}
