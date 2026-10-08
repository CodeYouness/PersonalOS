import { describe, expect, it } from 'vitest';

import { goalBoard, slippedPeriod } from '@/lib/domain/derive/goals.js';

/**
 * @param {Partial<import('@/lib/domain/types.js').Goal>} overrides
 * @returns {any}
 */
function goal(overrides) {
  return {
    id: 'goal_x', name: 'g', kind: 'objective', horizon: 'week', horizonSetOn: '2026-10-05',
    done: false, progress: null, targetDate: null,
    createdAt: '2026-10-05T08:00:00.000Z', updatedAt: '2026-10-05T08:00:00.000Z',
    source: 'user', ...overrides,
  };
}

const TUESDAY = '2026-10-06';

describe('goalBoard', () => {
  it('groups open goals This week, This month, Open, leaving out empty groups', () => {
    const board = goalBoard(
      [goal({ id: 'open', horizon: 'open' }), goal({ id: 'week', horizon: 'week' })],
      TUESDAY
    );

    expect(board.groups.map((group) => group.horizon)).toEqual(['week', 'open']);
    expect(board.groups[1].rows.map((row) => row.goal.id)).toEqual(['open']);
  });

  it('orders a group by target date, undated after dated, ties oldest first', () => {
    const board = goalBoard(
      [
        goal({ id: 'undated-new', createdAt: '2026-10-05T09:00:00.000Z' }),
        goal({ id: 'late', targetDate: '2026-10-20' }),
        goal({ id: 'undated-old', createdAt: '2026-10-01T09:00:00.000Z' }),
        goal({ id: 'soon-new', targetDate: '2026-10-08', createdAt: '2026-10-05T09:00:00.000Z' }),
        goal({ id: 'soon-old', targetDate: '2026-10-08', createdAt: '2026-10-02T09:00:00.000Z' }),
      ],
      TUESDAY
    );

    expect(board.groups[0].rows.map((row) => row.goal.id)).toEqual([
      'soon-old', 'soon-new', 'late', 'undated-old', 'undated-new',
    ]);
  });

  it('keeps done goals out of the groups and lists them newest first', () => {
    const board = goalBoard(
      [
        goal({ id: 'open' }),
        goal({ id: 'done-old', done: true, updatedAt: '2026-10-01T09:00:00.000Z' }),
        goal({ id: 'done-new', done: true, updatedAt: '2026-10-04T09:00:00.000Z' }),
      ],
      TUESDAY
    );

    expect(board.groups.flatMap((group) => group.rows.map((row) => row.goal.id))).toEqual(['open']);
    expect(board.done.map((done) => done.id)).toEqual(['done-new', 'done-old']);
  });

  it('says a target date before today has passed, and today has not', () => {
    const board = goalBoard(
      [
        goal({ id: 'passed', targetDate: '2026-10-05' }),
        goal({ id: 'today', targetDate: TUESDAY }),
        goal({ id: 'none' }),
      ],
      TUESDAY
    );

    expect(Object.fromEntries(board.groups[0].rows.map((row) => [row.goal.id, row.targetPassed]))).toEqual({
      passed: true, today: false, none: false,
    });
  });

  it('carries each row\'s slipped period', () => {
    const board = goalBoard([goal({ horizonSetOn: '2026-09-28' })], TUESDAY);

    expect(board.groups[0].rows[0].slipped).toBe(2);
  });
});

describe('slippedPeriod', () => {
  it('is null for a week goal in the week it was set', () => {
    expect(slippedPeriod(goal({ horizonSetOn: '2026-10-05' }), '2026-10-11')).toBeNull();
  });

  it('counts calendar weeks, Monday to Sunday', () => {
    expect(slippedPeriod(goal({ horizonSetOn: '2026-10-05' }), '2026-10-12')).toBe(2);
    expect(slippedPeriod(goal({ horizonSetOn: '2026-10-05' }), '2026-10-19')).toBe(3);
  });

  it('slips a week goal set on Sunday on the Monday after', () => {
    // "This week" was over: ADR 0021.
    expect(slippedPeriod(goal({ horizonSetOn: '2026-10-04' }), '2026-10-05')).toBe(2);
  });

  it('is null for a month goal in the month it was set, then counts calendar months', () => {
    const month = goal({ horizon: 'month', horizonSetOn: '2026-08-31' });

    expect(slippedPeriod(month, '2026-08-31')).toBeNull();
    expect(slippedPeriod(month, '2026-09-01')).toBe(2);
    expect(slippedPeriod(month, TUESDAY)).toBe(3);
    expect(slippedPeriod(goal({ horizon: 'month', horizonSetOn: '2025-12-15' }), '2026-01-02')).toBe(2);
  });

  it('never slips an open goal', () => {
    expect(slippedPeriod(goal({ horizon: 'open', horizonSetOn: '2025-01-01' }), TUESDAY)).toBeNull();
  });

  it('counts from horizonSetOn, not createdAt', () => {
    const repromised = goal({ horizonSetOn: TUESDAY, createdAt: '2026-08-01T09:00:00.000Z' });

    expect(slippedPeriod(repromised, TUESDAY)).toBeNull();
  });
});
