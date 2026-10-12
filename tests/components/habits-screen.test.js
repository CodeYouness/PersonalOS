/**
 * What the Habits screen's manage and history cards render for a habit kept
 * on set days (#185, ADR 0029). Static markup only: clicking a weekday or a
 * cell stays a check in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import HabitsHistory from '@/components/HabitsHistory.js';
import HabitsManager from '@/components/HabitsManager.js';
import { historyRows } from '@/lib/domain/derive/habits.js';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

const gym = {
  id: 'habit_gym', label: 'Gym', type: 'check',
  periods: [{ from: '2026-10-01', to: null, days: [1, 3, 5], target: null }],
};
const water = {
  id: 'habit_water', label: 'Water', type: 'counter',
  periods: [{ from: '2026-10-01', to: null, days: [1, 2, 3, 4, 5, 6, 7], target: 8 }],
};

/** @param {string} date @param {Record<string, boolean | number>} habits */
const log = (date, habits) => ({ date, habits, meals: [], measurements: [], notes: [] });

describe('HabitsManager', () => {
  const html = renderToStaticMarkup(
    createElement(HabitsManager, { habits: /** @type {any} */ ([gym, water]), todayKey: '2026-10-13' })
  );

  it('shows each habit\'s days, or every day', () => {
    expect(html).toContain('check · Mon Wed Fri');
    expect(html).toContain('counter · target 8 · Every day');
  });

  it('starts the add form on all seven days', () => {
    const picker = html.slice(html.indexOf('aria-label="Days for the new habit"'));
    expect(picker.match(/aria-pressed="true"/g)).toHaveLength(7);
    expect(picker).toContain('>Mon<');
    expect(picker).toContain('>Sun<');
  });
});

describe('HabitsHistory', () => {
  // Monday 12 to Wednesday 14 October: Tuesday is the gym's day off, and it
  // went anyway.
  const rows = historyRows(/** @type {any} */ ([gym]), /** @type {any} */ ([
    log('2026-10-12', { habit_gym: true }),
    log('2026-10-13', { habit_gym: true }),
    log('2026-10-14', { habit_water: 3 }),
  ]));
  const html = renderToStaticMarkup(createElement(HabitsHistory, { rows }));

  it('draws a day off as a cell that can still be corrected, and says what it is', () => {
    expect(html).toMatch(/<button[^>]*data-v="off-done"[^>]*aria-label="Gym, 2026-10-13: day off, done"/);
    expect(html).toMatch(/<button[^>]*data-v="zero"[^>]*aria-label="Gym, 2026-10-14: not done"/);
  });

  it('names both day-off cells in the legend', () => {
    expect(html).toContain('day off</span>');
    expect(html).toContain('done on a day off</span>');
  });
});
