'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { percent } from '@/components/format.js';
import { heatCellState } from '@/lib/domain/derive/habits.js';

/**
 * The Habits screen's history card, ported from design/mockup.html's
 * `#card-habits-history` -- its heatmap, not its Week/Month/YTD table, which
 * needs a period selector this product does not have (docs/spec.md).
 *
 * One row per habit, one cell per day, the rate at the end, and every cell a
 * correction: a check flips on click, a counter opens a small popover. The
 * cells and rates are derived on the server (`historyRows`); this island only
 * writes and shows the write.
 *
 * A correction is optimistic on the cell it touched and re-read on failure,
 * the same bargain `HabitsList` makes on the home card -- one habit's value
 * for one day rolls back cleanly. Every settle calls `router.refresh()`, so
 * the rates, the rest of the column (a day that had nothing recorded stops
 * being outlined once anything is) and the home card's streak catch up from
 * the server rather than from a guess made here.
 *
 * @param {{
 *   rows: ReturnType<typeof import('@/lib/domain/derive/habits.js').historyRows>,
 * }} props
 */
export default function HabitsHistory({ rows }) {
  /** Corrections made here, keyed by habit and day -- never by index (CLAUDE.md). */
  const [corrections, setCorrections] = useState(
    /** @type {Record<string, boolean | number>} */ ({})
  );
  const [pending, setPending] = useState(/** @type {Set<string>} */ (new Set()));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [openCell, setOpenCell] = useState(/** @type {string | null} */ (null));
  const router = useRouter();

  /**
   * @param {import('@/lib/domain/types.js').Habit} habit
   * @param {string} date
   * @param {boolean | number} value
   */
  async function save(habit, date, value) {
    const key = cellKey(habit.id, date);
    if (pending.has(key)) return;
    const hadCorrection = key in corrections;
    const previousValue = corrections[key];

    setPending((current) => new Set(current).add(key));
    setError(null);
    setCorrections((current) => ({ ...current, [key]: value }));

    let ok = false;
    try {
      const response = await fetch('/api/habits/log', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, habitId: habit.id, value }),
      });
      ok = response.ok;
      if (!ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.message ?? 'Something went wrong');
      }
    } catch {
      setError('Could not reach the server');
    }

    if (!ok) {
      setCorrections((current) => {
        const next = { ...current };
        if (hadCorrection) next[key] = previousValue;
        else delete next[key];
        return next;
      });
    }
    setPending((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
    router.refresh();
  }

  return (
    <article id="card-habits-history" className="card span-7">
      <div className="card-head">
        <span className="eyebrow">History</span>
        <div className="heat-legend">
          <span>none</span>
          <i className="heat-cell" data-v="zero" />
          <i className="heat-cell" data-v="low" />
          <i className="heat-cell" data-v="mid" />
          <i className="heat-cell" data-v="high" />
          <i className="heat-cell" data-v="full" />
          <span>full</span>
        </div>
      </div>
      <div className="card-body">
        <p className="caption heat-note">
          Last {rows[0]?.cells.length ?? 30} days · outlined cells are days with nothing recorded,
          not days you failed.
        </p>
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="caption">No habit was active in this window.</p>
        ) : (
          rows.map((row) => (
            <div className="heat-row" key={row.habit.id}>
              <span className="heat-name">
                {row.habit.label}
                {row.archived && <span className="type"> · archived</span>}
              </span>
              <span className="heat-cells">
                {row.cells.map((cell) => {
                  const key = cellKey(row.habit.id, cell.date);
                  const corrected = key in corrections;
                  const value = corrected ? corrections[key] : cell.value;
                  return (
                    <HeatCell
                      key={cell.date}
                      habit={row.habit}
                      date={cell.date}
                      value={value}
                      // A corrected day has something recorded by definition:
                      // this write.
                      state={corrected ? heatCellState(row.habit, cell.date, value, true) : cell.state}
                      disabled={pending.has(key)}
                      isOpen={openCell === key}
                      onOpen={() => setOpenCell(key)}
                      onClose={() => setOpenCell(null)}
                      onSave={(next) => save(row.habit, cell.date, next)}
                    />
                  );
                })}
              </span>
              <span className="heat-rate num">{percent(row.rate)}</span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

/**
 * @param {string} habitId
 * @param {string} date
 * @returns {string}
 */
function cellKey(habitId, date) {
  return habitId + '|' + date;
}

/**
 * One day of one habit. A day the habit was not active gets no cell at all --
 * but it still gets its place in the row, or the columns of two habits with
 * different histories would no longer line up by date.
 *
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   date: string,
 *   value: boolean | number,
 *   state: string,
 *   disabled: boolean,
 *   isOpen: boolean,
 *   onOpen: () => void,
 *   onClose: () => void,
 *   onSave: (value: boolean | number) => void,
 * }} props
 */
function HeatCell({ habit, date, value, state, disabled, isOpen, onOpen, onClose, onSave }) {
  const cell = useRef(/** @type {HTMLButtonElement | null} */ (null));

  if (state === 'inactive') {
    return <i className="heat-cell" data-v="inactive" aria-hidden="true" />;
  }

  const described =
    state === 'unrecorded'
      ? 'nothing recorded'
      : habit.type === 'check'
        ? value === true
          ? 'done'
          : 'not done'
        : value + ' of ' + habit.target;
  const label = habit.label + ', ' + date + ': ' + described;

  if (habit.type === 'check') {
    return (
      <button
        type="button"
        className="heat-cell"
        data-v={state}
        aria-label={label}
        aria-pressed={value === true}
        disabled={disabled}
        onClick={() => onSave(value !== true)}
      />
    );
  }

  return (
    <span className="heat-slot">
      <button
        ref={cell}
        type="button"
        className="heat-cell"
        data-v={state}
        aria-label={label}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => (isOpen ? onClose() : onOpen())}
      />
      {isOpen && (
        <CounterPopover
          habit={habit}
          date={date}
          count={typeof value === 'number' ? value : 0}
          disabled={disabled}
          onSave={onSave}
          onClose={() => {
            onClose();
            cell.current?.focus();
          }}
        />
      )}
    </span>
  );
}

/**
 * The counter correction: − n / target +, saving on every click. Esc and a
 * click outside close it, and Esc puts the focus back on the cell it came
 * from, so the keyboard is never left stranded in a popover that is gone.
 *
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   date: string,
 *   count: number,
 *   disabled: boolean,
 *   onSave: (value: number) => void,
 *   onClose: () => void,
 * }} props
 */
function CounterPopover({ habit, date, count, disabled, onSave, onClose }) {
  const popover = useRef(/** @type {HTMLDivElement | null} */ (null));

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    /** @param {PointerEvent} event */
    const onPointerDown = (event) => {
      // The slot holds the cell as well as the popover, so clicking the cell
      // that opened this counts as inside -- its own handler closes it.
      const slot = popover.current?.parentElement;
      if (slot && !slot.contains(/** @type {Node} */ (event.target))) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose]);

  return (
    <div className="heat-pop" ref={popover} role="group" aria-label={'Correct ' + habit.label + ', ' + date}>
      <button
        type="button"
        className="icon-btn"
        aria-label={'One fewer ' + habit.label}
        disabled={disabled || count <= 0}
        onClick={() => onSave(count - 1)}
      >
        &minus;
      </button>
      <span className="num">
        {count}&thinsp;/&thinsp;{habit.target}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label={'One more ' + habit.label}
        autoFocus
        disabled={disabled}
        onClick={() => onSave(count + 1)}
      >
        +
      </button>
    </div>
  );
}
