/**
 * Moving a goal to another horizon by dragging it (ADR 0054): the drag's
 * state, which group is under the pointer, what a drop does, the write it
 * makes and its failure, and the panel taking a change made elsewhere --
 * all without a browser.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRAG_IDLE,
  DRAG_THRESHOLD,
  dragReducer,
  dropOf,
  edgeScroll,
  groupAt,
  moveGoal,
  takeOutsideChanges,
  withHorizon,
} from '@/components/goals.js';
import { goalBoard } from '@/lib/domain/derive/goals.js';

/** @type {import('@/components/goals.js').DragAction} */
const PRESS = {
  type: 'press', goalId: 'goal_a', name: 'Sign the contract', from: 'week',
  pointerId: 1, x: 100, y: 100, dx: 20, dy: 10, width: 300,
};

/** @param {import('@/components/goals.js').DragAction[]} actions */
const run = (...actions) => actions.reduce(dragReducer, /** @type {import('@/components/goals.js').DragState} */ (DRAG_IDLE));

describe('dragReducer', () => {
  it('holds a pressed goal over its own group', () => {
    expect(run(PRESS)).toMatchObject({ phase: 'pressed', goalId: 'goal_a', from: 'week', over: 'week' });
  });

  it('is not a drag until the pointer has moved past the threshold: a tap still opens the goal', () => {
    const near = run(PRESS, { type: 'move', x: 100 + DRAG_THRESHOLD - 1, y: 100, over: 'month' });
    expect(near.phase).toBe('pressed');
    expect(dropOf(near)).toBeNull();

    const far = run(PRESS, { type: 'move', x: 100, y: 100 + DRAG_THRESHOLD, over: 'month' });
    expect(far).toMatchObject({ phase: 'dragging', x: 100, y: 100 + DRAG_THRESHOLD, over: 'month' });
  });

  it('stays a drag when the pointer comes back near where it started', () => {
    const state = run(PRESS, { type: 'move', x: 100, y: 160, over: 'month' }, { type: 'move', x: 101, y: 101, over: 'week' });
    expect(state).toMatchObject({ phase: 'dragging', over: 'week' });
  });

  it('ignores a second press while a goal is held', () => {
    const held = run(PRESS);
    expect(dragReducer(held, { ...PRESS, goalId: 'goal_b', pointerId: 2 })).toBe(held);
  });

  it('ignores a move with nothing held', () => {
    expect(run({ type: 'move', x: 10, y: 10, over: 'week' })).toBe(DRAG_IDLE);
  });

  it('ends on release and on cancel', () => {
    const dragging = run(PRESS, { type: 'move', x: 100, y: 200, over: 'month' });
    expect(dragReducer(dragging, { type: 'release' })).toBe(DRAG_IDLE);
    expect(dragReducer(dragging, { type: 'cancel' })).toBe(DRAG_IDLE);
  });
});

describe('dropOf', () => {
  it('moves the goal to the group under the pointer', () => {
    expect(dropOf(run(PRESS, { type: 'move', x: 100, y: 200, over: 'month' }))).toEqual({
      goalId: 'goal_a',
      horizon: 'month',
    });
  });

  it('does nothing outside every group, back in its own group, or before it is a drag', () => {
    expect(dropOf(run(PRESS, { type: 'move', x: 100, y: 200, over: null }))).toBeNull();
    expect(dropOf(run(PRESS, { type: 'move', x: 100, y: 200, over: 'week' }))).toBeNull();
    expect(dropOf(run(PRESS))).toBeNull();
    expect(dropOf(DRAG_IDLE)).toBeNull();
  });
});

describe('groupAt', () => {
  const boxes = [
    { horizon: /** @type {const} */ ('week'), left: 0, top: 0, right: 300, bottom: 100 },
    { horizon: /** @type {const} */ ('month'), left: 0, top: 116, right: 300, bottom: 200 },
  ];

  it('finds the group a point is in, its edges included', () => {
    expect(groupAt(boxes, 150, 50)).toBe('week');
    expect(groupAt(boxes, 300, 116)).toBe('month');
  });

  it('finds none in the gap between groups or beside them', () => {
    expect(groupAt(boxes, 150, 108)).toBeNull();
    expect(groupAt(boxes, 301, 50)).toBeNull();
    expect(groupAt([], 0, 0)).toBeNull();
  });
});

