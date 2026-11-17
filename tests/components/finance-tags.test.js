/**
 * The By tag card (ADR 0046): each tag of the period with its movements,
 * what it spent in the period and over all time, largest first, each a link
 * that lists its movements -- and nothing at all when no movement has a
 * tag. Every row here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import FinanceTags from '@/components/FinanceTags.js';
import { tagFlows } from '@/lib/domain/derive/finance.js';

const TODAY = '2026-04-20';
/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [category({ id: 'cat_travel', name: 'Travel', kind: 'expense' })];
/** @returns {any} */
const t = (/** @type {string} */ date, /** @type {number} */ amount, /** @type {string[]} */ tags) => ({
  id: 'tx_' + date + amount, date, amount, currency: 'EUR', description: '', accountId: 'account_a',
  counterAccountId: null, categoryId: 'cat_travel', notCounted: false, tags, note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user',
});
const transactions = [
  t('2026-02-27', -40000, ['lisbon trip']),
  t('2026-03-02', -12000, ['lisbon trip', 'work & co']),
  t('2026-03-04', -3000, ['coffee']),
];

/** @param {{ months?: string[], place?: any, rows?: any[] }} [options] */
function render({ months = ['2026-03'], place = { month: '2026-03' }, rows = transactions } = {}) {
  return renderToStaticMarkup(
    createElement(FinanceTags, {
      tags: tagFlows(rows, categories, months),
      tagged: rows.some((row) => row.tags.length > 0),
      periodLabel: 'March 2026',
      todayKey: TODAY,
      place,
    })
  );
}

describe('FinanceTags', () => {
  it('lists the period\'s tags, largest spending first, with the period and all time', () => {
    const html = render();

    expect(html.indexOf('>lisbon trip<')).toBeLessThan(html.indexOf('>coffee<'));
    expect(html).toContain('>Spent, March 2026<');
    expect(html).toContain('>Spent, all time<');
    expect(html).toMatch(/>lisbon trip<[\s\S]*?<td class="num">1<\/td><td class="num">120.00<\/td><td class="num">520.00<\/td>/);
    // A trip rarely fits one month: its first and last day.
    expect(html).toContain('27 Feb – 2 Mar');
  });

  it('says in its caption that the tags do not add up to the period\'s spending', () => {
    expect(render()).toContain('A movement with several tags counts under each');
  });

  it('links each tag to its movements, encoded, clearing a selected line, keeping the period', () => {
    const html = render({ place: { month: '2026-03', period: 'year', category: 'cat_travel', transaction: 'tx_1' } });

    expect(html).toContain('href="/finances?month=2026-03&amp;period=year&amp;tag=work+%26+co"');
    expect(html).not.toContain('category=');
  });

  it('marks the selected tag', () => {
    const html = render({ place: { month: '2026-03', tag: 'coffee' } });

    expect(html).toMatch(/<tr class="is-selected"><td><a [^>]*aria-current="true"[^>]*>coffee</);
  });

  it('says so when no tagged movement is counted in the period', () => {
    const html = render({ months: ['2026-01'] });

    expect(html).toContain('No tagged movement counted in March 2026.');
    expect(html).not.toContain('<table');
  });

  it('is not there at all when no movement has a tag', () => {
    expect(render({ rows: [t('2026-03-02', -100, [])] })).toBe('');
  });
});
