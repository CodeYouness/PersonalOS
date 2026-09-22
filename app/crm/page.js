import CrmBoard from '@/components/CrmBoard.js';
import { toDayKey, today } from '@/lib/domain/dates.js';
import { boardColumns, ticketAge } from '@/lib/domain/derive/tasks.js';
import { getPersonForTask, getTasks } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The CRM screen, ported from design/mockup.html's `#screen-crm`: "who is
 * waiting on me, and how urgently" (docs/spec.md). A server component that
 * reads the tasks once per request and derives the columns and every
 * ticket's age here -- `todayKey` included, since lib/domain/dates.js has no
 * configured timezone in the browser (ADR 0012).
 */
export default async function CrmScreen() {
  const todayKey = today();
  const columns = boardColumns(await getTasks(), todayKey);

  /** @param {import('@/lib/domain/types.js').Task} task */
  const ticket = async (task) => ({
    task,
    person: await getPersonForTask(task.id),
    age: ticketAge(task, todayKey, toDayKey),
  });

  const tickets = /** @type {Record<import('@/lib/domain/types.js').DisplayBand, import('@/components/CrmBoard.js').BoardTicket[]>} */ (
    Object.fromEntries(
      await Promise.all(
        Object.entries(columns).map(async ([band, tasks]) => [band, await Promise.all(tasks.map(ticket))])
      )
    )
  );

  return (
    <section id="screen-crm" className="screen is-active">
      <div className="screen-grid">
        <CrmBoard columns={tickets} />
      </div>
    </section>
  );
}
