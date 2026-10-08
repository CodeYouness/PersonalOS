import GoalDetail, { GoalDetailEmpty } from '@/components/GoalDetail.js';
import GoalDoneGroup from '@/components/GoalDoneGroup.js';
import GoalList from '@/components/GoalList.js';
import { today } from '@/lib/domain/dates.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';
import { getGoal, getGoals } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Goals screen: "what did I promise myself" (docs/spec.md). Reads the
 * saved goals once per request and renders them through the same
 * derivation as the home card -- `todayKey` included, since
 * lib/domain/dates.js has no configured timezone in the browser.
 *
 * `?goal=<id>` selects a goal and opens the panel (#98), by id so a capture
 * landing a new goal never moves the selection. An id that no longer exists
 * selects nothing rather than failing. Done goals sit collapsed below the
 * open ones (#99).
 *
 * @param {{ searchParams: Promise<{ goal?: string | string[] }> }} props
 */
export default async function GoalsScreen({ searchParams }) {
  const { goal: goalParam } = await searchParams;
  const selected = typeof goalParam === 'string' ? await getGoal(goalParam) : null;
  const { groups, done } = goalBoard(await getGoals(), today());

  return (
    <section id="screen-goals" className="screen is-active">
      <div className="screen-grid">
        <article id="card-goals-list" className="card span-8">
          <div className="card-head">
            <span className="eyebrow">Goals</span>
          </div>
          <div className="card-body">
            <GoalList groups={groups} selectedId={selected?.id ?? null} />
            <GoalDoneGroup goals={done} selectedId={selected?.id ?? null} />
          </div>
        </article>
        {selected === null ? <GoalDetailEmpty /> : <GoalDetail key={selected.id} goal={selected} />}
      </div>
    </section>
  );
}
