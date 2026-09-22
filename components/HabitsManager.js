'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { isActiveOn } from '@/lib/domain/derive/habits.js';

/**
 * The Habits screen's management card, ported from design/mockup.html's
 * `#card-habits-manage`: add, rename, retarget, archive, restore and
 * reorder.
 *
 * Nothing here is optimistic. Every action writes, then calls
 * `router.refresh()` and re-renders from what the server actually holds --
 * unlike the home card's ticks, which are one habit's value and roll back
 * cleanly, these edits change the shape of the list (order, membership,
 * periods) and a guess that turned out wrong would leave the screen telling
 * a story that was never saved (CLAUDE.md). A card this size is re-read in
 * one request; a spinner on the acting row is the honest cost.
 *
 * The mockup's drag handle is an up/down pair instead: reordering is rare
 * and drag-and-drop is a keyboard and touch trap for a list this short.
 *
 * Every control stays disabled until the refresh after a write has rendered,
 * not merely until the request returns. A move computed from the pre-write
 * list is still a valid permutation, so the store cannot reject it -- see
 * ADR 0016.
 *
 * @param {{
 *   habits: import('@/lib/domain/types.js').Habit[],
 *   todayKey: string,
 * }} props
 */
export default function HabitsManager({ habits, todayKey }) {
  const [pendingId, setPendingId] = useState(/** @type {string | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [editingId, setEditingId] = useState(/** @type {string | null} */ (null));
  const [showArchived, setShowArchived] = useState(false);
  // router.refresh() is not awaited by returning from write(): without this
  // the buttons re-enable while the card still shows the pre-write list, and
  // a second move computed from that stale list is a valid permutation the
  // store cannot tell from a fresh one -- it would silently undo the first.
  const [isRefreshing, startTransition] = useTransition();
  const router = useRouter();

  const active = habits.filter((habit) => isActiveOn(habit, todayKey));
  const archived = habits.filter((habit) => !isActiveOn(habit, todayKey));
  const isBusy = pendingId !== null || isRefreshing;

  /**
   * One write, then a refresh. Returns whether it worked so a caller can
   * decide what to do next (close an editor, clear a field) -- but refreshes
   * either way, because a failed write may still have changed something.
   *
   * @param {string} key what is being acted on, for the pending state
   * @param {string} url
   * @param {string} method
   * @param {unknown} body
   * @returns {Promise<boolean>}
   */
  async function write(key, url, method, body) {
    if (isBusy) return false;
    setPendingId(key);
    setError(null);

    let ok = false;
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      ok = response.ok;
      if (!ok) setError(payload?.message ?? 'Something went wrong');
    } catch {
      setError('Could not reach the server');
    }

    setPendingId(null);
    startTransition(() => router.refresh());
    return ok;
  }

  /**
   * @param {string} id
   * @param {{ label?: string, target?: number, archived?: boolean }} fields
   */
  const patch = (id, fields) => write(id, '/api/habits/' + id, 'PATCH', fields);

  /**
   * Moving a row sends the whole list, so the server can reject an order
   * that no longer matches what it holds instead of applying a stale step.
   *
   * @param {number} index
   * @param {number} direction -1 up, +1 down
   */
  function move(index, direction) {
    const ids = active.map((habit) => habit.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Archived habits keep their place in the stored array; only the active
    // ones are reorderable here, so they are spliced back into the order
    // the server still expects to receive in full.
    const order = habits.map((habit) => habit.id);
    let cursor = 0;
    const merged = order.map((id) =>
      active.some((habit) => habit.id === id) ? ids[cursor++] : id
    );
    return write(ids[target], '/api/habits/order', 'PUT', { ids: merged });
  }

  return (
    <article id="card-habits-manage" className="card span-12">
      <div className="card-head">
        <span className="eyebrow">Your habits</span>
        <span className="caption">{active.length} active</span>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}

        {active.length === 0 ? (
          <p className="caption">No active habits. Add one below.</p>
        ) : (
          active.map((habit, index) => (
            editingId === habit.id ? (
              <HabitEditor
                key={habit.id}
                habit={habit}
                isPending={pendingId === habit.id}
                disabled={isBusy}
                onCancel={() => setEditingId(null)}
                onSave={async (fields) => {
                  if (await patch(habit.id, fields)) setEditingId(null);
                }}
              />
            ) : (
              <HabitRow
                key={habit.id}
                habit={habit}
                disabled={isBusy}
                isFirst={index === 0}
                isLast={index === active.length - 1}
                onEdit={() => setEditingId(habit.id)}
                onArchive={() => patch(habit.id, { archived: true })}
                onMove={(direction) => move(index, direction)}
              />
            )
          ))
        )}

        <AddHabit disabled={isBusy} onAdd={(input) => write('new', '/api/habits', 'POST', input)} />

        <p className="caption manage-note">
          Archiving keeps the history. Past days still show the habit; it stops appearing today.
        </p>

        {archived.length > 0 && (
          <div className="archived">
            <button
              type="button"
              className="archived-toggle"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((open) => !open)}
            >
              Archived ({archived.length})
            </button>
            {showArchived &&
              archived.map((habit) => (
                <div className="habit-manage is-archived" key={habit.id}>
                  <span className="habit-name">
                    {habit.label}
                    <br />
                    <span className="type">{describeType(habit)}</span>
                  </span>
                  <div className="actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={isBusy}
                      onClick={() => patch(habit.id, { archived: false })}
                    >
                      {pendingId === habit.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * @param {import('@/lib/domain/types.js').Habit} habit
 * @returns {string}
 */
function describeType(habit) {
  return habit.type === 'check' ? 'check' : 'counter · target ' + habit.target;
}

/**
 * The editing form, mounted only while a row is being edited. That is the
 * point of it being its own component: its fields are born from the habit
 * each time the editor opens, so Cancel really discards, and reopening never
 * shows text abandoned an edit ago -- or a label that has since changed on
 * the server.
 *
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   isPending: boolean,
 *   disabled: boolean,
 *   onCancel: () => void,
 *   onSave: (fields: { label: string, target?: number }) => void,
 * }} props
 */
function HabitEditor({ habit, isPending, disabled, onCancel, onSave }) {
  const [label, setLabel] = useState(habit.label);
  const [target, setTarget] = useState(String(habit.target ?? ''));

  return (
    <form
      className="habit-manage is-editing"
      onSubmit={(event) => {
        event.preventDefault();
        // The type is fixed after creation (ADR 0016), so a counter always
        // sends a target and a check never does -- the store rejects either
        // the other way round.
        onSave(habit.type === 'counter' ? { label, target: Number(target) } : { label });
      }}
    >
      <input
        className="input"
        value={label}
        autoFocus
        aria-label={'Name of ' + habit.label}
        onChange={(event) => setLabel(event.target.value)}
      />
      {habit.type === 'counter' && (
        <input
          className="input input-target num"
          type="number"
          min="1"
          step="1"
          value={target}
          aria-label={'Daily target for ' + habit.label}
          onChange={(event) => setTarget(event.target.value)}
        />
      )}
      <div className="actions">
        <button type="submit" className="btn-primary" disabled={disabled}>
          {isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-ghost" disabled={disabled} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   disabled: boolean,
 *   isFirst: boolean,
 *   isLast: boolean,
 *   onEdit: () => void,
 *   onArchive: () => void,
 *   onMove: (direction: number) => void,
 * }} props
 */
function HabitRow({ habit, disabled, isFirst, isLast, onEdit, onArchive, onMove }) {
  return (
    <div className="habit-manage">
      <div className="move">
        <button
          type="button"
          className="icon-btn"
          aria-label={'Move ' + habit.label + ' up'}
          disabled={disabled || isFirst}
          onClick={() => onMove(-1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label={'Move ' + habit.label + ' down'}
          disabled={disabled || isLast}
          onClick={() => onMove(1)}
        >
          ↓
        </button>
      </div>
      <span className="habit-name">
        {habit.label}
        <br />
        <span className="type">{describeType(habit)}</span>
      </span>
      <div className="actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={'Edit ' + habit.label}
          disabled={disabled}
          onClick={onEdit}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="icon-btn danger"
          aria-label={'Archive ' + habit.label}
          disabled={disabled}
          onClick={onArchive}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M3 4h8M5.5 4V2.8h3V4M4.3 4l.5 7.2h4.4L9.7 4"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * The mockup's add row. The type is chosen before the habit exists because
 * it can never be changed afterwards -- a counter's history is numbers and a
 * check's is booleans.
 *
 * @param {{
 *   disabled: boolean,
 *   onAdd: (input: { label: string, type: string, target: number | null }) => Promise<boolean>,
 * }} props
 */
function AddHabit({ disabled, onAdd }) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState(/** @type {'check' | 'counter'} */ ('check'));
  const [target, setTarget] = useState('8');

  return (
    <form
      className="add-habit"
      onSubmit={async (event) => {
        event.preventDefault();
        const created = await onAdd({
          label,
          type,
          target: type === 'counter' ? Number(target) : null,
        });
        if (created) setLabel('');
      }}
    >
      <input
        className="input"
        placeholder="New habit — e.g. Stretch before bed"
        aria-label="New habit"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
      />
      <button
        type="button"
        className="btn-ghost"
        aria-label={'Type: ' + type + ', tap to change'}
        onClick={() => setType((current) => (current === 'check' ? 'counter' : 'check'))}
      >
        {type}
      </button>
      {type === 'counter' && (
        <input
          className="input input-target num"
          type="number"
          min="1"
          step="1"
          value={target}
          aria-label="Daily target"
          onChange={(event) => setTarget(event.target.value)}
        />
      )}
      <button type="submit" className="btn-primary" disabled={disabled || label.trim() === ''}>
        Add
      </button>
    </form>
  );
}
