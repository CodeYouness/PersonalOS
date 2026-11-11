import Link from 'next/link';

import { dayKeyToUtcDate } from '@/components/format.js';
import { reviewAddress } from '@/lib/domain/addresses.js';
import { shiftDayKey } from '@/lib/domain/dates.js';

/**
 * The Review header's week stepper (#239): previous and next step one week,
 * next is disabled on the week containing today -- there is nothing to review
 * after it. The week is in the address, so each step is a link. The range is
 * Monday to Sunday, "5 Jan – 11 Jan", whether or not the week is over.
 *
 * @param {{ week: import('@/lib/domain/review-week.js').ReviewWeek }} props
 */
export default function ReviewWeekNav({ week }) {
  return (
    <div className="week-nav">
      <Link className="btn-ghost" href={reviewAddress(week.previous)} aria-label="Previous week">
        &larr;
      </Link>
      <span className="range num">{rangeLabel(week.from)}</span>
      {week.next === null ? (
        <button type="button" className="btn-ghost" aria-label="Next week" disabled>
          &rarr;
        </button>
      ) : (
        <Link className="btn-ghost" href={reviewAddress(week.next)} aria-label="Next week">
          &rarr;
        </Link>
      )}
    </div>
  );
}

/**
 * @param {string} monday
 * @returns {string}
 */
function rangeLabel(monday) {
  return shortDay(monday) + ' – ' + shortDay(shiftDayKey(monday, 6));
}

/** @param {string} dayKey */
function shortDay(dayKey) {
  return dayKeyToUtcDate(dayKey).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
