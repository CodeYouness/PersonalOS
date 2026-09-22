import HabitsHistory from '@/components/HabitsHistory.js';
import HabitsManager from '@/components/HabitsManager.js';
import HabitsSummary from '@/components/HabitsSummary.js';
import { dayKeysEndingAt, today } from '@/lib/domain/dates.js';
import { historyRows, STREAK_WINDOW_DAYS, streak, windowSummary } from '@/lib/domain/derive/habits.js';
import { getDailyLogs, getProfile } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** How far back the summary and history look (docs/spec.md: "the last 30 days"). */
const HISTORY_WINDOW_DAYS = 30;

/**
 * The Habits screen, ported from design/mockup.html's `#screen-habits`: the
 * summary strip (`#card-habits-summary`), the management card
 * (`#card-habits-manage`) and the history heatmap (`#card-habits-history`).
 *
 * A server component that reads the list and the window once per request,
 * with only the editing and the corrections as client islands -- the same
 * split as HabitsCard and HabitsList. Every cell, rate and summary number is
 * derived here, so the browser is never asked to decide what a day means,
 * and a tick or a correction moves them on the refresh that follows.
 *
 * The logs are read once over the streak's longer window and sliced down for
 * the thirty-day cards: the streak on this screen has to be the number the
 * home card shows, and a second read of the same days to get it would only
 * be a second chance to disagree. `todayKey` is computed here because
 * lib/domain/dates.js has no configured timezone in the browser (ADR 0012).
 */
export default async function HabitsScreen() {
  const profile = await getProfile();
  const todayKey = today();
  const streakStart = dayKeysEndingAt(STREAK_WINDOW_DAYS, todayKey)[0];
  const streakLogs = await getDailyLogs(streakStart, todayKey);
  const windowLogs = streakLogs.slice(-HISTORY_WINDOW_DAYS);

  // Every habit, not only today's: one archived last week still owns its
  // row, and its days, for the days it was active.
  const rows = historyRows(profile.habits, windowLogs);
  const summary = windowSummary(profile.habits, windowLogs);
  const streakDays = streak(profile.habits, streakLogs, todayKey);

  return (
    <section id="screen-habits" className="screen is-active">
      <div className="screen-grid">
        <HabitsSummary summary={summary} streakDays={streakDays} />
        <HabitsManager habits={profile.habits} todayKey={todayKey} />
        <HabitsHistory rows={rows} />
      </div>
    </section>
  );
}
