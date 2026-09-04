import { daysOverdue, dueToday, isOverdue } from '@/lib/domain/derive/tasks.js';
import { dayKeyRange, today } from '@/lib/domain/dates.js';
import { getPersonForTask, getTasks } from '@/lib/store.js';

/**
 * The ranked queue for right now, ported from design/mockup.html's
 * `#card-session`. Read-only: completing, editing or reordering a task is
 * this card's next commit, not this one.
 *
 * The mockup also has a "Blocked" section for tasks waiting on someone
 * else. It is left out here on purpose, not just deferred: the only signal
 * available is a task's `involves` link, and that link means "a person
 * takes part" (docs/domain.md), not "I am stalled waiting on them" -- a
 * task like "buy Mom's birthday gift" involves a person without waiting on
 * her for anything. Labelling it "blocked" would be worse than not showing
 * it. A real Blocked section needs its own signal (most likely a new link
 * relation), which is a domain decision for its own round, not a guess made
 * inline here.
 */
export default async function SessionCard() {
  const tasks = await getTasks();
  const todayKey = today();
  const open = tasks.filter((task) => task.completedAt === null);
  const now = dueToday(tasks, todayKey);

  const rows = [];
  for (const task of now) {
    const person = await getPersonForTask(task.id);
    rows.push({ task, person });
  }

  return (
    <article id="card-session" className="card span-8">
      <div className="card-head">
        <span className="eyebrow">Now</span>
        <span className="caption">
          {now.length} of {open.length} due today
        </span>
      </div>
      <div className="card-body">
        {rows.length === 0 ? (
          <p className="caption">Nothing due today.</p>
        ) : (
          <ul>
            {rows.map(({ task, person }, index) => (
              <li key={task.id} className="task-row">
                <span className="task-rank num">{String(index + 1).padStart(2, '0')}</span>
                <span className={'badge ' + badgeClassFor(task, todayKey)}>
                  <i className="dot" />
                  {badgeLabelFor(task, todayKey)}
                </span>
                <span className="task-main">
                  <span className="task-title">{task.title}</span>
                  <span className="task-person">{personLabel(person)}</span>
                </span>
                <span className="caption num">{dueLabel(task, todayKey)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

/**
 * @param {import('@/lib/domain/types.js').Task} task
 * @param {string} todayKey
 */
function badgeClassFor(task, todayKey) {
  return isOverdue(task, todayKey) ? 'badge-hot' : 'badge-' + task.temperature;
}

/**
 * @param {import('@/lib/domain/types.js').Task} task
 * @param {string} todayKey
 */
function badgeLabelFor(task, todayKey) {
  if (isOverdue(task, todayKey)) return 'Overdue';
  return task.temperature.charAt(0).toUpperCase() + task.temperature.slice(1);
}

/**
 * @param {import('@/lib/domain/types.js').Task} task
 * @param {string} todayKey
 */
function dueLabel(task, todayKey) {
  if (isOverdue(task, todayKey)) return daysOverdue(task, todayKey, dayKeyRange) + 'd';
  return 'today';
}

/** @param {import('@/lib/domain/types.js').Person | null} person */
function personLabel(person) {
  if (person === null) return 'No one linked';
  return person.organization ? person.name + ' · ' + person.organization : person.name;
}
