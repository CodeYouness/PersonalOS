'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';

import { dayLabel, slippedLabel } from '@/components/format.js';
import { DRAG_IDLE, dragReducer, dropOf, edgeScroll, groupAt, moveGoal, withHorizon } from '@/components/goals.js';
import { goalsAddress } from '@/lib/domain/addresses.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';
import { GOAL_HORIZONS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').Goal} Goal */
/** @typedef {Goal['horizon']} Horizon */

/** @type {Record<Horizon, string>} */
const GROUP_LABELS = { week: 'This week', month: 'This month', open: 'Open' };

/**
 * A Goals address. One place builds them, for the card and the screen.
 *
 * @param {string | null} [goalId]
 */
export function goalsHref(goalId = null) {
  return goalsAddress(goalId);
}

/**
 * The open goals in their groups, as the Goals screen draws them, from
 * lib/domain/derive/goals.js's goalBoard. Every row is a link to that goal on
 * the screen, selected by id in the address.
 *
 * A goal is dragged from one group to another to change its horizon (ADR
 * 0054): with a mouse from anywhere on its row, on touch from its grip only,
 * so a finger on the rest of the row still scrolls the page. A press becomes
 * a drag only past a few pixels, so a tap still opens the goal. While a goal
 * is held every horizon shows a group -- an empty one says so -- and the
 * group under it is marked; dropping outside every group, back in its own,
 * or pressing Esc puts it back. The drop is the panel's Horizon write; the
 * goal shows in its new group at once and goes back, saying why, if the
 * write is refused, and the screen re-reads what was saved either way. The
 * panel's Horizon control is the same move without dragging.
 *
 * @param {{ goals: Goal[], todayKey: string, selectedId?: string | null }} props
 */
export default function GoalList({ goals, todayKey, selectedId = null }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drag, setDrag] = useState(/** @type {import('@/components/goals.js').DragState} */ (DRAG_IDLE));
  // The drag as the window's listeners see it, between renders.
  const live = useRef(/** @type {import('@/components/goals.js').DragState} */ (DRAG_IDLE));
  const [moves, setMoves] = useState(/** @type {{ goalId: string, horizon: Horizon }[]} */ ([]));
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [seenGoals, setSeenGoals] = useState(goals);
  const groupEls = useRef(/** @type {Map<Horizon, HTMLElement>} */ (new Map()));
  const listEl = useRef(/** @type {HTMLDivElement | null} */ (null));
  // A mouse let go over a row after a drag still clicks it; that click is
  // not a request to open the goal.
  const swallowClick = useRef(false);

  // The refresh after a move brings the goals as saved: the prediction has
  // done its job.
  if (goals !== seenGoals) {
    setSeenGoals(goals);
    setMoves([]);
  }

  const shown = moves.reduce((list, move) => withHorizon(list, move.goalId, move.horizon, todayKey), goals);
  const { groups } = goalBoard(shown, todayKey);
  const dragging = drag.phase === 'dragging' ? drag : null;
  const isDragging = dragging !== null;
  const active = drag.phase !== 'idle';
  // While a goal is held, every horizon is somewhere to put it.
  const drawn = isDragging
    ? GOAL_HORIZONS.map(
        (horizon) =>
          groups.find((group) => group.horizon === horizon) ?? { horizon: /** @type {Horizon} */ (horizon), rows: [] }
      )
    : groups;

  /** @param {import('@/components/goals.js').DragAction} action */
  function send(action) {
    const next = dragReducer(live.current, action);
    live.current = next;
    setDrag(next);
    return next;
  }

  /** Where each group is now: measured on every move, since the page may have scrolled. */
  function boxes() {
    return [...groupEls.current].map(([horizon, element]) => {
      const { left, top, right, bottom } = element.getBoundingClientRect();
      return { horizon, left, top, right, bottom };
    });
  }

  /**
   * @param {import('react').PointerEvent<HTMLAnchorElement>} event
   * @param {Goal} goal
   * @param {Horizon} horizon
   */
  function press(event, goal, horizon) {
    if (event.button !== 0 || writing || live.current.phase !== 'idle') return;
    // Touch and pen scroll the page from a row; only the grip picks it up.
    const fromGrip = event.target instanceof Element && event.target.closest('.goal-grip') !== null;
    if (event.pointerType !== 'mouse' && !fromGrip) return;
    const row = event.currentTarget.getBoundingClientRect();
    swallowClick.current = false;
    send({
      type: 'press',
      goalId: goal.id,
      name: goal.name,
      from: horizon,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: event.clientX - row.left,
      dy: event.clientY - row.top,
      width: row.width,
    });
  }

  /** @param {{ goalId: string, horizon: Horizon }} drop @param {string} name */
  async function commit(drop, name) {
    setMoves((current) => [...current, drop]);
    setError(null);
    setWriting(true);
    const failure = await moveGoal(drop.goalId, drop.horizon);
    if (failure !== null) {
      setMoves((current) => current.filter((move) => move !== drop));
      setError('"' + name + '" was not moved: ' + failure);
    }
    setWriting(false);
    startTransition(() => router.refresh());
  }

  const onPointerMove = useEffectEvent((/** @type {PointerEvent} */ event) => {
    const state = live.current;
    if (state.phase === 'idle' || event.pointerId !== state.pointerId) return;
    send({ type: 'move', x: event.clientX, y: event.clientY, over: groupAt(boxes(), event.clientX, event.clientY) });
  });

  const onPointerUp = useEffectEvent((/** @type {PointerEvent} */ event) => {
    const state = live.current;
    if (state.phase === 'idle' || event.pointerId !== state.pointerId) return;
    const last = dragReducer(state, {
      type: 'move',
      x: event.clientX,
      y: event.clientY,
      over: groupAt(boxes(), event.clientX, event.clientY),
    });
    if (last.phase === 'dragging') {
      swallowClick.current = true;
      // Only the click this release makes; the next one opens a goal again.
      setTimeout(() => {
        swallowClick.current = false;
      }, 0);
    }
    send({ type: 'release' });
    const drop = dropOf(last);
    if (drop !== null && last.phase === 'dragging') commit(drop, last.name);
  });

  const onPointerCancel = useEffectEvent((/** @type {PointerEvent} */ event) => {
    const state = live.current;
    if (state.phase !== 'idle' && event.pointerId === state.pointerId) send({ type: 'cancel' });
  });

  const onKeyDown = useEffectEvent((/** @type {KeyboardEvent} */ event) => {
    if (event.key !== 'Escape') return;
    // Esc puts the goal back; it does not also close the panel.
    event.stopPropagation();
    event.preventDefault();
    send({ type: 'cancel' });
  });

  useEffect(() => {
    if (!active) return undefined;
    /** @param {PointerEvent} event */
    const move = (event) => onPointerMove(event);
    /** @param {PointerEvent} event */
    const up = (event) => onPointerUp(event);
    /** @param {PointerEvent} event */
    const cancel = (event) => onPointerCancel(event);
    /** @param {KeyboardEvent} event */
    const key = (event) => onKeyDown(event);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    // Captured on the window, so it is heard before the panel's own Esc.
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
    };
  }, [active]);

  const onFrame = useEffectEvent(() => {
    const state = live.current;
    if (state.phase !== 'dragging' || listEl.current === null) return;
    const scroller = scrollerOf(listEl.current);
    const rect = scroller === null ? null : scroller.getBoundingClientRect();
    const top = rect === null ? 0 : Math.max(rect.top, 0);
    const bottom = rect === null ? window.innerHeight : Math.min(rect.bottom, window.innerHeight);
    const delta = edgeScroll(state.y, top, bottom);
    if (delta === 0) return;
    const before = scroller === null ? window.scrollY : scroller.scrollTop;
    if (scroller === null) window.scrollBy(0, delta);
    else scroller.scrollTop += delta;
    const after = scroller === null ? window.scrollY : scroller.scrollTop;
    // The groups moved under a pointer that did not.
    if (after !== before) send({ type: 'move', x: state.x, y: state.y, over: groupAt(boxes(), state.x, state.y) });
  });

  useEffect(() => {
    if (!isDragging) return undefined;
    let frame = requestAnimationFrame(function tick() {
      onFrame();
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [isDragging]);

  if (drawn.length === 0) return <p className="caption">No open goals.</p>;
  return (
    <>
      {error !== null && (
        <p className="caption is-error" role="alert">
          {error}
        </p>
      )}
      <div
        ref={listEl}
        className={'goal-groups' + (dragging !== null ? ' is-dragging' : '')}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {drawn.map(({ horizon, rows }) => (
          <section
            key={horizon}
            ref={(element) => {
              if (element !== null) groupEls.current.set(horizon, element);
              return () => {
                groupEls.current.delete(horizon);
              };
            }}
            className={
              'goal-group' +
              (dragging !== null && dragging.over === horizon && dragging.from !== horizon ? ' is-target' : '')
            }
          >
            <div className="col-head">
              <span className="name">{GROUP_LABELS[horizon]}</span>
              <span className="count num">{rows.length}</span>
            </div>
            {rows.length === 0 && <p className="caption goal-drop-empty">Nothing here yet</p>}
            {rows.map(({ goal, slipped, targetPassed }) => (
              <Link
                key={goal.id}
                href={goalsHref(goal.id)}
                scroll={false}
                // The browser's own link drag would end the pointer's drag.
                draggable={false}
                onPointerDown={(event) => press(event, goal, horizon)}
                className={
                  'goal-row' +
                  (goal.id === selectedId ? ' is-selected' : '') +
                  (dragging !== null && dragging.goalId === goal.id ? ' is-lifted' : '')
                }
                aria-current={goal.id === selectedId ? 'true' : undefined}
              >
                <span className="goal-grip" aria-hidden="true">
                  <GripIcon />
                </span>
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
      {dragging !== null && (
        <div
          className="goal-ghost"
          aria-hidden="true"
          style={{
            width: dragging.width,
            transform: 'translate3d(' + (dragging.x - dragging.dx) + 'px, ' + (dragging.y - dragging.dy) + 'px, 0)',
          }}
        >
          <span className="goal-grip">
            <GripIcon />
          </span>
          <span className="goal-name">{dragging.name}</span>
        </div>
      )}
    </>
  );
}

/** Six dots: the row can be picked up. */
function GripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" focusable="false">
      <circle cx="2.5" cy="3" r="1.5" />
      <circle cx="7.5" cy="3" r="1.5" />
      <circle cx="2.5" cy="8" r="1.5" />
      <circle cx="7.5" cy="8" r="1.5" />
      <circle cx="2.5" cy="13" r="1.5" />
      <circle cx="7.5" cy="13" r="1.5" />
    </svg>
  );
}

/**
 * The nearest ancestor that scrolls the list -- the card on a wide screen --
 * or null for the page itself, on a phone.
 *
 * @param {HTMLElement} element
 * @returns {HTMLElement | null}
 */
function scrollerOf(element) {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}
