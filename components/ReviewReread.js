import Link from 'next/link';

import { dayLabel } from '@/components/format.js';
import { journalHref } from '@/components/journal.js';
import { formatTimeInZone } from '@/lib/domain/dates.js';

/**
 * Step 2 of the Review screen (#239), "Reread": the week's journal entries,
 * oldest first (the order `weekFigures` returns), each with its day and time
 * and a link that opens that day on the Journal screen. The entry's text is
 * shown whole -- the original is never shortened (rule 7). Times are read in
 * USER_TIMEZONE here, on the server.
 *
 * @param {{ entries: import('@/lib/domain/types.js').JournalEntry[] }} props
 */
export default function ReviewReread({ entries }) {
  return (
    <section className="review-step" id="review-reread">
      <div className="step-head">
        <span className="n">2</span>
        <h3 className="title">Reread</h3>
        <span className="caption">{entries.length === 1 ? '1 entry' : entries.length + ' entries'}</span>
      </div>
      {entries.length === 0 ? (
        <p className="caption">No journal entries this week.</p>
      ) : (
        entries.map((entry) => (
          <div className="review-entry" key={entry.id}>
            <div className="when">
              <span className="num">{dayLabel(entry.date)}</span>
              <span className="caption num">{formatTimeInZone(new Date(entry.saidAt))}</span>
              <Link className="link-btn" href={journalHref(entry.date)}>
                Open day
              </Link>
            </div>
            <p>{entry.text}</p>
          </div>
        ))
      )}
    </section>
  );
}
