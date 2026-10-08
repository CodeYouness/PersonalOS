'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { goalsHref } from '@/components/GoalList.js';
import { GOAL_HORIZONS, GOAL_KINDS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').Goal} Goal */

/** @type {Record<Goal['horizon'], string>} */
const HORIZON_LABELS = { week: 'Week', month: 'Month', open: 'Open' };

/**
 * The Goals screen's detail panel (#98): the selected goal's own fields,
 * corrected in place. The same optimistic pattern as the CRM panel: each
 * control writes one field, the screen shows the new value at once, and a
 * refused write puts every field back to what the store really holds.
 *
 * Name saves when you leave the field (also on Enter); Esc in a field puts
 * it back, Esc anywhere else closes the panel; the target date saves the same
 * way. Kind and horizon save on
 * press -- a different horizon restarts the goal's age, the same one is not
 * sent at all. Progress saves when focus leaves the pair of numbers, so
 * typing the target after the current is one edit, not a refused one.
 *
 * Mounted with `key={goal.id}`, so selecting another goal starts clean.
 *
 * @param {{ goal: Goal }} props
 */
export default function GoalDetail({ goal }) {
  const router = useRouter();
  const [draft, setDraft] = useState(() => editable(goal));
  const [saved, setSaved] = useState(() => editable(goal));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [needsResync, setNeedsResync] = useState(false);
  const [seenGoal, setSeenGoal] = useState(goal);
  const [, startTransition] = useTransition();
  // Esc reverts a field and then blurs it; the blur must not save the value
  // Esc just threw away.
  const discardingEdit = useRef(false);

  // After a failed write the refresh brings back the goal as stored; only
  // then are the fields reset to it.
  if (goal !== seenGoal) {
    setSeenGoal(goal);
    if (needsResync) {
      setDraft(editable(goal));
      setSaved(editable(goal));
      setNeedsResync(false);
    }
  }

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      const target = /** @type {HTMLElement | null} */ (event.target);
      if (target && target.tagName === 'INPUT') return;
      router.push(goalsHref(), { scroll: false });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router]);

  /**
   * @param {Record<string, unknown>} body what the route receives
   * @param {Partial<ReturnType<typeof editable>>} shown what the fields show meanwhile
   */
  async function save(body, shown) {
    setDraft((current) => ({ ...current, ...shown }));
    setError(null);
    try {
      await request(goalUrl(goal.id), {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setSaved((current) => ({ ...current, ...shown }));
    } catch (caught) {
      setError(messageOf(caught));
      setDraft(saved);
      setNeedsResync(true);
    }
    startTransition(() => router.refresh());
  }

  function commitName() {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    const name = draft.name.trim();
    if (name === '' || name === saved.name) {
      setDraft((current) => ({ ...current, name: saved.name }));
      return;
    }
    save({ name }, { name });
  }

  /** @param {'kind' | 'horizon'} field @param {string} value */
  function choose(field, value) {
    if (draft[field] === value) return;
    save({ [field]: value }, { [field]: value });
  }

  /** @param {string} targetDate '' clears it */
  function commitTargetDate(targetDate) {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    if (targetDate === saved.targetDate) return;
    save({ targetDate: targetDate === '' ? null : targetDate }, { targetDate });
  }

  function commitProgress() {
    if (discardingEdit.current) {
      discardingEdit.current = false;
      return;
    }
    const { current, target } = draft;
    if (current === saved.current && target === saved.target) return;
    if (current.trim() === '' && target.trim() === '') {
      save({ progress: null }, { current: '', target: '' });
      return;
    }
    // A blank or non-numeric half is sent as null and refused by the store,
    // which owns the rule (whole numbers, target >= 1, current >= 0).
    save({ progress: { current: toNumber(current), target: toNumber(target) } }, { current, target });
  }

  /** @param {import('react').KeyboardEvent<HTMLInputElement>} event @param {() => void} revert */
  function onFieldKey(event, revert) {
    if (event.key === 'Escape') {
      discardingEdit.current = true;
      revert();
      event.currentTarget.blur();
    } else if (event.key === 'Enter') {
      event.currentTarget.blur();
    }
  }

  return (
    <aside id="card-goal-detail" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Goal</span>
        <button
          type="button"
          className="btn-ghost"
          aria-label="Esc: close the panel"
          onClick={() => router.push(goalsHref(), { scroll: false })}
        >
          Esc
        </button>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}

        <div className="field">
          <label className="caption" htmlFor="g-name">Name</label>
          <input
            id="g-name"
            className="input"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            onBlur={commitName}
            onKeyDown={(event) => onFieldKey(event, () => setDraft((current) => ({ ...current, name: saved.name })))}
          />
        </div>

        <div className="field">
          <span className="caption">Kind</span>
          <div className="segmented" role="group" aria-label="Kind">
            {GOAL_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={'seg' + (draft.kind === kind ? ' is-on' : '')}
                aria-pressed={draft.kind === kind}
                onClick={() => choose('kind', kind)}
              >
                {kind === 'project' ? 'Project' : 'Objective'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="caption">Horizon</span>
          <div className="segmented" role="group" aria-label="Horizon">
            {GOAL_HORIZONS.map((horizon) => (
              <button
                key={horizon}
                type="button"
                className={'seg' + (draft.horizon === horizon ? ' is-on' : '')}
                aria-pressed={draft.horizon === horizon}
                onClick={() => choose('horizon', horizon)}
              >
                {HORIZON_LABELS[/** @type {Goal['horizon']} */ (horizon)]}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="caption" htmlFor="g-target-date">Target date</label>
          <div className="goal-inline">
            <input
              id="g-target-date"
              type="date"
              className="input"
              value={draft.targetDate}
              // Saved on leaving the field: typing a year fires a change per
              // digit, and 0002 is a real day key.
              onChange={(event) => setDraft((current) => ({ ...current, targetDate: event.target.value }))}
              onBlur={() => commitTargetDate(draft.targetDate)}
              onKeyDown={(event) => onFieldKey(event, () => setDraft((current) => ({ ...current, targetDate: saved.targetDate })))}
            />
            {draft.targetDate !== '' && (
              <button type="button" className="btn-ghost" onClick={() => commitTargetDate('')}>
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="field">
          <span className="caption">Progress</span>
          <div
            className="goal-inline"
            onBlur={(event) => {
              // Moving from one number to the other is still the same edit.
              if (!event.currentTarget.contains(/** @type {Node | null} */ (event.relatedTarget))) commitProgress();
            }}
          >
            <input
              aria-label="Progress so far"
              className="input input-count num"
              inputMode="numeric"
              placeholder="0"
              value={draft.current}
              onChange={(event) => setDraft((current) => ({ ...current, current: event.target.value }))}
              onKeyDown={(event) => onFieldKey(event, () => setDraft((current) => ({ ...current, current: saved.current, target: saved.target })))}
            />
            <span className="caption">of</span>
            <input
              aria-label="Progress target"
              className="input input-count num"
              inputMode="numeric"
              placeholder="3"
              value={draft.target}
              onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value }))}
              onKeyDown={(event) => onFieldKey(event, () => setDraft((current) => ({ ...current, current: saved.current, target: saved.target })))}
            />
            {saved.target !== '' && (
              <button type="button" className="btn-ghost" onClick={() => save({ progress: null }, { current: '', target: '' })}>
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Shown when no goal is selected, so the list keeps its width either way. */
export function GoalDetailEmpty() {
  return (
    <aside id="card-goal-detail" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Goal</span>
      </div>
      <div className="card-body">
        <p className="caption">Select a goal to open it here.</p>
      </div>
    </aside>
  );
}

/** @param {string} id */
function goalUrl(id) {
  return '/api/goals/' + encodeURIComponent(id);
}

/** @param {string} text */
function toNumber(text) {
  return text.trim() === '' ? null : Number(text);
}

/**
 * One write. Resolves to the server's JSON answer; throws with the server's
 * own message when it refuses, or a plain one when it cannot be reached.
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
async function request(url, init) {
  let response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('Could not reach the server');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message ?? 'Something went wrong');
  return payload;
}

/** @param {unknown} caught */
function messageOf(caught) {
  return caught instanceof Error ? caught.message : 'Something went wrong';
}

/**
 * The goal as the fields hold it: text inputs hold strings, so a missing
 * target date or progress is ''.
 *
 * @param {Goal} goal
 */
function editable(goal) {
  return {
    name: goal.name,
    kind: goal.kind,
    horizon: goal.horizon,
    targetDate: goal.targetDate ?? '',
    current: goal.progress === null ? '' : String(goal.progress.current),
    target: goal.progress === null ? '' : String(goal.progress.target),
  };
}
