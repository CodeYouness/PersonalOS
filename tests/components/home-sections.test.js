/**
 * What Home's sections under the check-in decide to draw (ADR 0040): the calm
 * line when nothing needs you, "Worth noting" absent when nothing differs,
 * each row's link, and the tiles' unknowns. Static markup; the capture log
 * opening and the refresh after a check-in answer are checked in the browser.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HomeTiles, NeedsYou, noteSentence, WorthNoting } from '@/components/HomeSections.js';
import { financeOverview, worthChart } from '@/lib/domain/derive/finance.js';

const TODAY = '2026-11-18';

/** @param {any} over */
const needs = (over = {}) =>
  renderToStaticMarkup(
    createElement(NeedsYou, {
      needs: { appointments: [], tasks: [], moreTasks: null, unclassified: 0, review: null, empty: true, ...over },
    })
  );

/** @returns {any} */
const task = (/** @type {string} */ id, /** @type {string} */ title) => ({ id, title });

describe('Needs you', () => {
  it('says one calm line when nothing needs you, with no list', () => {
    const html = needs();
    expect(html).toContain('Needs you');
    expect(html).toContain('Nothing needs you right now.');
    expect(html).not.toContain('<ul');
  });

  it('draws each source as a row that says what it is and where it is done', () => {
    const html = needs({
      empty: false,
      appointments: [{ id: 'a', title: 'Dentist', startTime: '15:30' }],
      tasks: [
        { task: task('t1', 'Send the quote'), overdueDays: 3, href: '/crm?task=t1' },
        { task: task('t2', 'Call Marco'), overdueDays: 0, href: '/crm?task=t2' },
      ],
      moreTasks: { count: 2, href: '/crm' },
      unclassified: 1,
      review: { from: '2026-11-09', started: false, href: '/review?week=2026-11-09' },
    });
    expect(html).toContain('15:30');
    expect(html).toContain('Dentist');
    expect(html).toContain('href="/crm?task=t1"');
    expect(html).toContain('Overdue 3d');
    expect(html).toContain('is-overdue');
    expect(html.match(/is-overdue/g)).toHaveLength(1);
    expect(html).toContain('And 2 more tasks');
    expect(html).toContain('href="/crm"');
    expect(html).toContain('Capture not filed yet');
    expect(html).toContain('<button');
    expect(html).toContain('Last week is not reviewed yet');
    expect(html).toContain('href="/review?week=2026-11-09"');
    expect(html).not.toContain('Nothing needs you');
  });

  it('says a started review is not finished', () => {
    const html = needs({ empty: false, review: { from: '2026-11-09', started: true, href: '/review?week=2026-11-09' } });
    expect(html).toContain('not finished');
  });
});

describe('Worth noting', () => {
  it('is absent when nothing differs', () => {
    expect(renderToStaticMarkup(createElement(WorthNoting, { notes: [] }))).toBe('');
  });

  it('draws each note as a sentence linking to the screen that shows its number', () => {
    const html = renderToStaticMarkup(
      createElement(WorthNoting, {
        notes: [
          { kind: 'missed', label: 'Gym', days: 3, href: '/habits' },
          { kind: 'net-worth', change: 500_000, ratio: 0.05, href: '/finances' },
        ],
      })
    );
    expect(html).toContain('Worth noting');
    expect(html).toContain('Gym not kept on its last 3 scheduled days.');
    expect(html).toContain('href="/habits"');
    expect(html).toContain('href="/finances"');
  });

  it('cites a number in every figure sentence, descriptively', () => {
    const week = { kept: 6, scheduled: 10, rate: 0.6 };
    const baseline = { kept: 24, scheduled: 28, rate: 24 / 28 };
    expect(noteSentence({ kind: 'kept', week, baseline, href: '/habits' })).toBe(
      'Habits kept 6 of 10 times this week (60%), against 86% over the four weeks before.'
    );
    expect(noteSentence({ kind: 'spending', total: 42_000, mean: 29_000, weeks: 4, ratio: 13 / 29, href: '/finances' })).toMatch(
      /^Last week’s spending was €.420, 45% more than the €.290 a week of the 4 weeks before\.$/
    );
    expect(noteSentence({ kind: 'spending', total: 7_000, mean: 10_000, weeks: 3, ratio: -0.3, href: '/finances' })).toContain('30% less');
    expect(noteSentence({ kind: 'net-worth', change: -500_000, ratio: -0.05, href: '/finances' })).toMatch(/^Net worth is down €.5,000 \(−5%\) over 30 days\.$/);
    expect(noteSentence({ kind: 'lever', lever: 'Pricing page first', href: '/review?week=2026-11-09' })).toBe(
      'This week’s lever: Pricing page first'
    );
  });
});

