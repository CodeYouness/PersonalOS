import { initials } from '@/components/format.js';
import { today } from '@/lib/domain/dates.js';
import { getProfile } from '@/lib/store.js';

/**
 * Who you are and what today is about. Read-only, ported from
 * design/mockup.html's `#card-today`.
 *
 * The mockup also shows a live clock ("09:41"). A server component renders
 * once per request and would go stale the moment the tab stays open, which
 * reads as more broken than no clock at all -- so this shows the date only.
 * A ticking clock is a client-component problem for later, if it's ever
 * worth the interactivity budget.
 */
export default async function TodayCard() {
  const profile = await getProfile();
  const todayKey = today();

  return (
    <article id="card-today" className="card span-12">
      <div className="today-focus">
        <span className="eyebrow">Today&rsquo;s focus</span>
        <p className="focus-text">{profile.focus}</p>
      </div>
      <div className="today-side">
        <div className="today-who">
          <span className="avatar-lg">{initials(profile.name)}</span>
          <span>
            <span className="subhead" style={{ display: 'block' }}>
              {profile.name}
            </span>
            <span className="caption">
              {profile.role} · {profile.city}
            </span>
          </span>
        </div>
        <span className="caption">{formatDayKey(todayKey)}</span>
      </div>
    </article>
  );
}

/**
 * A day key has no time and no zone (lib/domain/dates.js), so it is parsed
 * as UTC midnight purely to hand a Date to Intl -- this is formatting, not a
 * second "what day is it" computation.
 *
 * @param {string} dayKey
 */
function formatDayKey(dayKey) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const instant = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(instant);
}
