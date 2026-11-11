import Link from 'next/link';

import { dayKeyToUtcDate, initials } from '@/components/format.js';
import { today } from '@/lib/domain/dates.js';
import { lastWeekFrom, lastWeekReview } from '@/lib/domain/derive/review.js';
import { reviewAddress } from '@/lib/domain/addresses.js';
import { getProfile, getReview } from '@/lib/store.js';

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
  // Last week's review is the only thing the lever comes from (#241). A read of
  // the saved value: no model, no integration (rule 3).
  const last = lastWeekReview(await getReview('week', lastWeekFrom(todayKey)), todayKey);

  return (
    <article id="card-today" className="card span-12">
      <TodayFocus focus={profile.focus} last={last} />
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
 * The focus line: last week's lever when its review is complete with one,
 * else the profile's focus. Under it, only when the lever is missing, a true
 * sentence about why: no review of last week yet, or one not finished (even if
 * a lever is typed in the draft -- a draft is not a decision).
 *
 * @param {{ focus: string, last: import('@/lib/domain/derive/review.js').LastWeekReview }} props
 */
export function TodayFocus({ focus, last }) {
  return (
    <div className="today-focus">
      <span className="eyebrow">{last.lever ? 'This week\u2019s lever' : 'Today\u2019s focus'}</span>
      <p className="focus-text">{last.lever ?? focus}</p>
      {last.lever ? <span className="caption">Set in last week&rsquo;s review</span> : null}
      {last.pending ? (
        <span className="caption">
          {last.started ? 'Last week\u2019s review is not finished' : 'No lever yet'} &middot;{' '}
          <Link className="link-btn" href={reviewAddress(last.from)}>
            {last.started ? 'Finish it' : 'Review last week'}
          </Link>
        </span>
      ) : null}
    </div>
  );
}

/** @param {string} dayKey */
function formatDayKey(dayKey) {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(dayKeyToUtcDate(dayKey));
}
