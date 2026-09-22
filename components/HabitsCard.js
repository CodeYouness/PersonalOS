import Link from 'next/link';

import { percent } from '@/components/format.js';
import HabitsList from '@/components/HabitsList.js';
import { dayKeysEndingAt, today } from '@/lib/domain/dates.js';
import { completionRatio, isActiveOn, streak } from '@/lib/domain/derive/habits.js';
import { getDailyLogs, getProfile } from '@/lib/store.js';

/** The ring's radius, matching design/mockup.html's `#card-habits` SVG. */
const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** How far back the streak looks (docs/spec.md: "the last 365 days"). */
const STREAK_WINDOW_DAYS = 365;

/**
 * The compact Habits card, ported from design/mockup.html's `#card-habits`.
 * "Open" goes to the Habits screen, which #38 built; the summary strip and
 * history heatmap on it are still #40 and #39.
 *
 * A server component for the same reason CalendarCard is one -- the ring,
 * streak and every habit's starting value are read once per request, no
 * loading flash. Only the tap targets (`HabitsList`) are a client island.
 */
export default async function HabitsCard() {
  const profile = await getProfile();
  const todayKey = today();
  // Only today's active habits are shown in the list, but the streak looks
  // back 365 days -- a habit archived since must still count for the days
  // it *was* active, so streak() gets every habit, not just today's.
  const activeToday = profile.habits.filter((habit) => isActiveOn(habit, todayKey));

  const windowStart = dayKeysEndingAt(STREAK_WINDOW_DAYS, todayKey)[0];
  const windowLogs = await getDailyLogs(windowStart, todayKey);
  const todayLog = windowLogs[windowLogs.length - 1];

  const ratio = completionRatio(activeToday, todayLog);
  const streakDays = streak(profile.habits, windowLogs, todayKey);
  const streakLabel = streakDays >= STREAK_WINDOW_DAYS ? STREAK_WINDOW_DAYS + '+' : String(streakDays);

  const offset = RING_CIRCUMFERENCE * (1 - ratio);

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
          <div className="ring">
            <svg width="76" height="76" aria-hidden="true">
              <circle className="ring-track" cx="38" cy="38" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="6" />
              <circle
                className="ring-progress"
                cx="38"
                cy="38"
                r={RING_RADIUS}
                fill="none"
                stroke="currentColor"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={offset}
              />
            </svg>
            <div className="ring-value num">{percent(ratio)}</div>
          </div>
          <div>
            <div className="streak-num num">{streakLabel}</div>
            <div className="caption">day streak</div>
          </div>
        </div>
        {activeToday.length === 0 ? (
          <p className="caption">No active habits.</p>
        ) : (
          <HabitsList
            key={JSON.stringify(todayLog.habits)}
            habits={activeToday}
            todayKey={todayKey}
            values={todayLog.habits}
          />
        )}
      </div>
    </article>
  );
}
