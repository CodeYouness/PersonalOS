/**
 * What the Income & spending card renders: the income and spending bars --
 * money in outlined, money out solid -- with no chart switch and no net worth
 * line (ADR 0048), the line counting movements without a category, the
 * composition bar, each spending line against its average in a month, the
 * lines with nothing in the period folded, and the year reading with its
 * comparison to the year before (or none). Every row here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {} }) }));

const { default: FinanceFlows } = await import('@/components/FinanceFlows.js');
const {
  calendarYearFlows,
  flowMonths,
  flowTrend,
  monthFlows,
  savingsRate,
  spendingAverages,
  trendMonths,
  uncategorisedCounts,
  yearFlows,
} = await import('@/lib/domain/derive/finance.js');

const TODAY = '2026-04-20';

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_home', name: 'Home', kind: 'expense' }),
  category({ id: 'cat_food', name: 'Food', kind: 'expense' }),
  category({ id: 'cat_gym', name: 'Gym', kind: 'expense' }),
  category({ id: 'cat_pay', name: 'Pay', kind: 'income' }),
];
/** @returns {any} */
const t = (/** @type {string} */ date, /** @type {number} */ amount, /** @type {string | null} */ categoryId) => ({
  id: 'tx_' + date + amount, date, amount, currency: 'EUR', description: '', accountId: 'account_a',
  counterAccountId: null, categoryId, notCounted: false, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user',
});
const transactions = [
  t('2026-01-01', 300000, 'cat_pay'),
  t('2026-01-02', -100000, 'cat_home'),
  t('2026-01-03', -20000, 'cat_food'),
  t('2026-01-04', -6000, 'cat_gym'),
  t('2026-03-01', 300000, 'cat_pay'),
  t('2026-03-02', -100000, 'cat_home'),
  t('2026-03-03', -10000, 'cat_food'),
  t('2026-04-01', 300000, 'cat_pay'),
  t('2026-04-02', -100000, 'cat_home'),
  t('2026-04-03', -50000, 'cat_food'),
];

/**
 * @param {'month' | 'year'} period
 * @param {string} month
 * @param {{ target?: number | null, rows?: any[], place?: any }} [options]
 */
function render(period, month, { target = null, rows = transactions, place = {} } = {}) {
  const months = flowMonths(rows, TODAY, '2026-01-01');
  const year = period === 'year' ? calendarYearFlows(rows, categories, month, months) : null;
  const flows = year ?? monthFlows(rows, categories, month);
  const periodMonths = year?.months ?? [month];
  return renderToStaticMarkup(
    createElement(FinanceFlows, {
      flows,
      period,
      yearRate: period === 'year' ? null : savingsRate(yearFlows(rows, categories, month)),
      target,
      categories,
      trend: flowTrend(rows, categories, year === null ? trendMonths(months, month) : periodMonths),
      averages: period === 'year' ? null : spendingAverages(rows, categories, month, months),
      uncategorised: uncategorisedCounts(rows, categories, periodMonths),
      months,
      month,
      place: { month, period, ...place },
    })
  );
}

