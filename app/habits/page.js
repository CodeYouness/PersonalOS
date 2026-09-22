import HabitsHistory from '@/components/HabitsHistory.js';
import HabitsManager from '@/components/HabitsManager.js';
import { dayKeysEndingAt, today } from '@/lib/domain/dates.js';
import { historyRows } from '@/lib/domain/derive/habits.js';
import { getDailyLogs, getProfile } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** How far back the history looks (docs/spec.md: "the last 30 days"). */
const HISTORY_WINDOW_DAYS = 30;

/**
 * The Habits screen, ported from design/mockup.html's `#screen-habits`.
 *
 * The management card (`#card-habits-manage`) and the history heatmap
 * (`#card-habits-history`) are here; the summary strip above them is #40,
 * and the grid gains its first row with it.
 *
 * A server component that reads the list and the window once per request,
 * with only the editing and the corrections as client islands -- the same
 * split as HabitsCard and HabitsList. Every cell and rate is derived here by
 * `historyRows`, so the browser is never asked to decide what a day means.
 * `todayKey` is computed here because lib/domain/dates.js has no configured
 * timezone in the browser (ADR 0012).
 */
export default async function HabitsScreen() {
  const profile = await getProfile();
  const todayKey = today();
  const windowStart = dayKeysEndingAt(HISTORY_WINDOW_DAYS, todayKey)[0];
  // Every habit, not only today's: one archived last week still owns its
  // row for the days it was active.
  const rows = historyRows(profile.habits, await getDailyLogs(windowStart, todayKey));

  return (
    <section id="screen-habits" className="screen is-active">
      <div className="screen-grid">
        <HabitsManager habits={profile.habits} todayKey={todayKey} />
        <HabitsHistory rows={rows} />
      </div>
    </section>
  );
}
