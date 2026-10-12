/**
 * What the home Habits card renders on a day some habits are off (#186, ADR
 * 0029). Static markup only: a tick and the ring catching up after it stay a
 * check in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import HabitsList from '@/components/HabitsList.js';
import HabitsRing from '@/components/HabitsRing.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

describe('HabitsRing', () => {
  it('shows completion over the habits scheduled today', () => {
    const html = renderToStaticMarkup(createElement(HabitsRing, { ratio: 0.5 }));
    expect(html).toContain('50%');
    expect(html).toContain('ring-progress');
  });

  it('reads "Day off" with no arc when nothing is scheduled today, rather than 0%', () => {
    const html = renderToStaticMarkup(createElement(HabitsRing, { ratio: null }));
    expect(html).toContain('Day off');
    expect(html).not.toContain('%');
    expect(html).not.toContain('ring-progress');
  });
});

describe('HabitsList', () => {
  const move = {
    id: 'habit_move', label: 'Move', type: 'check',
    periods: [{ from: '2026-10-01', to: null, days: [1, 2, 3, 4, 5, 6, 7], target: null }],
  };
  const gym = {
    id: 'habit_gym', label: 'Gym', type: 'check',
    periods: [{ from: '2026-10-01', to: null, days: [1, 3, 5], target: null }],
  };
  const sets = {
    id: 'habit_sets', label: 'Sets', type: 'counter',
    periods: [{ from: '2026-10-01', to: null, days: [1, 3, 5], target: 3 }],
  };
  const html = renderToStaticMarkup(
    createElement(HabitsList, {
      habits: /** @type {any} */ ([move, gym, sets]),
      offIds: ['habit_gym', 'habit_sets'],
      todayKey: '2026-10-13',
      values: { habit_gym: true },
    })
  );
  const rows = html.split('<li').slice(1);

  it('fades a habit with a day off and labels it, and still offers the tick', () => {
    expect(rows[1]).toMatch(/^ class="habit is-done is-off"/);
    expect(rows[1]).toContain('Day off');
    expect(rows[1]).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Gym<\/button>/);
    expect(rows[1]).not.toContain('disabled');
    expect(rows[2]).toContain('Day off');
    expect(rows[2]).toMatch(/0\u2009\/\u20093/);
  });

  it('leaves a scheduled habit as it was', () => {
    expect(rows[0]).toMatch(/^ class="habit"/);
    expect(rows[0]).not.toContain('Day off');
  });
});
