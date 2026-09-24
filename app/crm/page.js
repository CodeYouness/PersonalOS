import CrmBoard, { crmHref } from '@/components/CrmBoard.js';
import CrmDetail, { CrmDetailEmpty } from '@/components/CrmDetail.js';
import { provenanceLabel } from '@/components/format.js';
import { toDayKey, today } from '@/lib/domain/dates.js';
import { boardColumns, personGroups, ticketAge } from '@/lib/domain/derive/tasks.js';
import { getPeople, getPersonForTask, getProducingCapture, getTask, getTasks } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/** @typedef {import('@/components/CrmBoard.js').BoardTicket} BoardTicket */
/** @typedef {import('@/lib/domain/types.js').Task} Task */

/**
 * The CRM screen, ported from design/mockup.html's `#screen-crm`: "who is
 * waiting on me, and how urgently" (docs/spec.md). A server component that
 * reads the tasks once per request and derives the columns and every
 * ticket's age here -- `todayKey` included, since lib/domain/dates.js has no
 * configured timezone in the browser (ADR 0012).
 *
 * `?task=<id>` selects a task and opens the detail panel (#53). An id that
 * no longer exists -- deleted, undone from the capture log -- selects
 * nothing rather than failing. `?view=person` shows the same open tasks
 * grouped by person (#56); anything else is the board.
 *
 * @param {{ searchParams: Promise<{ task?: string | string[], view?: string | string[] }> }} props
 */
export default async function CrmScreen({ searchParams }) {
  const { task: taskParam, view: viewParam } = await searchParams;
  /** @type {import('@/components/CrmBoard.js').CrmView} */
  const view = viewParam === 'person' ? 'person' : 'board';
  const selected = typeof taskParam === 'string' ? await getTask(taskParam) : null;
  const todayKey = today();
  const tasks = await getTasks();

  // One ticket per open task, each read once; both views draw from these.
  const openTickets = await Promise.all(
    tasks
      .filter((task) => task.completedAt === null)
      .map(async (task) => ({
        task,
        person: await getPersonForTask(task.id),
        age: ticketAge(task, todayKey, toDayKey),
      }))
  );
  /** @type {Map<string, BoardTicket>} */
  const tickets = new Map();
  for (const ticket of openTickets) tickets.set(ticket.task.id, ticket);
  // Every task a derivation hands back is open, and every open task has a
  // ticket: both sides filter the same `tasks` on `completedAt === null`.
  /** @param {Task[]} group */
  const ticketsFor = (group) => group.map((task) => /** @type {BoardTicket} */ (tickets.get(task.id)));

  const columns = /** @type {Record<import('@/lib/domain/types.js').DisplayBand, BoardTicket[]>} */ (
    Object.fromEntries(
      Object.entries(boardColumns(tasks, todayKey)).map(([band, group]) => [band, ticketsFor(group)])
    )
  );
  /** @param {string} taskId */
  const personOf = (taskId) => tickets.get(taskId)?.person?.id ?? null;
  const groups = personGroups(tasks, personOf, todayKey).map(({ tasks: group }) => {
    const grouped = ticketsFor(group);
    return { person: grouped[0].person, tickets: grouped };
  });

  return (
    <section id="screen-crm" className="screen is-active">
      <div className="screen-grid">
        <CrmBoard
          view={view}
          columns={columns}
          groups={groups}
          selectedId={selected?.id ?? null}
        />
        {selected === null ? (
          <CrmDetailEmpty />
        ) : (
          <CrmDetail
            key={selected.id}
            task={selected}
            person={await getPersonForTask(selected.id)}
            people={await getPeople()}
            provenance={await provenanceFor(selected, todayKey)}
            closeHref={crmHref(view)}
          />
        )}
      </div>
    </section>
  );
}

/**
 * @param {import('@/lib/domain/types.js').Task} task
 * @param {string} todayKey
 */
async function provenanceFor(task, todayKey) {
  const capture = await getProducingCapture(task.id);
  return provenanceLabel(
    { createdDayKey: toDayKey(new Date(task.createdAt)), source: task.source, route: capture?.route ?? null },
    todayKey
  );
}
