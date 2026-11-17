import Link from 'next/link';

import OpenCaptureLog from '@/components/OpenCaptureLog.js';
import { formatEuro, formatMoneyChange, formatPercentChange, percent, shortDate } from '@/components/format.js';

/**
 * Home's three sections under the check-in (ADR 0040): what needs you, what
 * is worth noting, and four tiles. Presentational: the page reads the store
 * and derives (`lib/domain/derive/home.js`), these only draw what they are
 * handed -- so a check-in answer, which refreshes the route, redraws them
 * from the server, never from state kept here.
 *
 * A section exists only when it has something to say: "Needs you" says one
 * calm line when nothing does, "Worth noting" is absent when nothing differs.
 * Rows are plain; the state colour is only for an overdue task.
 */

/**
 * @param {{ needs: import('@/lib/domain/derive/home.js').NeedsYou }} props
 */
export function NeedsYou({ needs }) {
  return (
    <section className="home-section span-12" aria-labelledby="home-needs">
      <h2 id="home-needs" className="subhead">Needs you</h2>
      {needs.empty ? (
        <p className="home-calm">Nothing needs you right now.</p>
      ) : (
        <ul className="home-rows">
          {needs.appointments.map((appointment) => (
            <li key={appointment.id}>
              <div className="home-row">
                <span className="home-row-lead num">{appointment.startTime}</span>
                <span className="home-row-text">{appointment.title}</span>
              </div>
            </li>
          ))}
          {needs.tasks.map(({ task, overdueDays, href }) => (
            <li key={task.id}>
              <Link className="home-row" href={href}>
                <span className={'home-row-lead' + (overdueDays > 0 ? ' is-overdue' : '')}>
                  {overdueDays > 0 ? 'Overdue ' + overdueDays + 'd' : 'Today'}
                </span>
                <span className="home-row-text">{task.title}</span>
              </Link>
            </li>
          ))}
          {needs.moreTasks !== null && (
            <li>
              <Link className="home-row" href={needs.moreTasks.href}>
                <span className="home-row-lead" />
                <span className="home-row-text">
                  And {needs.moreTasks.count} more {needs.moreTasks.count === 1 ? 'task' : 'tasks'}
                </span>
              </Link>
            </li>
          )}
          {needs.unclassified > 0 && (
            <li>
              <OpenCaptureLog className="home-row">
                <span className="home-row-lead num">{needs.unclassified}</span>
                <span className="home-row-text">
                  {needs.unclassified === 1 ? 'Capture not filed yet' : 'Captures not filed yet'}
                </span>
              </OpenCaptureLog>
            </li>
          )}
          {needs.review !== null && (
            <li>
              <Link className="home-row" href={needs.review.href}>
                <span className="home-row-lead">Review</span>
                <span className="home-row-text">
                  {needs.review.started ? 'Last week’s review is not finished' : 'Last week is not reviewed yet'}
                </span>
              </Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * Absent when there is nothing worth a sentence.
 *
 * @param {{ notes: import('@/lib/domain/derive/home.js').Note[] }} props
 */
export function WorthNoting({ notes }) {
  if (notes.length === 0) return null;
  return (
    <section className="home-section span-12" aria-labelledby="home-notes">
      <h2 id="home-notes" className="subhead">Worth noting</h2>
      <ul className="home-rows">
        {notes.map((note) => (
          <li key={note.kind + (note.kind === 'missed' ? ':' + note.label : '')}>
            <Link className="home-row" href={note.href}>
              <span className="home-row-text">{noteSentence(note)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One sentence per note, each with its number and what it is compared with:
 * descriptive, no cause, no verdict (ADR 0037).
 *
 * @param {import('@/lib/domain/derive/home.js').Note} note
 * @returns {string}
 */
export function noteSentence(note) {
  switch (note.kind) {
    case 'lever':
      return 'This week’s lever: ' + note.lever;
    case 'missed':
      return note.label + ' not kept on its last ' + note.days + ' scheduled days.';
    case 'kept':
      return (
        'Habits kept ' + note.week.kept + ' of ' + note.week.scheduled + ' times this week (' +
        percent(/** @type {number} */ (note.week.rate)) + '), against ' +
        percent(/** @type {number} */ (note.baseline.rate)) + ' over the four weeks before.'
      );
    case 'spending':
      return (
        'Last week’s spending was ' + formatEuro(note.total) + ', ' + percent(Math.abs(note.ratio)) + ' ' +
        (note.ratio > 0 ? 'more' : 'less') + ' than the ' + formatEuro(note.mean) + ' a week of the ' +
        note.weeks + ' weeks before.'
      );
    case 'net-worth':
      return (
        'Net worth is ' + (note.change > 0 ? 'up ' : 'down ') + formatEuro(Math.abs(note.change)) + ' (' +
        formatPercentChange(note.ratio) + ') over 30 days.'
      );
  }
}

/**
 * Four tiles, two by two on a phone and in one row on a desktop: one number,
 * one label, the whole tile the link.
 *
 * @param {{ tiles: import('@/lib/domain/derive/home.js').HomeTiles, today: string }} props
 */
export function HomeTiles({ tiles, today }) {
  const { habits, money, goals, journal } = tiles;
  const rows = [
    {
      key: 'habits',
      href: habits.href,
      value: habits.active === 0 ? 'None' : habits.rate === null ? '—' : percent(habits.rate),
      label: habits.active === 0 ? 'No habits yet' : 'Habits kept this week',
    },
    {
      key: 'money',
      href: money.href,
      value: money.netWorth === null ? '—' : formatEuro(money.netWorth),
      label:
        money.netWorth === null
          ? 'No balance yet'
          : money.change30 === null
            ? 'Net worth'
            : 'Net worth · ' + formatMoneyChange(money.change30) + ' in 30 days',
    },
    {
      key: 'goals',
      href: goals.href,
      value: String(goals.open),
      label: goals.open === 1 ? 'Open goal' : 'Open goals',
    },
    {
      key: 'journal',
      href: journal.href,
      value: journal.thisWeek > 0 || journal.last === null ? String(journal.thisWeek) : shortDate(journal.last, today),
      label:
        journal.thisWeek > 0
          ? journal.thisWeek === 1 ? 'Journal entry this week' : 'Journal entries this week'
          : journal.last === null ? 'No journal entry yet' : 'Last journal entry',
    },
  ];
  return (
    <nav className="home-tiles span-12" aria-label="At a glance">
      {rows.map((tile) => (
        <Link key={tile.key} className="home-tile" href={tile.href} data-tile={tile.key}>
          <span className="home-tile-value num">{tile.value}</span>
          <span className="home-tile-label">{tile.label}</span>
        </Link>
      ))}
    </nav>
  );
}
