'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { percent } from '@/components/format.js';
import { heatCellState, isComplete, takesSkipReason } from '@/lib/domain/derive/habits.js';
import { HABIT_SKIP_REASON_KEYS } from '@/lib/domain/habit-skip.js';
import { HABIT_SKIP_REASONS } from '@/personalos.config.js';

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
 * A past day the habit was scheduled and not kept takes a skip reason (ADR
 * 0037): such a cell opens a popover -- a check's with "Done" beside the
 * reasons, a counter's with them under its count -- where a reason is given,
 * changed, or cleared by choosing it again. Every other check cell still
 * flips on one click. A reason is written on its own route and rolls back
 * the same way a value does; a value that completes the day drops the
 * reason here as the store does.
 *
 * @param {{
 *   rows: ReturnType<typeof import('@/lib/domain/derive/habits.js').historyRows>,
 *   todayKey: string,
 * }} props
 */
export default function HabitsHistory({ rows, todayKey }) {
  /** Corrections made here, keyed by habit and day -- never by index (CLAUDE.md). */
  const [corrections, setCorrections] = useState(
    /** @type {Record<string, boolean | number>} */ ({})
  );
  /** Reasons given or cleared here, keyed the same way. */
  const [skipCorrections, setSkipCorrections] = useState(
    /** @type {Record<string, import('@/lib/domain/habit-skip.js').HabitSkipReason | null>} */ ({})
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
    settle(key);
  }

  /**
   * @param {import('@/lib/domain/types.js').Habit} habit
   * @param {string} date
   * @param {import('@/lib/domain/habit-skip.js').HabitSkipReason | null} reason
   */
  async function saveSkip(habit, date, reason) {
    const key = cellKey(habit.id, date);
    if (pending.has(key)) return;
    const hadCorrection = key in skipCorrections;
    const previous = skipCorrections[key];

    setPending((current) => new Set(current).add(key));
    setError(null);
    setOpenCell(null);
    setSkipCorrections((current) => ({ ...current, [key]: reason }));

    let ok = false;
    try {
      const response = await fetch('/api/habits/skip', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, habitId: habit.id, reason }),
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
      setSkipCorrections((current) => {
        const next = { ...current };
        if (hadCorrection) next[key] = previous;
        else delete next[key];
        return next;
      });
    }
    settle(key);
  }

  /** @param {string} key */
  function settle(key) {
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
          <span className="sep" />
          <i className="heat-cell" data-v="off" />
          <span>day off</span>
          <i className="heat-cell" data-v="off-done" />
          <span>done on a day off</span>
          <i className="heat-cell" data-v="paused" />
          <span>paused</span>
        </div>
      </div>
      <div className="card-body">
        <p className="caption heat-note">
          Last {rows[0]?.cells.length ?? 30} days · outlined cells are days with nothing recorded,
          not days you failed. Hatched cells are days off: nothing was expected, and something done
          on one counts toward nothing. A past day not kept takes a reason; a paused day is left
          out of the rate.
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
                  const corrected = key in corrections || key in skipCorrections;
                  const value = key in corrections ? corrections[key] : cell.value;
                  const given = key in skipCorrections ? skipCorrections[key] : cell.skip;
                  // A day kept has no reason not to be: the store drops it.
                  const skip = isComplete(row.habit, cell.date, value) ? null : given;
                  return (
                    <HeatCell
                      key={cell.date}
                      habit={row.habit}
                      date={cell.date}
                      target={cell.target}
                      value={value}
                      skip={skip}
                      // A corrected day has something recorded by definition:
                      // this write.
                      state={corrected ? heatCellState(row.habit, cell.date, value, true, skip) : cell.state}
                      takesReason={cell.date < todayKey && takesSkipReason(row.habit, cell.date, value)}
                      disabled={pending.has(key)}
                      isOpen={openCell === key}
                      onOpen={() => setOpenCell(key)}
                      onClose={() => setOpenCell(null)}
                      onSave={(next) => save(row.habit, cell.date, next)}
                      onSkip={(reason) => saveSkip(row.habit, cell.date, reason)}
                    />
                  );
                })}
              </span>
              <span className="heat-rate num">{row.rate === null ? '—' : percent(row.rate)}</span>
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
 * different histories would no longer line up by date. A day off is a cell
 * like any other: the Tuesday gym session forgotten on the day is added from
 * here, and it is recorded without counting toward anything (ADR 0029).
 *
 * A counter's cell shows the target that day was measured against, never
 * today's: correcting an old day must not quietly re-measure it (ADR 0029).
 *
 * A cell that `takesReason` -- a past day scheduled and not kept -- opens a
 * popover even for a check, so the reason sits where the correction is.
 *
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   date: string,
 *   target: number | null,
 *   value: boolean | number,
 *   skip: import('@/lib/domain/habit-skip.js').HabitSkipReason | null,
 *   state: string,
 *   takesReason: boolean,
 *   disabled: boolean,
 *   isOpen: boolean,
 *   onOpen: () => void,
 *   onClose: () => void,
 *   onSave: (value: boolean | number) => void,
 *   onSkip: (reason: import('@/lib/domain/habit-skip.js').HabitSkipReason | null) => void,
 * }} props
 */
