import { dayKeyToUtcDate } from '@/components/format.js';
import { env } from '@/lib/config/env.js';
import { today, weekDayKeys } from '@/lib/domain/dates.js';
import { dayAgenda, weekDensity } from '@/lib/domain/derive/calendar.js';
import { getAppointments } from '@/lib/store.js';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * The current week's schedule, ported from design/mockup.html's
 * `#card-calendar`. Read-only, no client JS: day selection is a `?day=`
 * link the server re-renders against, not client state -- the same "loading
 * a page never calls the model or an integration" posture every other card
 * takes. Always the current week; there is no forward/backward navigation
 * yet, and no period selector -- this card picks a day, it does not
 * aggregate over a window.
 *
 * @param {{ day?: string }} props the `day` search param, already resolved
 *   by the page; anything that is not one of this week's own day keys falls
 *   back to today.
 */
export default async function CalendarCard({ day }) {
  const appointments = await getAppointments();
  const todayKey = today();
  const week = weekDayKeys(todayKey);
  const selectedDay = typeof day === 'string' && week.includes(day) ? day : todayKey;

  const densities = weekDensity(appointments, week);
  const agenda = dayAgenda(appointments, selectedDay);
  // A server component renders once per request (see TodayCard), so "now"
  // is a snapshot at render time, not a ticking clock -- and it only means
  // anything on today's own agenda.
  const nowTime = selectedDay === todayKey ? currentTime(env.timezone) : null;

  return (
    <article id="card-calendar" className="card span-8">
      <div className="card-head">
        <span className="eyebrow">Calendar</span>
        <span className="caption">{formatWeekCaption(week)}</span>
      </div>
      <div className="card-body">
        <div className="week">
          {week.map((dayKey, index) => (
            <a
              key={dayKey}
              href={'?day=' + dayKey}
              className={
                'day' +
                (dayKey === todayKey ? ' is-today' : '') +
                (dayKey === selectedDay ? ' is-selected' : '')
              }
            >
              <div className="day-name">{DAY_LABELS[index]}</div>
              <div className="day-num num">{Number(dayKey.slice(8))}</div>
              <div className="day-dots">
                {Array.from({ length: densities[index] }, (_, dot) => (
                  <i key={dot} />
                ))}
              </div>
            </a>
          ))}
        </div>
        {agenda.length === 0 ? <p className="caption">Nothing scheduled.</p> : null}
        {renderAgenda(agenda, nowTime)}
      </div>
    </article>
  );
}

/**
 * Interleaves the now-line at the point in the agenda where "now" falls,
 * or after everything when the day is over.
 *
 * @param {import('@/lib/domain/types.js').Appointment[]} agenda
 * @param {string | null} nowTime HH:MM, or null when the selected day is not today
 */
function renderAgenda(agenda, nowTime) {
  const rows = [];
  let nowPlaced = nowTime === null;

  for (const appointment of agenda) {
    if (!nowPlaced && /** @type {string} */ (nowTime) <= appointment.startTime) {
      rows.push(<NowLine key="now" time={/** @type {string} */ (nowTime)} />);
      nowPlaced = true;
    }
    rows.push(
      <div className="event" key={appointment.id}>
        <span className="event-time num">{appointment.startTime}</span>
        <span>
          <span className="event-title">{appointment.title}</span>
          <br />
          <span className="event-cal">{appointment.calendarLabel}</span>
        </span>
      </div>
    );
  }
  if (!nowPlaced) rows.push(<NowLine key="now" time={/** @type {string} */ (nowTime)} />);

  return rows;
}

/** @param {{ time: string }} props */
function NowLine({ time }) {
  return (
    <div className="now-line">
      <span className="label num">{time}</span>
      <span className="rule" />
    </div>
  );
}

/**
 * @param {string} timezone
 * @returns {string} HH:MM, 24-hour, in the given timezone
 */
function currentTime(timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(new Date());
}

/** @param {string[]} week Monday through Sunday day keys */
function formatWeekCaption(week) {
  const format = (/** @type {string} */ dayKey) =>
    new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      dayKeyToUtcDate(dayKey)
    );
  return format(week[0]) + ' – ' + format(week[6]);
}
