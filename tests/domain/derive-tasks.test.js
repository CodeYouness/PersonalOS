import { describe, expect, it } from 'vitest';

import { dayKeyRange } from '@/lib/domain/dates.js';
import { daysOverdue, displayBand, dueToday, isOverdue, sortByUrgency } from '@/lib/domain/derive/tasks.js';

/**
 * @param {Partial<import('@/lib/domain/types.js').Task>} overrides
 * @returns {any}
 */
function task(overrides) {
  return {
    id: 'task_x', title: 't', note: '', band: 'today', bandSetOn: '2026-01-05',
    temperature: 'warm', tags: [], position: 0, completedAt: null,
    createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z',
    source: 'user', ...overrides,
  };
}

describe('overdue is derived, never stored', () => {
  it('is late when a "today" task outlives the day it was chosen for', () => {
    expect(isOverdue(task({ band: 'today', bandSetOn: '2026-01-02' }), '2026-01-05')).toBe(true);
    expect(isOverdue(task({ band: 'today', bandSetOn: '2026-01-05' }), '2026-01-05')).toBe(false);
  });

  it('is never late once completed', () => {
    const done = task({ bandSetOn: '2026-01-02', completedAt: '2026-01-03T10:00:00.000Z' });
    expect(isOverdue(done, '2026-01-05')).toBe(false);
  });

  it('leaves the other bands alone', () => {
    // A "week" task has not promised a day, so nothing about it is broken
    // until you move it.
    expect(isOverdue(task({ band: 'week', bandSetOn: '2025-01-01' }), '2026-01-05')).toBe(false);
    expect(isOverdue(task({ band: 'later', bandSetOn: '2025-01-01' }), '2026-01-05')).toBe(false);
  });

  it('shows an overdue column without the data ever saying so', () => {
    expect(displayBand(task({ bandSetOn: '2026-01-02' }), '2026-01-05')).toBe('overdue');
    expect(displayBand(task({ bandSetOn: '2026-01-05' }), '2026-01-05')).toBe('today');
  });

  it('counts how many days late', () => {
    expect(daysOverdue(task({ bandSetOn: '2026-01-02' }), '2026-01-05', dayKeyRange)).toBe(3);
    expect(daysOverdue(task({ bandSetOn: '2026-01-05' }), '2026-01-05', dayKeyRange)).toBe(0);
  });
});

describe('ordering', () => {
  it('sorts by band, then temperature, then the position you dragged', () => {
    const sorted = sortByUrgency(
      [
        task({ id: 'task_a', band: 'later', bandSetOn: '2026-01-05', temperature: 'hot' }),
        task({ id: 'task_b', band: 'today', bandSetOn: '2026-01-05', temperature: 'cold', position: 0 }),
        task({ id: 'task_c', band: 'today', bandSetOn: '2026-01-05', temperature: 'hot', position: 1 }),
        task({ id: 'task_d', band: 'today', bandSetOn: '2026-01-01', temperature: 'cold' }),
      ],
      '2026-01-05'
    );

    // Overdue first even though it is the coldest: the band wins.
    expect(sorted.map((entry) => entry.id)).toEqual(['task_d', 'task_c', 'task_b', 'task_a']);
  });

  it('gives the morning only what is actually due', () => {
    const due = dueToday(
      [
        task({ id: 'task_a', band: 'week', bandSetOn: '2026-01-05' }),
        task({ id: 'task_b', band: 'today', bandSetOn: '2026-01-05' }),
        task({ id: 'task_c', band: 'today', bandSetOn: '2026-01-01' }),
        task({ id: 'task_d', band: 'today', bandSetOn: '2026-01-05', completedAt: 'x' }),
      ],
      '2026-01-05'
    );

    expect(due.map((entry) => entry.id)).toEqual(['task_c', 'task_b']);
  });
});
