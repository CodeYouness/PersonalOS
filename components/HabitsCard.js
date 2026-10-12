import Link from 'next/link';

import { streakLabel } from '@/components/format.js';
import HabitsList from '@/components/HabitsList.js';
import HabitsRing from '@/components/HabitsRing.js';
import { dayKeysEndingAt, today } from '@/lib/domain/dates.js';
import { dayCompletion, habitsForDay, STREAK_WINDOW_DAYS, streak } from '@/lib/domain/derive/habits.js';
import { getDailyLogs, getProfile } from '@/lib/store.js';

/**
 * The compact Habits card, ported from design/mockup.html's `#card-habits`.
 * "Open" goes to the Habits screen, which #38, #39 and #40 built out.
 *
 * A server component for the same reason CalendarCard is one -- the ring,
 * streak and every habit's starting value are read once per request, no
 * loading flash. Only the tap targets (`HabitsList`) are a client island.
 *
 * The habits scheduled today come first; those with a day off follow, faded
 * and still tickable -- the Tuesday gym session happened -- and outside the
 * ring, which is completion over today's scheduled habits only (ADR 0029).
 */
export default async function HabitsCard() {
  const profile = await getProfile();
  const todayKey = today();
  // The list is today's active habits, split into scheduled and off. The
  // streak looks back 365 days -- a habit archived since must still count
  // for the days it *was* scheduled, so streak() gets every habit.
  const { scheduled, off } = habitsForDay(profile.habits, todayKey);

  const windowStart = dayKeysEndingAt(STREAK_WINDOW_DAYS, todayKey)[0];
  const windowLogs = await getDailyLogs(windowStart, todayKey);
  const todayLog = windowLogs[windowLogs.length - 1];

  // Only today's scheduled habits count, so a tick on a day off never moves
  // the ring; null, with nothing scheduled, is the ring's "Day off".
  const ratio = dayCompletion(profile.habits, todayLog);
  const streakDays = streak(profile.habits, windowLogs, todayKey);

  return (
    <article id="card-habits" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Habits</span>
        <Link className="btn-ghost" href="/habits">
          Open
        </Link>
      </div>
      <div className="card-body">
        <div className="ring-wrap">
          <HabitsRing ratio={ratio} />
          <div>
            <div className="streak-num num">{streakLabel(streakDays)}</div>
            <div className="caption">day streak</div>
          </div>
        </div>
        {scheduled.length + off.length === 0 ? (
          <p className="caption">No active habits.</p>
        ) : (
          <HabitsList
            key={JSON.stringify(todayLog.habits)}
            scheduled={scheduled}
            off={off}
            todayKey={todayKey}
            values={todayLog.habits}
          />
        )}
      </div>
    </article>
  );
}
