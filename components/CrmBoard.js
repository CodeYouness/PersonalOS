import Link from 'next/link';

import { ageLabel, ageTitle, initials, personLabel } from '@/components/format.js';

/**
 * The CRM screen's main card, ported from design/mockup.html's
 * `#card-crm-board`, in two views (docs/spec.md):
 *
 * - **Board** -- four columns, a count on each, one ticket per open task.
 * - **By person** (#56) -- the same tickets grouped by who they are owed
 *   to, whoever waits hardest first, the tasks owed to no one last. The
 *   mockup's "By person" button is the toggle between them.
 *
 * Everything is computed by the page (columns, groups, ages, people), so
 * this only draws. A ticket is a link to `?task=<id>`, keeping the view:
 * the selection lives in the URL, by id, so a reload keeps it and a capture
 * landing a new task never moves it onto another one.
 *
 * Left out of the port on purpose (docs/spec.md): the Search button, and the
 * drag the mockup's grab cursor implied.
 */

/** @type {{ band: import('@/lib/domain/types.js').DisplayBand, label: string }[]} */
const COLUMNS = [
  { band: 'overdue', label: 'Overdue' },
  { band: 'today', label: 'Today' },
  { band: 'week', label: 'This week' },
  { band: 'later', label: 'Later' },
];

/**
 * @typedef {object} BoardTicket
 * @property {import('@/lib/domain/types.js').Task} task
 * @property {import('@/lib/domain/types.js').Person | null} person
 * @property {number} age whole days since the task was created
 */

/**
 * @typedef {object} PersonGroup
 * @property {import('@/lib/domain/types.js').Person | null} person null for "No one"
 * @property {BoardTicket[]} tickets
 */

/** @typedef {'board' | 'person'} CrmView */

/** @type {{ value: CrmView, label: string }[]} */
const VIEWS = [
  { value: 'board', label: 'Board' },
  { value: 'person', label: 'By person' },
];

/**
 * A CRM address. One place builds them, so selecting a task keeps the view
 * and closing the panel keeps it too.
 *
 * @param {CrmView} view
 * @param {string | null} [taskId]
 */
export function crmHref(view, taskId = null) {
  const params = new URLSearchParams();
  if (view === 'person') params.set('view', 'person');
  if (taskId !== null) params.set('task', taskId);
  const query = params.toString();
  return query === '' ? '/crm' : '/crm?' + query;
}

/**
 * @param {{
 *   view: CrmView,
 *   columns: Record<import('@/lib/domain/types.js').DisplayBand, BoardTicket[]>,
 *   groups: PersonGroup[],
 *   selectedId: string | null,
 * }} props
 */
export default function CrmBoard({ view, columns, groups, selectedId }) {
  const byPerson = view === 'person';
  /** @param {BoardTicket} ticket */
  const renderTicket = (ticket) => (
    <Ticket
      key={ticket.task.id}
      {...ticket}
      href={crmHref(view, ticket.task.id)}
      isSelected={ticket.task.id === selectedId}
    />
  );

  return (
    <article id="card-crm-board" className="card span-8">
      <div className="card-head">
        <span className="eyebrow">{byPerson ? 'By person' : 'Board'}</span>
        <nav className="view-toggle" aria-label="View">
          {VIEWS.map(({ value, label }) => (
            <Link
              key={value}
              href={crmHref(value, selectedId)}
              scroll={false}
              className="btn-ghost"
              aria-current={view === value ? 'page' : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <div className={'card-body' + (byPerson ? ' is-grouped' : '')}>
        {byPerson ? (
          <PersonGroups groups={groups} renderTicket={renderTicket} />
        ) : (
          <div className="board">
            {COLUMNS.map(({ band, label }) => (
              <div key={band} className={'col-' + band}>
                <div className="col-head">
                  <span className="name">{label}</span>
                  <span className="count num">{columns[band].length}</span>
                </div>
                <div className="col-scroll">{columns[band].map(renderTicket)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * @param {{
 *   groups: PersonGroup[],
 *   renderTicket: (ticket: BoardTicket) => import('react').ReactNode,
 * }} props
 */
function PersonGroups({ groups, renderTicket }) {
  if (groups.length === 0) return <p className="caption">Nothing open.</p>;
  return (
    <div className="person-groups">
      {groups.map(({ person, tickets }) => (
        <section key={person?.id ?? 'no-one'} className="person-group">
          <div className="col-head">
            <span className="name">{person === null ? 'No one' : personLabel(person)}</span>
            <span className="count num">{tickets.length}</span>
          </div>
          <div className="person-tickets">{tickets.map(renderTicket)}</div>
        </section>
      ))}
    </div>
  );
}

/** @param {BoardTicket & { href: string, isSelected: boolean }} props */
function Ticket({ task, person, age, href, isSelected }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={'ticket' + (isSelected ? ' is-selected' : '')}
      aria-current={isSelected ? 'true' : undefined}
    >
      <div className="ticket-title">{task.title}</div>
      <div className="ticket-meta">
        {person !== null && (
          <span className="avatar" title={person.name}>
            {initials(person.name)}
          </span>
        )}
        <span className={'badge badge-' + task.temperature}>{task.temperature}</span>
        {task.tags.map((tag) => (
          <span key={tag} className="badge badge-tag">
            {tag}
          </span>
        ))}
        <span className="ticket-age num" title={ageTitle(age)}>
          {ageLabel(age)}
        </span>
      </div>
    </Link>
  );
}
