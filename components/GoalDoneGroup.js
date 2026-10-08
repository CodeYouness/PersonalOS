'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { goalUrl, messageOf, request } from '@/components/GoalDetail.js';
import { goalsHref } from '@/components/GoalList.js';

/**
 * The done goals at the foot of the Goals screen (#99), collapsed, newest
 * first, each with Reopen -- so a goal closed by mistake can be found and
 * brought back. A row opens the goal in the panel, like an open one.
 *
 * @param {{ goals: import('@/lib/domain/types.js').Goal[], selectedId: string | null }} props
 */
export default function GoalDoneGroup({ goals, selectedId }) {
  const router = useRouter();
  const [reopening, setReopening] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [, startTransition] = useTransition();

  /** @param {string} id */
  async function reopen(id) {
    setReopening(id);
    setError(null);
    try {
      await request(goalUrl(id) + '/reopen', { method: 'POST' });
    } catch (caught) {
      setError(messageOf(caught));
    }
    setReopening(null);
    startTransition(() => router.refresh());
  }

  if (goals.length === 0) return null;
  return (
    // Open while the selected goal is in it, so a goal just closed from the
    // panel is still shown as the one selected.
    <details className="goal-done" open={goals.some((goal) => goal.id === selectedId) || undefined}>
      <summary className="col-head">
        <span className="name">Done</span>
        <span className="count num">{goals.length}</span>
      </summary>
      {error !== null && (
        <p className="caption is-error" role="alert">
          {error}
        </p>
      )}
      {goals.map((goal) => (
        <div key={goal.id} className={'goal-row' + (goal.id === selectedId ? ' is-selected' : '')}>
          <Link href={goalsHref(goal.id)} scroll={false} className="goal-name">
            {goal.name}
          </Link>
          <button
            type="button"
            className="btn-ghost"
            disabled={reopening !== null}
            onClick={() => reopen(goal.id)}
          >
            Reopen
          </button>
        </div>
      ))}
    </details>
  );
}
