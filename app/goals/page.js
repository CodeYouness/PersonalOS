import GoalDetail, { GoalDetailEmpty } from '@/components/GoalDetail.js';
import GoalDoneGroup from '@/components/GoalDoneGroup.js';
import GoalList from '@/components/GoalList.js';
import { today } from '@/lib/domain/dates.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';
import { getGoal, getGoals } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Goals screen: "what did I promise myself" (docs/spec.md). Reads the
 * saved goals once per request and renders them through goalBoard -- the
 * list is handed every goal and groups the open ones itself, so a goal
 * dragged to another group lands where the group's order puts it at once
 * (ADR 0054). `todayKey`
 * is passed down, since lib/domain/dates.js has no configured timezone in
 * the browser.
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
  const goals = await getGoals();
  const todayKey = today();
  const { done } = goalBoard(goals, todayKey);

  return (
    <section id="screen-goals" className="screen is-active">
      <div className="screen-grid">
        <article id="card-goals-list" className="card span-8">
          <div className="card-head">
            <span className="eyebrow">Goals</span>
          </div>
          <div className="card-body">
            <GoalList goals={goals} todayKey={todayKey} selectedId={selected?.id ?? null} />
            <GoalDoneGroup goals={done} selectedId={selected?.id ?? null} />
          </div>
        </article>
        {selected === null ? <GoalDetailEmpty /> : <GoalDetail key={selected.id} goal={selected} />}
      </div>
    </section>
  );
}
