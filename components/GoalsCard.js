import Link from 'next/link';

import GoalList, { goalsHref } from '@/components/GoalList.js';
import { today } from '@/lib/domain/dates.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';
import { getGoals } from '@/lib/store.js';

/**
 * The open goals on the home screen (#97), below Calendar and Pulse: a
 * promise in front of you every day. Read-only -- Open and
 * every row go to the Goals screen, where a goal is corrected or closed. The
 * same derivation as the screen, so both say the same thing.
 */
export default async function GoalsCard() {
  const { groups } = goalBoard(await getGoals(), today());

  return (
    <article id="card-goals" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Goals</span>
        <Link className="btn-ghost" href={goalsHref()}>
          Open
        </Link>
      </div>
      <div className="card-body">
        <GoalList groups={groups} />
      </div>
    </article>
  );
}
