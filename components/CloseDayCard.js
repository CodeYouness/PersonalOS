import DayRating from '@/components/DayRating.js';
import { today } from '@/lib/domain/dates.js';
import { getDailyLog } from '@/lib/store.js';
import { limits } from '@/personalos.config.js';

/**
 * The Close the day card (#243): for now only the day's rating. Server
 * rendered from the store -- loading it calls no model and no integration --
 * with the five taps as a client island. `key` remounts the island when the
 * saved rating changes under it.
 */
export default async function CloseDayCard() {
  const date = today();
  const { rating } = await getDailyLog(date);
  const scale = Array.from(
    { length: limits.dayRatingMax - limits.dayRatingMin + 1 },
    (_, index) => limits.dayRatingMin + index
  );

  return (
    <article id="card-close-day" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Close the day</span>
      </div>
      <div className="card-body">
        <DayRating key={String(rating)} date={date} scale={scale} initial={rating} />
      </div>
    </article>
  );
}
