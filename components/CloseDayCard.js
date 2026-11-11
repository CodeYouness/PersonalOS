import DayRating from '@/components/DayRating.js';
import JournalLine from '@/components/JournalLine.js';
import { dayHeading } from '@/components/format.js';
import { today } from '@/lib/domain/dates.js';
import { openHabits } from '@/lib/domain/derive/habits.js';
import { getDailyLog, getProfile } from '@/lib/store.js';
import { limits } from '@/personalos.config.js';

/**
 * The Close the day card (#243, #235), ported from design/mockup.html's
 * `#card-close-day`: three things, each saved on its own, none required. The
 * day's rating, the habits still open (derived from today's log with the
 * Habits card's own rule, days off left out), and one line for the journal.
 * No state marks a day as closed -- it is closed when it is rated. Server
 * rendered from the store: loading it calls no model and no integration.
 * `key` remounts the rating when the saved value changes under it.
 */
export default async function CloseDayCard() {
  const date = today();
  const [log, profile] = await Promise.all([getDailyLog(date), getProfile()]);
  const open = openHabits(profile.habits, log);
  const scale = Array.from(
    { length: limits.dayRatingMax - limits.dayRatingMin + 1 },
    (_, index) => limits.dayRatingMin + index
  );
  return <CloseDayView date={date} rating={log.rating} open={open} scale={scale} />;
}

/**
 * What the card draws, from what it was given: the rating line appears only
 * once the day is rated, the habit line says "Nothing left" when none is open
 * and names them otherwise.
 *
 * @param {{
 *   date: string,
 *   rating: number | null,
 *   open: { label: string }[],
 *   scale: number[],
 * }} props
 */
export function CloseDayView({ date, rating, open, scale }) {
  return (
    <article id="card-close-day" className="card span-8">
      <div className="card-head">
        <span className="eyebrow">Close the day</span>
        <span className="caption">{dayHeading(date)}</span>
      </div>
      <div className="card-body">
        <div className="close-row">
          <div className="head">
            <span>How did the day go?</span>
            {rating !== null && <span className="caption">You gave it {rating}</span>}
          </div>
          <DayRating key={String(rating)} date={date} scale={scale} initial={rating} />
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
