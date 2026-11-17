/**
 * What the Goals screen's list renders (#96, ADR 0054). Static markup only:
 * dragging a goal to another group is a check in the browser; the drag's
 * rules are tested in goal-drag.test.js.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import GoalList from '@/components/GoalList.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

/** @param {Partial<import('@/lib/domain/types.js').Goal>} fields */
const goal = (fields) =>
  /** @type {import('@/lib/domain/types.js').Goal} */ ({
    id: 'goal_x', name: 'x', kind: 'objective', horizon: 'week', horizonSetOn: '2026-11-16', done: false,
    progress: null, targetDate: null, createdAt: '2026-11-16T08:00:00.000Z',
    updatedAt: '2026-11-16T08:00:00.000Z', source: 'user', ...fields,
  });

/** @param {import('@/lib/domain/types.js').Goal[]} goals @param {string | null} [selectedId] */
const render = (goals, selectedId = null) =>
  renderToStaticMarkup(createElement(GoalList, { goals, todayKey: '2026-11-17', selectedId }));

describe('GoalList', () => {
  const html = render(
    [
      goal({ id: 'goal_sign', name: 'Sign the contract' }),
      goal({ id: 'goal_run', name: 'Run a 10k', horizon: 'open' }),
      goal({ id: 'goal_done', name: 'Closed one', horizon: 'month', done: true }),
    ],
    'goal_run'
  );

  it('groups the open goals and leaves an empty group out until a goal is held', () => {
    expect(html).toContain('This week');
    expect(html).toContain('Open');
    expect(html).not.toContain('This month');
    expect(html).not.toContain('Closed one');
    expect(html).not.toContain('goal-drop-empty');
  });

  it('gives every open row a grip a finger can pick it up by, hidden from a screen reader', () => {
    expect(html.match(/class="goal-grip" aria-hidden="true"/g)).toHaveLength(2);
  });

  it('keeps every row a link to its goal, the selected one marked', () => {
    expect(html).toContain('href="/goals?goal=goal_sign"');
    expect(html).toMatch(/href="\/goals\?goal=goal_run"[^>]*aria-current="true"|aria-current="true"[^>]*href="\/goals\?goal=goal_run"/);
    expect(html).toContain('draggable="false"');
  });

  it('marks no group as receiving and draws no carried goal while nothing is held', () => {
    expect(html).not.toContain('is-target');
    expect(html).not.toContain('goal-ghost');
    expect(html).not.toContain('role="alert"');
  });

  it('says so when there are no open goals', () => {
    expect(render([goal({ done: true })])).toBe('<p class="caption">No open goals.</p>');
  });
});
