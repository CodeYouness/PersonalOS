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

/**
 * @param {string} date
 * @param {Record<string, boolean | number>} habits
 * @param {Record<string, string>} [skips]
 */
const log = (date, habits, skips = {}) => ({ date, habits, skips, meals: [], measurements: [], notes: [] });

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
  const html = renderToStaticMarkup(createElement(HabitsHistory, { rows, todayKey: '2026-10-15' }));

  it('draws a day off as a cell that can still be corrected, and says what it is', () => {
    expect(html).toMatch(/<button[^>]*data-v="off-done"[^>]*aria-label="Gym, 2026-10-13: day off, done"/);
    expect(html).toMatch(/<button[^>]*data-v="zero"[^>]*aria-label="Gym, 2026-10-14: not done"/);
  });

  it('names both day-off cells in the legend', () => {
    expect(html).toContain('day off</span>');
    expect(html).toContain('done on a day off</span>');
  });
});

describe('HabitsHistory: skip reasons (ADR 0037)', () => {
  // Monday 12 to Friday 16 October, today the 16th: the gym went on Monday,
  // was paused on Wednesday and is not done yet today.
  const rows = historyRows(/** @type {any} */ ([gym, water]), /** @type {any} */ ([
    log('2026-10-12', { habit_gym: true, habit_water: 8 }),
    log('2026-10-13', { habit_water: 2 }, { habit_water: 'too-heavy' }),
    log('2026-10-14', {}, { habit_gym: 'paused' }),
    log('2026-10-15', { habit_water: 8 }),
    log('2026-10-16', {}),
  ]));
  const html = renderToStaticMarkup(createElement(HabitsHistory, { rows, todayKey: '2026-10-16' }));

  it('draws a paused day as its own cell, and says the reason a day was missed', () => {
    expect(html).toMatch(/<button[^>]*data-v="paused"[^>]*aria-label="Gym, 2026-10-14: not done, paused"/);
    expect(html).toMatch(/<button[^>]*data-v="low"[^>]*aria-label="Water, 2026-10-13: 2 of 8, too heavy"/);
  });

  it('opens a past scheduled day not kept to take a reason, and leaves the rest one click', () => {
    expect(html).toMatch(/<button[^>]*aria-label="Gym, 2026-10-14: not done, paused"[^>]*aria-expanded="false"/);
    // Kept, a day off, and today: a check still flips on one click.
    expect(html).toMatch(/<button[^>]*aria-label="Gym, 2026-10-12: done"[^>]*aria-pressed="true"/);
    expect(html).toMatch(/<button[^>]*aria-label="Gym, 2026-10-16: nothing recorded"[^>]*aria-pressed="false"/);
    expect(html).toMatch(/<button[^>]*aria-label="Gym, 2026-10-13: day off, not done"[^>]*aria-pressed="false"/);
  });

  it('puts a paused day in the legend', () => {
    expect(html).toContain('paused</span>');
  });

  it('shows a rate with no day behind it as unknown, not 0%', () => {
    const [row] = historyRows(/** @type {any} */ ([gym]), /** @type {any} */ ([log('2026-10-13', {}), log('2026-10-14', {}, { habit_gym: 'paused' })]));
    const markup = renderToStaticMarkup(createElement(HabitsHistory, { rows: [row], todayKey: '2026-10-16' }));
    expect(markup).toContain('<span class="heat-rate num">—</span>');
    expect(markup).not.toContain('0%');
  });
});
