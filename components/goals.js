/**
 * What the Goals screen's list, panel and done group share, kept out of the
 * components so the parts that decide something are tested without a
 * browser: the goal's address in the API, moving a goal to another horizon
 * by dragging it (ADR 0054), and the panel taking a change made elsewhere.
 */

import { messageOf, request } from '@/components/request.js';

/** @typedef {import('@/lib/domain/types.js').Goal} Goal */
/** @typedef {Goal['horizon']} Horizon */

/**
 * @typedef {object} DragIdle
 * @property {'idle'} phase
 */

/**
 * A goal held by the pointer. `pressed` until the pointer has moved
 * `DRAG_THRESHOLD` pixels -- a tap is not a drag, so a row still opens its
 * goal -- and `dragging` after. `over` is the group under the pointer, null
 * outside every group.
 *
 * @typedef {object} DragActive
 * @property {'pressed' | 'dragging'} phase
 * @property {string} goalId
 * @property {string} name what the lifted row shows
 * @property {Horizon} from the group it was picked up from
 * @property {number} pointerId only this pointer moves or drops it
 * @property {number} startX
 * @property {number} startY
 * @property {number} x where the pointer is now, in viewport pixels
 * @property {number} y
 * @property {number} dx where in the row it was held, so the row moves with it
 * @property {number} dy
 * @property {number} width the row's width
 * @property {Horizon | null} over
 */

/** @typedef {DragIdle | DragActive} DragState */

/**
 * @typedef {{ type: 'press', goalId: string, name: string, from: Horizon, pointerId: number,
 *   x: number, y: number, dx: number, dy: number, width: number }
 *   | { type: 'move', x: number, y: number, over: Horizon | null }
 *   | { type: 'release' }
 *   | { type: 'cancel' }} DragAction
 */

/** @type {DragIdle} */
export const DRAG_IDLE = { phase: 'idle' };

/** How far the pointer moves before a press becomes a drag, in pixels. */
export const DRAG_THRESHOLD = 8;

/** @param {string} id */
export function goalUrl(id) {
  return '/api/goals/' + encodeURIComponent(id);
}

/**
 * The drag, one pointer at a time. A second press while one is held is
 * ignored; release and cancel both end it -- what a release drops is read
 * with `dropOf` before it is sent.
 *
 * @param {DragState} state
 * @param {DragAction} action
 * @returns {DragState}
 */
export function dragReducer(state, action) {
  switch (action.type) {
    case 'press': {
      if (state.phase !== 'idle') return state;
      const { goalId, name, from, pointerId, x, y, dx, dy, width } = action;
      return { phase: 'pressed', goalId, name, from, pointerId, startX: x, startY: y, x, y, dx, dy, width, over: from };
    }
    case 'move': {
      if (state.phase === 'idle') return state;
      const { x, y, over } = action;
      if (state.phase === 'pressed' && Math.hypot(x - state.startX, y - state.startY) < DRAG_THRESHOLD) {
        return state;
      }
      return { ...state, phase: 'dragging', x, y, over };
    }
    case 'release':
    case 'cancel':
      return DRAG_IDLE;
    default:
      return state;
  }
}

/**
 * What letting go here would do: move the goal to the group under the
 * pointer, or nothing -- a press that never became a drag, a drop outside
 * every group, or back into the group it came from.
 *
 * @param {DragState} state
 * @returns {{ goalId: string, horizon: Horizon } | null}
 */
export function dropOf(state) {
  if (state.phase !== 'dragging' || state.over === null || state.over === state.from) return null;
  return { goalId: state.goalId, horizon: state.over };
}

/**
 * The group under a point, or null. Boxes are in the same viewport pixels
 * as the pointer; a group's edges belong to it.
 *
 * @param {{ horizon: Horizon, left: number, top: number, right: number, bottom: number }[]} boxes
 * @param {number} x
 * @param {number} y
 * @returns {Horizon | null}
 */
export function groupAt(boxes, x, y) {
  const box = boxes.find((b) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom);
  return box === undefined ? null : box.horizon;
}

/** How near an edge of the scrolling area the pointer scrolls it, in pixels. */
const EDGE = 48;
/** The most it scrolls in one frame. */
const EDGE_STEP = 14;

/**
 * How far to scroll this frame while a goal is held near the top or bottom
 * of the area that scrolls, so a group off-screen can still be reached:
 * faster the nearer the edge, nothing away from it.
 *
 * @param {number} y the pointer
 * @param {number} top the visible top of the scrolling area
 * @param {number} bottom its visible bottom
 */
export function edgeScroll(y, top, bottom) {
  if (y < top + EDGE) return -Math.ceil((EDGE_STEP * Math.min(EDGE, top + EDGE - y)) / EDGE);
  if (y > bottom - EDGE) return Math.ceil((EDGE_STEP * Math.min(EDGE, y - (bottom - EDGE))) / EDGE);
  return 0;
}

/**
 * The goals as the screen shows them while a move is being saved: the goal
 * in its new horizon at once, its age started over as the store will start
 * it (ADR 0021), so it lands where the group's own order puts it and loses
 * its "2nd week". Only a prediction -- the store decides, and the refresh
 * after the write shows what it decided.
 *
 * @param {Goal[]} goals
 * @param {string} goalId
 * @param {Horizon} horizon
 * @param {string} todayKey
 * @returns {Goal[]}
 */
export function withHorizon(goals, goalId, horizon, todayKey) {
  return goals.map((goal) =>
    goal.id === goalId && goal.horizon !== horizon ? { ...goal, horizon, horizonSetOn: todayKey } : goal
  );
}

/**
 * Move a goal to another horizon: the write the panel's Horizon control
 * makes, to the same route with the same body, so the store's one rule
 * decides both (a done goal refused, the age restarted). Resolves to null,
 * or to what went wrong; never throws.
 *
 * @param {string} goalId
 * @param {Horizon} horizon
 * @returns {Promise<string | null>}
 */
export async function moveGoal(goalId, horizon) {
  try {
    await request(goalUrl(goalId), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ horizon }),
    });
    return null;
  } catch (caught) {
    return messageOf(caught);
  }
}

/**
 * The panel's fields after the goal changed somewhere else -- dragged to
 * another group while it was open. A field whose stored value is no longer
 * the one the panel last saved takes the stored value; every other field,
 * one being typed in included, is left alone. Null when nothing changed.
 *
 * @template {Record<string, string>} T
 * @param {T} saved what the panel believes is stored
 * @param {T} draft what the fields show
 * @param {T} stored what the store holds now
 * @returns {{ saved: T, draft: T } | null}
 */
export function takeOutsideChanges(saved, draft, stored) {
  const changed = Object.keys(stored).filter((key) => stored[key] !== saved[key]);
  if (changed.length === 0) return null;
  const next = { saved: { ...saved }, draft: { ...draft } };
  for (const key of changed) {
    /** @type {Record<string, string>} */ (next.saved)[key] = stored[key];
    /** @type {Record<string, string>} */ (next.draft)[key] = stored[key];
  }
  return next;
}
