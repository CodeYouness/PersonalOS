import CheckinPanel from '@/components/CheckinPanel.js';
import { HomeTiles, NeedsYou, WorthNoting } from '@/components/HomeSections.js';
import { env } from '@/lib/config/env.js';
import { shiftDayKey, weekDayKeys } from '@/lib/domain/dates.js';
import { financeOverview, worthChart } from '@/lib/domain/derive/finance.js';
import { homeClock, homeTiles, needsYou, worthNoting } from '@/lib/domain/derive/home.js';
import { refundPairs } from '@/lib/domain/derive/refunds.js';
import { lastWeekFrom, lastWeekReview } from '@/lib/domain/derive/review.js';
import { BASELINE_WEEKS, weekFigures } from '@/lib/domain/derive/week.js';
import {
  getAppointments,
  getCaptures,
  getDailyLogs,
  getFinanceInputs,
  getGoals,
  getJournalEntries,
  getProfile,
  getReview,
  getTasks,
} from '@/lib/store.js';
import { limits } from '@/personalos.config.js';

export const dynamic = 'force-dynamic';

/** How far back the Journal tile looks for the last entry. */
const JOURNAL_LOOKBACK_DAYS = 365;

/**
 * Home, the Today place (ADR 0037, 0040): built around what needs you, not
 * around cards to explore. Top to bottom, one readable column:
 *
 * 1. the check-in (ADR 0037), unchanged -- the one filled button here;
 * 2. Needs you: today's appointments still to come, tasks overdue or due
 *    today, captures not filed, last week's review not done -- or one calm
 *    line when nothing does;
 * 3. Worth noting: at most three sentences, only what differs from usual,
 *    absent otherwise;
 * 4. four tiles: habits, money, goals, journal -- and under them, as part of
 *    the money reading, the net worth line over all tracked time, the same
 *    derivation the Finances screen draws (worthChart, ADR 0048), absent
 *    while there is no net worth to draw.
 *
 * Everything is read once from the store and derived on each request
 * (`lib/domain/derive/home.js`): no model and no integration (rule 3,
 * tests/app/home-page-imports.test.js). A check-in answer refreshes the route,
 * so the sections follow what it filed. Today and the time are one instant in
 * USER_TIMEZONE (rule 4). `?checkin=` names the day the check-in shows.
 *
 * @param {{ searchParams: Promise<{ checkin?: string | string[] }> }} props
 */
export default async function Home({ searchParams }) {
  const { checkin } = await searchParams;
  const { today, now } = homeClock(new Date(), env.timezone);
  const monday = weekDayKeys(today)[0];
  const lastMonday = lastWeekFrom(today);

  const [profile, dailyLogs, tasks, appointments, captures, goals, journalEntries, finance, lastReview] = await Promise.all([
    getProfile(),
    // The four weeks before this one: the habits' "usual", and the week
    // before last for weekFigures.
    getDailyLogs(shiftDayKey(monday, -7 * BASELINE_WEEKS), today),
    getTasks(),
    getAppointments(),
    getCaptures(),
    getGoals(),
    getJournalEntries(shiftDayKey(today, -JOURNAL_LOOKBACK_DAYS), today),
    getFinanceInputs(),
    getReview('week', lastMonday),
  ]);

  const lastWeek = lastWeekReview(lastReview, today);
  const overview = financeOverview(finance, today);
  // Last week, whole: its spending against the weeks before it. The week in
  // progress is never compared with whole weeks.
  const lastWeekFigures = weekFigures({
    profile,
    dailyLogs,
    tasks,
    goals,
    journalEntries,
    transactions: finance.transactions,
    // A refund paired with its purchase reduces the purchase's spending (ADR 0055).
    refunds: refundPairs(finance.transactions, finance.refundLinks ?? []),
    captures,
    from: lastMonday,
    today,
    timezone: env.timezone,
  });

  const needs = needsYou({
    appointments,
    tasks,
    // The ones the capture log shows, so each one counted can be opened there.
    captures: captures.slice(0, limits.captureLogCount),
    lastWeek,
    today,
    now,
  });
  const notes = worthNoting({
    habits: profile.habits,
    dailyLogs,
    today,
    lastWeek,
    spending: lastWeekFigures.spending,
    netWorth: overview.asOf === null ? null : { value: overview.netWorth, change30: overview.changes.days30 },
  });
  const tiles = homeTiles({ habits: profile.habits, dailyLogs, today, finance: overview, goals, journalEntries });

  return (
    <section id="screen-home" className="screen is-active">
      <div className="screen-grid">
        <CheckinPanel day={typeof checkin === 'string' ? checkin : undefined} />
        <NeedsYou needs={needs} />
        <WorthNoting notes={notes} />
        <HomeTiles tiles={tiles} today={today} worth={worthChart(overview.history, today)} />
      </div>
    </section>
  );
}
