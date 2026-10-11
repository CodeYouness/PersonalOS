import JournalDayNav from '@/components/JournalDayNav.js';
import JournalWrite from '@/components/JournalWrite.js';
import { dayHeading, dayLabel } from '@/components/format.js';
import { formatTimeInZone, isDayKey, shiftDayKey, today } from '@/lib/domain/dates.js';
import { getJournalDay } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Journal screen (#159), ported from design/mockup.html's
 * `#screen-journal`: one day at a time, the write box above the day's
 * entries, oldest first. No Home card (spec #158).
 *
 * `?date=YYYY-MM-DD` selects the day; a malformed one, or one after today,
 * opens today instead. "Today" is today in USER_TIMEZONE (rule 4), and each
 * entry's time is read in that zone here, on the server -- the browser's
 * zone never decides either. Loading it reads what is saved and never calls
 * the model (rule 3).
 *
 * @param {{ searchParams: Promise<{ date?: string | string[] }> }} props
 */
export default async function JournalScreen({ searchParams }) {
  const { date } = await searchParams;
  const todayKey = today();
  const dayKey = isDayKey(date) && /** @type {string} */ (date) <= todayKey ? /** @type {string} */ (date) : todayKey;
  const entries = await getJournalDay(dayKey);

  return (
    <section id="screen-journal" className="screen is-active">
      <div className="screen-grid">
        <article id="card-journal" className="card span-8">
          <div className="card-head">
            <span className="eyebrow">Journal</span>
            <JournalDayNav
              dayKey={dayKey}
              label={dayHeading(dayKey)}
              previousDayKey={shiftDayKey(dayKey, -1)}
              nextDayKey={dayKey === todayKey ? null : shiftDayKey(dayKey, 1)}
              todayKey={todayKey}
            />
          </div>
          <div className="card-body">
            <JournalWrite
              key={dayKey}
              dayKey={dayKey}
              placeholder={dayKey === todayKey ? 'What happened today…' : 'What happened on ' + dayLabel(dayKey) + '…'}
            />
            <div className="divider" />
            {entries.length === 0 ? (
              <p className="caption">Nothing written on this day</p>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="log-item journal-entry">
                  <div className="log-top">
                    <span className="caption">{formatTimeInZone(new Date(entry.createdAt))}</span>
                  </div>
                  <p className="log-text">{entry.text}</p>
                </div>
              ))
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
