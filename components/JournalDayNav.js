'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { journalHref } from '@/components/journal.js';

/**
 * The Journal's day header (#159): previous and next step one day, Today
 * returns, and the date input jumps to any past day. Next stops at today --
 * no day after it can be written about -- and the input goes no further.
 *
 * Day keys come from the server (`lib/domain/dates.js` in USER_TIMEZONE):
 * the browser's own clock and zone never decide what today is.
 *
 * @param {{ dayKey: string, label: string, previousDayKey: string, nextDayKey: string | null, todayKey: string }} props
 *   `nextDayKey` is null on today
 */
export default function JournalDayNav({ dayKey, label, previousDayKey, nextDayKey, todayKey }) {
  const router = useRouter();

  return (
    <div className="journal-day">
      <Link className="icon-btn" href={journalHref(previousDayKey)} aria-label="Previous day">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M8.5 3L4.5 7l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <span className="subhead">{label}</span>
      {nextDayKey === null ? (
        <button type="button" className="icon-btn" aria-label="Next day" disabled>
          <NextIcon />
        </button>
      ) : (
        <Link className="icon-btn" href={journalHref(nextDayKey)} aria-label="Next day">
          <NextIcon />
        </Link>
      )}
      <Link className="btn-ghost" href={journalHref(todayKey)} aria-current={dayKey === todayKey ? 'date' : undefined}>
        Today
      </Link>
      <input
        className="input"
        type="date"
        aria-label="Go to day"
        value={dayKey}
        max={todayKey}
        onChange={(event) => {
          if (event.target.value !== '') router.push(journalHref(event.target.value));
        }}
      />
    </div>
  );
}

function NextIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M5.5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