describe('FinanceFlows', () => {
  describe('the trend', () => {
    it('draws income and spending as bars, with no chart switch and no net worth line (ADR 0048)', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('aria-label="Income and spending by month"');
      expect(html).not.toContain('aria-label="Chart"');
      expect(html).not.toContain('Net worth');
      expect(html).not.toContain('finance-worth');
      expect(html).not.toContain('chart=');
    });

    it('draws a trend whose months read their month, the selected one marked and an empty one left empty', () => {
      const html = render('month', '2026-04');

      expect(html).toMatch(/aria-current="true"[^>]*aria-label="April 2026: income/);
      expect(html).toMatch(/is-empty"[^>]*aria-label="February 2026: nothing recorded"/);
      expect(html).toContain('href="/finances?month=2026-01"');
    });

    it('labels the scale from zero to the highest bar', () => {
      const html = render('month', '2026-04');

      expect(html).toMatch(/class="is-top num">€\u20093k</);
      expect(html).toMatch(/class="is-bottom num">€\u20090</);
    });

    it('tells money in from money out by the bars\' own look, and says so in the legend', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('<i class="is-income" style="height:100%"></i><i class="is-spending" style="height:50%"></i>');
      expect(html).toContain('<i class="finance-swatch is-income"></i>Income, money in');
      expect(html).toContain('<i class="finance-swatch is-spending"></i>Spending, money out');
    });
  });

  describe('the movements without a category', () => {
    /** @returns {any} */
    const loose = (/** @type {string} */ date, /** @type {number} */ amount) => ({ ...t(date, amount, null), id: 'tx_loose' + date + amount });

    it('says how many there are and links to the Uncategorised spending line', () => {
      const html = render('month', '2026-04', { rows: [...transactions, loose('2026-04-05', -1200), loose('2026-04-06', -800)] });

      expect(html).toContain('<span class="num">2</span> movements without a category — <a class="finance-account-link" href="/finances?month=2026-04&amp;category=uncategorised-spending">review</a>');
    });

    it('links to each direction when money came in and went out without one', () => {
      const html = render('month', '2026-04', { rows: [...transactions, loose('2026-04-05', -1200), loose('2026-04-06', 800)] });

      expect(html).toContain('category=uncategorised-spending">1 money out</a>');
      expect(html).toContain('category=uncategorised-income">1 money in</a>');
    });

    it('is absent when every movement has a category', () => {
      expect(render('month', '2026-04')).not.toContain('without a category');
    });
  });

  it('sets each spending line against its average month, and offers the year', () => {
    const html = render('month', '2026-04');

    // Food: 200 + 0 + 100 over January to March.
    expect(html).toContain('>Average<');
    expect(html).toContain('>100.00<');
    expect(html).toContain('>vs last month<');
    expect(html).toContain('href="/finances?month=2026-04&amp;period=year"');
    expect(html).toContain('Saved over 12 months');
  });

  it('shows no average with too few months before the selected one', () => {
    const html = render('month', '2026-03');

    expect(html).not.toContain('>Average<');
    expect(html).toContain('No average yet');
  });

  it('draws the composition of spending, named for a screen reader', () => {
    const html = render('month', '2026-04');

    expect(html).toContain('role="img" aria-label="Spending by category: Home 67%, Food 33%"');
  });

  it('reads a year: its own savings rate, no average, a trend of its months that open a month', () => {
    const html = render('year', '2026-03');

    expect(html).toContain('Saved in 2026');
    expect(html).not.toContain('Saved over 12 months');
    expect(html).not.toContain('>Average<');
    expect(html).toContain('aria-label="Year"');
    expect(html).toContain('href="/finances?month=2026-02"');
    expect(html).not.toContain('aria-current="true" aria-label="March 2026');
  });

  it('leaves the change blank when the year before has nothing to compare with', () => {
    const html = render('year', '2026-03');

    expect(html).toContain('>vs 2025<');
    expect(html).not.toContain('n.d.');
    expect(html).not.toMatch(/>\+\u2009/);
  });

  describe('a category with nothing this month or last', () => {
    it('is folded with its average into one row at the end of the spending table, opening when it is selected', () => {
      // Gym: 60.00 in January, nothing since: an average of 20.00 over January to March.
      const html = render('month', '2026-04');
      expect(html).toContain('aria-expanded="false"><span class="finance-quiet-mark" aria-hidden="true">▸</span>1 category with nothing this month</button>');
      expect(html).not.toContain('>Gym<');

      const open = render('month', '2026-04', { place: { category: 'cat_gym' } });
      expect(open).toContain('aria-expanded="true"');
      expect(open).toMatch(/>Gym<\/a><\/td><td class="num">0.00<\/td><td class="num caption">20.00<\/td>/);
      expect(open).toMatch(/>Gym<[\s\S]*?<td class="num caption">0%<\/td>/);
    });

    it('leaves the composition and the lines with money as they were', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('role="img" aria-label="Spending by category: Home 67%, Food 33%"');
      expect(html.indexOf('>Home<')).toBeLessThan(html.indexOf('with nothing this month'));
    });

    it('is not listed in a year, which has no average', () => {
      expect(render('year', '2026-04')).toContain('>Gym<');
      expect(render('month', '2026-03')).not.toContain('>Gym<');
      expect(render('month', '2026-03')).not.toContain('with nothing');
    });
  });

  it('heads the spending table with what was spent and the income table with what was received', () => {
    const html = render('month', '2026-04');

    expect(html).toContain('<th>Spending</th><th class="num">Spent</th>');
    expect(html).toContain('<th>Income</th><th class="num">Received</th>');
  });

  describe('the caption under the spending table', () => {
    it('explains the average only when the table has rows', () => {
      expect(render('month', '2026-04')).toContain('Average: the 3 months on offer');

      const empty = render('month', '2026-04', { rows: [] });
      expect(empty).toContain('Nothing came in or went out in April 2026.');
      expect(empty).not.toContain('Average:');
      expect(empty).not.toContain('No average yet');
    });

    it('says there is no average yet only under a table with rows', () => {
      expect(render('month', '2026-03')).toContain('No average yet');
      expect(render('month', '2026-02', { rows: [] })).not.toContain('No average yet');
    });
  });

  describe('the target savings rate', () => {
    it('sets each rate against the target, in words and a mark', () => {
      // April: 3,000 in, 1,500 out -- 50%; the 12 months: 9,000 in, 3,860 out -- 57%.
      const html = render('month', '2026-04', { target: 40 });

      expect(html.match(/finance-target-mark is-met" aria-hidden="true"><\/i>Meets the 40% target/g)?.length).toBe(2);
      const split = render('month', '2026-04', { target: 55 });
      expect(split).toContain('finance-target-mark" aria-hidden="true"></i>Under the 55% target');
      expect(split).toContain('finance-target-mark is-met" aria-hidden="true"></i>Meets the 55% target');
    });

    it('reads a rate printed as the target as met', () => {
      expect(render('month', '2026-04', { target: 50 })).toMatch(/>50%<\/span><span class="caption finance-target"><i class="finance-target-mark is-met"/);
    });

    it('says nothing about a target with no rate, or with no target', () => {
      // February had no income: its rate is blank, and so is its comparison.
      expect(render('month', '2026-02', { target: 20 })).toContain('Saved this month</span><span class="num">—</span></div>');
      expect(render('month', '2026-04', { rows: [], target: 20 })).not.toContain('finance-target');
      expect(render('month', '2026-04')).not.toContain('finance-target');
    });

    it('in a year, says what would have to be left to meet it, only when it is not met', () => {
      // 2026: 9,000 in, 3,860 out, 5,140 left -- 57%. 60% of 9,000 is 5,400.
      const html = render('year', '2026-04', { target: 60 });
      expect(html).toContain('To meet the 60% target on what came in during 2026, <span class="num">€\u20095,400.00</span> would have to be left: <span class="num">€\u2009260.00</span> more.');

      expect(render('year', '2026-04', { target: 40 })).not.toContain('would have to be left');
      expect(render('month', '2026-04', { target: 60 })).not.toContain('would have to be left');
    });
  });
});
