import DayRating from '@/components/DayRating.js';
import JournalLine from '@/components/JournalLine.js';
import { dayHeading } from '@/components/format.js';
import { today } from '@/lib/domain/dates.js';
import { DAY_READING_SCALE } from '@/lib/domain/day-readings.js';
import { openHabits } from '@/lib/domain/derive/habits.js';
import { getDailyLog, getProfile } from '@/lib/store.js';

/**
 * The Close the day card (#243, #235), ported from design/mockup.html's
 * `#card-close-day`: each thing saved on its own, none required. The day's
 * mood and its energy (ADR 0037), the habits still open (derived from today's
 * log with the Habits card's own rule, days off left out), and one line for
 * the journal. No state marks a day as closed. Server rendered from the
 * store: loading it calls no model and no integration. `key` remounts a
 * reading when its saved value changes under it.
 */
export default async function CloseDayCard() {
  const date = today();
  const [log, profile] = await Promise.all([getDailyLog(date), getProfile()]);
  const open = openHabits(profile.habits, log);
  return <CloseDayView date={date} mood={log.mood} energy={log.energy} open={open} scale={DAY_READING_SCALE} />;
}

/**
 * What the card draws, from what it was given: the same taps for the mood
 * and for the energy, each saying what the day was given once it has a
 * value; the habit line says "Nothing left" when none is open and names them
 * otherwise.
 *
 * @param {{
 *   date: string,
 *   mood: number | null,
 *   energy: number | null,
 *   open: { label: string }[],
 *   scale: readonly number[],
 * }} props
 */
export function CloseDayView({ date, mood, energy, open, scale }) {
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
