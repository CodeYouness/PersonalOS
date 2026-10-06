import GoalList from '@/components/GoalList.js';
import { today } from '@/lib/domain/dates.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';
import { getGoals } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Goals screen: "what did I promise myself" (docs/spec.md). Reads the
 * saved goals once per request and renders them through the same
 * derivation as the home card -- `todayKey` included, since
 * lib/domain/dates.js has no configured timezone in the browser.
 */
export default async function GoalsScreen() {
  const { groups } = goalBoard(await getGoals(), today());

  return (
    <section id="screen-goals" className="screen is-active">
      <div className="screen-grid">
        <article id="card-goals-list" className="card span-8">
          <div className="card-head">
            <span className="eyebrow">Goals</span>
          </div>
          <div className="card-body">
            <GoalList groups={groups} />
          </div>
        </article>
      </div>
    </section>
  );
}
