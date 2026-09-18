'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * The compact Habits card's tap targets, ported from design/mockup.html's
 * `#card-habits` list. A tap updates this row's value immediately, then PUTs
 * the resulting absolute value -- the store decides whether the day just
 * became complete, this component only ever sends where a tap landed.
 *
 * Each habit saves on its own: a second habit stays tappable while the
 * first is still in flight, but a habit already saving ignores a repeat tap
 * on itself, so two absolute values for the same habit can never race each
 * other out of order. A rejected save rolls this row back to the value it
 * held before the tap -- never leaving the screen telling a story that was
 * never saved (CLAUDE.md) -- and every settle, win or lose, calls
 * `router.refresh()` so `HabitsCard`'s ring and streak (which this
 * component does not track locally) catch up to the real state.
 *
 * @param {{
 *   habits: import('@/lib/domain/types.js').Habit[],
 *   todayKey: string,
 *   values: Record<string, boolean | number>,
 * }} props
 */
export default function HabitsList({ habits, todayKey, values: initialValues }) {
  const [values, setValues] = useState(initialValues);
  const [pending, setPending] = useState(/** @type {Set<string>} */ (new Set()));
  const router = useRouter();

  /**
   * @param {string} habitId
   * @param {boolean | number} value
   */
  async function save(habitId, value) {
    if (pending.has(habitId)) return;
    const previousValue = values[habitId];

    setPending((current) => new Set(current).add(habitId));
    setValues((current) => ({ ...current, [habitId]: value }));

    let ok = false;
    try {
      const response = await fetch('/api/habits/log', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date: todayKey, habitId, value }),
      });
      ok = response.ok;
    } catch {
      ok = false;
    }

    if (!ok) setValues((current) => ({ ...current, [habitId]: previousValue }));
    setPending((current) => {
      const next = new Set(current);
      next.delete(habitId);
      return next;
    });
    router.refresh();
  }

  return (
    <ul>
      {habits.map((habit) => {
        const value = values[habit.id];
        const isPending = pending.has(habit.id);
        return habit.type === 'check' ? (
          <CheckRow key={habit.id} habit={habit} done={value === true} disabled={isPending} onToggle={save} />
        ) : (
          <CounterRow
            key={habit.id}
            habit={habit}
            count={typeof value === 'number' ? value : 0}
            disabled={isPending}
            onChange={save}
          />
        );
      })}
    </ul>
  );
}

/**
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   done: boolean,
 *   disabled: boolean,
 *   onToggle: (habitId: string, value: boolean) => void,
 * }} props
 */
function CheckRow({ habit, done, disabled, onToggle }) {
  return (
    <li className={'habit' + (done ? ' is-done' : '')}>
      <span className={'habit-box' + (done ? ' is-done' : '')} aria-hidden="true">
        {done && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
            <path
              d="M1.5 5.2l2.3 2.3L8.5 2.5"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <button
        type="button"
        className="habit-label"
        aria-pressed={done}
        disabled={disabled}
        onClick={() => onToggle(habit.id, !done)}
      >
        {habit.label}
      </button>
    </li>
  );
}

/**
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   count: number,
 *   disabled: boolean,
 *   onChange: (habitId: string, value: number) => void,
 * }} props
 */
function CounterRow({ habit, count, disabled, onChange }) {
  const target = habit.target ?? 0;
  const done = target > 0 && count >= target;
  const percent = target > 0 ? Math.min((count / target) * 100, 100) : 0;

  return (
    <li className={'habit' + (done ? ' is-done' : '')}>
      <span className={'habit-box' + (done ? ' is-done' : '')} aria-hidden="true" />
      <button type="button" className="habit-label" disabled={disabled} onClick={() => onChange(habit.id, count + 1)}>
        {habit.label}
      </button>
      {count > 0 && (
        <button
          type="button"
          className="habit-minus"
          aria-label={'One fewer ' + habit.label}
          disabled={disabled}
          onClick={() => onChange(habit.id, count - 1)}
        >
          &minus;
        </button>
      )}
      <span className="meter">
        <span style={{ width: percent + '%' }} />
      </span>
      <span className="habit-count num">
        {count}&thinsp;/&thinsp;{target}
      </span>
    </li>
  );
}