describe('edgeScroll', () => {
  it('scrolls up near the top and down near the bottom, faster nearer the edge', () => {
    expect(edgeScroll(400, 0, 800)).toBe(0);
    expect(edgeScroll(40, 0, 800)).toBeLessThan(0);
    expect(edgeScroll(0, 0, 800)).toBeLessThan(edgeScroll(40, 0, 800));
    expect(edgeScroll(780, 0, 800)).toBeGreaterThan(0);
    expect(edgeScroll(800, 0, 800)).toBeGreaterThan(edgeScroll(760, 0, 800));
  });

  it('never scrolls more than one step a frame, even past the edge', () => {
    expect(edgeScroll(-500, 0, 800)).toBe(edgeScroll(0, 0, 800));
    expect(edgeScroll(1500, 0, 800)).toBe(edgeScroll(800, 0, 800));
  });
});

describe('withHorizon', () => {
  /** @param {Partial<import('@/lib/domain/types.js').Goal>} fields */
  const goal = (fields) =>
    /** @type {import('@/lib/domain/types.js').Goal} */ ({
      id: 'goal_x', name: 'x', kind: 'objective', horizon: 'week', horizonSetOn: '2026-10-01', done: false,
      progress: null, targetDate: null, createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-01T08:00:00.000Z', source: 'user', ...fields,
    });

  it('shows the goal in its new group, its age started over, where the group order puts it', () => {
    const goals = [
      goal({ id: 'goal_late', horizon: 'week', targetDate: null }),
      goal({ id: 'goal_dated', horizon: 'month', targetDate: '2026-11-30' }),
      goal({ id: 'goal_soon', horizon: 'week', targetDate: '2026-11-20' }),
    ];
    const moved = withHorizon(goals, 'goal_soon', 'month', '2026-11-17');

    expect(moved.find((g) => g.id === 'goal_soon')).toMatchObject({ horizon: 'month', horizonSetOn: '2026-11-17' });
    const month = goalBoard(moved, '2026-11-17').groups.find((group) => group.horizon === 'month');
    // Nearest target date first: the moved goal goes before the 30th.
    expect(month?.rows.map((row) => row.goal.id)).toEqual(['goal_soon', 'goal_dated']);
    // A week goal set on 1 October would read "8th week"; moved, it has not slipped.
    expect(month?.rows[0].slipped).toBeNull();
  });

  it('changes nothing for the horizon it already has', () => {
    const goals = [goal({ id: 'goal_a' })];
    expect(withHorizon(goals, 'goal_a', 'week', '2026-11-17')[0]).toBe(goals[0]);
  });
});

describe('moveGoal', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** @param {number} status @param {object} body */
  const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

  it("makes the panel's Horizon write: PATCH the goal with its new horizon only", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer(200, { ok: true }));
    vi.stubGlobal('fetch', fetchImpl);

    expect(await moveGoal('goal a/b', 'month')).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('/api/goals/goal%20a%2Fb', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ horizon: 'month' }),
    });
  });

  it("says the store's refusal, so the goal goes back with a reason", async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer(400, { message: 'reopen this goal before editing it' })));
    expect(await moveGoal('goal_a', 'open')).toBe('reopen this goal before editing it');
  });

  it('says when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    expect(await moveGoal('goal_a', 'open')).toBe('Could not reach the server');
  });
});

describe('takeOutsideChanges', () => {
  const saved = { name: 'Run', horizon: 'week', targetDate: '' };

  it('takes a horizon changed elsewhere, in the field and as saved', () => {
    expect(takeOutsideChanges(saved, saved, { ...saved, horizon: 'month' })).toEqual({
      saved: { ...saved, horizon: 'month' },
      draft: { ...saved, horizon: 'month' },
    });
  });

  it('leaves a field being typed in alone', () => {
    const draft = { ...saved, name: 'Run a 10k' };
    expect(takeOutsideChanges(saved, draft, { ...saved, horizon: 'open' })?.draft).toEqual({
      name: 'Run a 10k',
      horizon: 'open',
      targetDate: '',
    });
  });

  it('is null when nothing changed elsewhere', () => {
    expect(takeOutsideChanges(saved, { ...saved, name: 'typing' }, { ...saved })).toBeNull();
  });
});
