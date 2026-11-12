import ReviewFigures from '@/components/ReviewFigures.js';
import ReviewReread from '@/components/ReviewReread.js';
import ReviewWeekNav from '@/components/ReviewWeekNav.js';
import ReviewWrite from '@/components/ReviewWrite.js';
import { shiftDayKey, today } from '@/lib/domain/dates.js';
import { leverOf } from '@/lib/domain/derive/review.js';
import { BASELINE_WEEKS, weekFigures } from '@/lib/domain/derive/week.js';
import { resolveReviewWeek } from '@/lib/domain/review-week.js';
import {
  getCaptures,
  getDailyLogs,
  getGoals,
  getJournalEntries,
  getProfile,
  getReview,
  getTasks,
  getTransactions,
} from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Review screen (#239, spec #232): one week, Monday to Sunday, read top
 * to bottom as steps -- what happened (derived), the reread, the three
 * questions and the one lever (#240).
 *
 * `?week=<monday>` selects the week. With none, or a malformed, non-Monday or
 * future one, it opens on the week containing today on a Sunday and on the
 * week before on any other day (`resolveReviewWeek`). "Today" is today in
 * USER_TIMEZONE (rule 4).
 *
 * The page reads what is saved once and derives once; it calls no model and
 * no integration (rule 3). Writing happens in `ReviewWrite`, through the review route.
 *
 * @param {{ searchParams: Promise<{ week?: string | string[] }> }} props
 */
export default async function ReviewScreen({ searchParams }) {
  const { week: weekParam } = await searchParams;
  const todayKey = today();
  const week = resolveReviewWeek(weekParam, todayKey);

  const lastDay = shiftDayKey(week.from, 6);
  const [profile, dailyLogs, tasks, goals, journalEntries, transactions, captures, review, previousReview] = await Promise.all([
    getProfile(),
    // The week before is read for the habits' "before" figure.
    getDailyLogs(shiftDayKey(week.from, -7), lastDay),
    getTasks(),
    getGoals(),
    getJournalEntries(week.from, lastDay),
    // The spending baseline reaches back BASELINE_WEEKS weeks.
    getTransactions({ from: shiftDayKey(week.from, -7 * BASELINE_WEEKS), to: lastDay }),
    getCaptures(),
    getReview('week', week.from),
    getReview('week', week.previous),
  ]);
  // The lever the week before set: the one rule Home uses (`leverOf`), so a
  // draft or a blank lever is not shown here either.
  const previousLever = leverOf(previousReview);
  const figures = weekFigures({
    profile,
    dailyLogs,
    tasks,
    goals,
    journalEntries,
    transactions,
    captures,
    from: week.from,
    today: todayKey,
  });

  return (
    <section id="screen-review" className="screen is-active">
      <div className="screen-grid">
        <article id="card-review" className="card span-12" data-week={week.isCurrent ? 'now' : 'past'}>
          <div className="card-head">
            <span className="eyebrow">Review</span>
            {review !== null && review.completedAt !== null && <span className="badge badge-tag">Complete</span>}
            {week.isCurrent && <span className="badge badge-tag">So far</span>}
            <ReviewWeekNav week={week} />
          </div>
          <div className="card-body">
            <ReviewFigures figures={figures} />
            <ReviewReread entries={figures.journal.entries} />
            <ReviewWrite key={week.from} period="week" from={week.from} review={review} previousLever={previousLever} />
          </div>
        </article>
      </div>
    </section>
  );
}