describe('the tiles', () => {
  /** @param {any} over */
  const tiles = (over = {}) =>
    renderToStaticMarkup(
      createElement(HomeTiles, {
        today: TODAY,
        tiles: {
          habits: { kept: 0, scheduled: 0, rate: null, active: 0, href: '/habits' },
          money: { netWorth: null, change30: null, href: '/finances' },
          goals: { open: 0, href: '/goals' },
          journal: { thisWeek: 0, last: null, href: '/journal?date=' + TODAY },
          ...over,
        },
      })
    );

  it('says unknown, not zero: no balance, no habits, no goals, no journal', () => {
    const html = tiles();
    expect(html).toContain('No balance yet');
    expect(html).not.toContain('€');
    expect(html).toContain('No habits yet');
    expect(html).toContain('Open goals');
    expect(html).toContain('No journal entry yet');
    for (const href of ['/habits', '/finances', '/goals', '/journal?date=' + TODAY]) expect(html).toContain('href="' + href + '"');
    expect(html).not.toContain('<button');
  });

  it('shows the kept rate, net worth with its change, and the last entry when none is this week', () => {
    const html = tiles({
      habits: { kept: 4, scheduled: 5, rate: 0.8, active: 2, href: '/habits' },
      money: { netWorth: 1_234_500, change30: 20_000, href: '/finances' },
      journal: { thisWeek: 0, last: '2026-11-02', href: '/journal?date=' + TODAY },
    });
    expect(html).toContain('80%');
    expect(html).toContain('Habits kept this week');
    expect(html).toMatch(/€.12,345/);
    expect(html).toMatch(/Net worth · \+.200 in 30 days/);
    expect(html).toContain('2 Nov');
    expect(html).toContain('Last journal entry');
  });

  it('shows a dash, not 0%, while no habit was due yet this week', () => {
    expect(tiles({ habits: { kept: 0, scheduled: 0, rate: null, active: 2, href: '/habits' } })).toContain('—');
  });
});

describe('the net worth line under the tiles (ADR 0048)', () => {
  /** @returns {any} */
  const account = { id: 'account_a', name: 'Current', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance' };
  /** @returns {any} */
  const balance = (/** @type {string} */ date, /** @type {number} */ amount) => ({
    id: 'observation_' + date, accountId: 'account_a', kind: 'balance', amount, currency: 'EUR', date,
    observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user',
  });
  /** @param {any[]} observations */
  const chart = (observations) =>
    worthChart(financeOverview({ accounts: [/** @type {any} */ (account)], observations, trades: [], prices: [], transactions: [] }, TODAY).history, TODAY);
  /** @param {any} worth */
  const tiles = (worth) =>
    renderToStaticMarkup(
      createElement(HomeTiles, {
        today: TODAY,
        worth,
        tiles: {
          habits: { kept: 0, scheduled: 0, rate: null, active: 0, href: '/habits' },
          money: { netWorth: 650_000, change30: null, href: '/finances' },
          goals: { open: 0, href: '/goals' },
          journal: { thisWeek: 0, last: null, href: '/journal?date=' + TODAY },
        },
      })
    );

  it('draws the same line as Finances, compact, after the four tiles, the whole of it a link to Finances', () => {
    const html = tiles(chart([balance('2026-01-10', 500_000), balance('2026-11-02', 650_000)]));

    expect(html).toMatch(/data-tile="journal"[\s\S]*<a class="home-tile home-worth" data-tile="worth" href="\/finances">/);
    expect(html).toContain('Net worth <span class="num">+\u20091,500</span> since 31 Jan');
    expect(html).toContain('class="finance-worth is-compact" aria-hidden="true"');
    // January to November: eleven months, all tracked time.
    expect(html).toContain('viewBox="0 0 11 100"');
    expect(html).not.toContain('<button');
  });

  it('is absent while there is no net worth to draw', () => {
    expect(tiles(chart([]))).not.toContain('home-worth');
    expect(tiles(null)).not.toContain('home-worth');
  });
});
