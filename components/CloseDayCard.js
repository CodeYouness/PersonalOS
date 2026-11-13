import DayRating from '@/components/DayRating.js';
import DayTime from '@/components/DayTime.js';
import JournalLine from '@/components/JournalLine.js';
import { dayHeading, formatMinutes } from '@/components/format.js';
import { today } from '@/lib/domain/dates.js';
import { DAY_READING_SCALE } from '@/lib/domain/day-readings.js';
import { TIME_AREA_KEYS } from '@/lib/domain/day-time.js';
import { openHabits } from '@/lib/domain/derive/habits.js';
import { dayTimeTotal } from '@/lib/domain/derive/time.js';
import { getDailyLog, getProfile } from '@/lib/store.js';
import { limits, TIME_AREAS } from '@/personalos.config.js';

/** The areas, in order, as the time row offers them. */
const AREAS = TIME_AREA_KEYS.map((key) => ({ key, label: TIME_AREAS[key] }));

/**
 * The Close the day card (#243, #235), ported from design/mockup.html's
 * `#card-close-day`: each thing saved on its own, none required. The day's
 * mood and its energy (ADR 0037), its time declared against areas in half
 * hours (ADR 0037), the habits still open (derived from today's
 * log with the Habits card's own rule, days off left out), and one line for
 * the journal. No state marks a day as closed. Server rendered from the
 * store: loading it calls no model and no integration. `key` remounts a
 * reading, or the time row, when its saved value changes under it. A
 * check-in panel replaces this card in a later ticket.
 */
export default async function CloseDayCard() {
  const date = today();
  const [log, profile] = await Promise.all([getDailyLog(date), getProfile()]);
  const open = openHabits(profile.habits, log);
  return (
    <CloseDayView
      date={date}
      mood={log.mood}
      energy={log.energy}
      time={log.time}
      areas={AREAS}
      step={limits.timeStepMinutes}
      max={limits.timeAreaMaxMinutes}
      open={open}
      scale={DAY_READING_SCALE}
    />
  );
}

/**
 * What the card draws, from what it was given: the same taps for the mood
 * and for the energy, each saying what the day was given once it has a
 * value; the time row says what was declared once the day has been; the
 * habit line says "Nothing left" when none is open and names them otherwise.
 *
 * @param {{
 *   date: string,
 *   mood: number | null,
 *   energy: number | null,
 *   time: Record<string, number> | null,
 *   areas: readonly { key: string, label: string }[],
 *   step: number,
 *   max: number,
 *   open: { label: string }[],
 *   scale: readonly number[],
 * }} props
 */
export function CloseDayView({ date, mood, energy, time, areas, step, max, open, scale }) {
  const total = time === null ? null : dayTimeTotal({ time });
  return (
    <article id="card-close-day" className="card span-8">
      <div className="card-head">
        <span className="eyebrow">Close the day</span>
        <span className="caption">{dayHeading(date)}</span>
      </div>
      <div className="card-body">
        <div className="close-row">
          <div className="head">
            <span>Mood</span>
            {mood !== null && <span className="caption">You gave it {mood}</span>}
          </div>
          <DayRating key={String(mood)} date={date} field="mood" label="Mood" prompt="How did today feel?" scale={scale} initial={mood} />
        </div>
        <div className="close-row">
          <div className="head">
            <span>Energy</span>
            {energy !== null && <span className="caption">You gave it {energy}</span>}
          </div>
          <DayRating key={String(energy)} date={date} field="energy" label="Energy" prompt="How much energy did today have?" scale={scale} initial={energy} />
        </div>
        <div className="close-row">
          <div className="head">
            <span>Time</span>
            {total !== null && (
              <span className="caption">{total === 0 ? 'Nothing declared' : formatMinutes(total) + ' declared'}</span>
            )}
          </div>
          <DayTime key={JSON.stringify(time)} date={date} areas={areas} step={step} max={max} initial={time} />
        </div>
        <div className="close-row">
          <div className="head">
            <span>
              <span className="num">{open.length}</span> {open.length === 1 ? 'habit' : 'habits'} still open today
            </span>
            <span className="caption">days off not counted</span>
          </div>
          <span className="caption">
            {open.length === 0
              ? 'Nothing left for today.'
              : open.map((habit) => habit.label).join(' · ') + ' · tick them on the Habits card'}
          </span>
        </div>
        <div className="close-row">
          <div className="head">
            <span>One line for the journal</span>
          </div>
          <JournalLine date={date} />
        </div>
      </div>
    </article>
  );
}