function HeatCell({ habit, date, target, value, skip, state, takesReason, disabled, isOpen, onOpen, onClose, onSave, onSkip }) {
  const cell = useRef(/** @type {HTMLButtonElement | null} */ (null));

  if (state === 'inactive') {
    return <i className="heat-cell" data-v="inactive" aria-hidden="true" />;
  }

  const done =
    habit.type === 'check' ? (value === true ? 'done' : 'not done') : value + ' of ' + target;
  const described =
    state === 'unrecorded'
      ? 'nothing recorded'
      : state === 'off' || state === 'off-done'
        ? 'day off, ' + done
        : done;
  const label =
    habit.label + ', ' + date + ': ' + described + (skip === null ? '' : ', ' + HABIT_SKIP_REASONS[skip].toLowerCase());

  if (habit.type === 'check' && !takesReason) {
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
        <CellPopover
          habit={habit}
          date={date}
          target={target}
          count={typeof value === 'number' ? value : 0}
          skip={takesReason ? skip : undefined}
          disabled={disabled}
          onSave={onSave}
          onSkip={onSkip}
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
 * A cell's correction. A counter's: − n / target +, saving on every click. A
 * check's, opened only to give a reason: "Done", which ticks it. Then, when
 * the day takes a reason (`skip` is not undefined), the reasons, the one
 * given pressed; choosing it again clears it. Esc and a click outside close
 * it, and Esc puts the focus back on the cell it came from, so the keyboard
 * is never left stranded in a popover that is gone.
 *
 * @param {{
 *   habit: import('@/lib/domain/types.js').Habit,
 *   date: string,
 *   target: number | null,
 *   count: number,
 *   skip: import('@/lib/domain/habit-skip.js').HabitSkipReason | null | undefined,
 *   disabled: boolean,
 *   onSave: (value: boolean | number) => void,
 *   onSkip: (reason: import('@/lib/domain/habit-skip.js').HabitSkipReason | null) => void,
 *   onClose: () => void,
 * }} props
 */
function CellPopover({ habit, date, target, count, skip, disabled, onSave, onSkip, onClose }) {
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
      {habit.type === 'check' ? (
        <button
          type="button"
          className="btn-ghost"
          autoFocus
          disabled={disabled}
          onClick={() => {
            onSave(true);
            onClose();
          }}
        >
          Done
        </button>
      ) : (
        <>
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
            {count}&thinsp;/&thinsp;{target}
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
        </>
      )}
      {skip !== undefined && (
        <span className="heat-reasons" role="group" aria-label="Why not kept">
          {HABIT_SKIP_REASON_KEYS.map((reason) => (
            <button
              key={reason}
              type="button"
              aria-pressed={skip === reason}
              disabled={disabled}
              onClick={() => onSkip(skip === reason ? null : reason)}
            >
              {HABIT_SKIP_REASONS[reason]}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
