import { ageLabel, ageTitle, initials } from '@/components/format.js';

/**
 * The board of open tasks, ported from design/mockup.html's
 * `#card-crm-board`: four columns, a count on each, one ticket per task.
 * Everything on it is computed by the page (columns, ages, people), so this
 * only draws.
 *
 * Left out of the port on purpose (docs/spec.md): the Search button, and the
 * drag the mockup's grab cursor implied. By person arrives with its own
 * ticket.
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

/** @param {{ columns: Record<import('@/lib/domain/types.js').DisplayBand, BoardTicket[]> }} props */
export default function CrmBoard({ columns }) {
  return (
    <article id="card-crm-board" className="card span-12">
      <div className="card-head">
        <span className="eyebrow">Board</span>
      </div>
      <div className="card-body">
        <div className="board">
          {COLUMNS.map(({ band, label }) => (
            <div key={band} className={'col-' + band}>
              <div className="col-head">
                <span className="name">{label}</span>
                <span className="count num">{columns[band].length}</span>
              </div>
              <div className="col-scroll">
                {columns[band].map((ticket) => (
                  <Ticket key={ticket.task.id} {...ticket} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

/** @param {BoardTicket} props */
function Ticket({ task, person, age }) {
  return (
    <div className="ticket">
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
    </div>
  );
}
