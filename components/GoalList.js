import Link from 'next/link';

import { dayLabel, slippedLabel } from '@/components/format.js';

/** @type {Record<import('@/lib/domain/types.js').Goal['horizon'], string>} */
const GROUP_LABELS = { week: 'This week', month: 'This month', open: 'Open' };

/**
 * A Goals address. One place builds them, for the card and the screen.
 *
 * @param {string | null} [goalId]
 */
export function goalsHref(goalId = null) {
  return goalId === null ? '/goals' : '/goals?goal=' + encodeURIComponent(goalId);
}

/**
 * The open goals in their groups, as the home card and the Goals screen both
 * draw them, from lib/domain/derive/goals.js's goalBoard. Every row is a
 * link to that goal on the screen, selected by id in the address.
 *
 * @param {{
 *   groups: import('@/lib/domain/derive/goals.js').GoalGroup[],
 *   selectedId?: string | null,
 * }} props
 */
export default function GoalList({ groups, selectedId = null }) {
  if (groups.length === 0) return <p className="caption">No open goals.</p>;
  return (
    <div className="goal-groups">
      {groups.map(({ horizon, rows }) => (
        <section key={horizon}>
          <div className="col-head">
            <span className="name">{GROUP_LABELS[horizon]}</span>
            <span className="count num">{rows.length}</span>
          </div>
          {rows.map(({ goal, slipped, targetPassed }) => (
            <Link
              key={goal.id}
              href={goalsHref(goal.id)}
              scroll={false}
              className={'goal-row' + (goal.id === selectedId ? ' is-selected' : '')}
              aria-current={goal.id === selectedId ? 'true' : undefined}
            >
              <span className="goal-name">
                {goal.name}
                {goal.kind === 'project' && <span className="badge badge-tag">project</span>}
              </span>
              <span className="goal-meta">
                {slipped !== null && horizon !== 'open' && (
                  <span className="caption">{slippedLabel(slipped, horizon)}</span>
                )}
                {goal.progress !== null && (
                  <span className="num">
                    {goal.progress.current} / {goal.progress.target}
                  </span>
                )}
                {goal.targetDate !== null && (
                  <span className={'num' + (targetPassed ? ' due' : '')}>{dayLabel(goal.targetDate)}</span>
                )}
              </span>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
