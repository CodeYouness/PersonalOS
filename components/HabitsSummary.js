import { percent, streakLabel } from '@/components/format.js';

/**
 * The Habits screen's summary strip, ported from design/mockup.html's
 * `#card-habits-summary` -- minus its "Longest streak", which nothing
 * derives yet, and minus its Week/Month/YTD selector, which this product
 * does not have (docs/spec.md: "Not yet: a period selector").
 *
 * With the selector gone the window is fixed, so the note under the row says
 * which one -- and says that the streak is not in it. Three of these numbers
 * are the last thirty days; the streak is the running one, the same number
 * the home card shows, because a streak cut down to a window is a different
 * streak and not a smaller one (ADR 0017).
 *
 * Presentational only: every number is derived on the server by
 * `windowSummary` and `streak`, so a tick or a correction moves them on the
 * refresh that follows the write, with nothing to keep in sync here.
 *
 * @param {{
 *   summary: ReturnType<typeof import('@/lib/domain/derive/habits.js').windowSummary>,
 *   streakDays: number,
 * }} props
 */
export default function HabitsSummary({ summary, streakDays }) {
  return (
    <article id="card-habits-summary" className="card span-12">
      <div className="card-head">
        <span className="eyebrow">Habits</span>
      </div>
      <div className="stat-row">
        <div className="stat">
          <div className="k">Completion</div>
          <div className="v num">{percent(summary.completion)}</div>
        </div>
        <div className="stat">
          <div className="k">Current streak</div>
          <div className="v num">
            {streakLabel(streakDays)}
            <span className="caption"> days</span>
          </div>
        </div>
        <div className="stat">
          <div className="k">Perfect days</div>
          <div className="v num">
            {summary.perfectDays}
            <span className="caption"> / {summary.recordedDays}</span>
          </div>
        </div>
        <div className="stat">
          <div className="k">Days recorded</div>
          <div className="v num">
            {summary.recordedDays}
            <span className="caption"> / {summary.days}</span>
          </div>
        </div>
      </div>
      <p className="caption stat-note">
        Completion, perfect days and days recorded are the last {summary.days} days. The streak is
        the running one.
      </p>
    </article>
  );
}
