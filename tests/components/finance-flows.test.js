/**
 * What the Income & spending card renders: the income and spending bars --
 * money in outlined, money out solid -- with no chart switch and no net worth
 * line (ADR 0048); the line counting movements without a category; and,
 * under them, the circle of the period beside its breakdown, or the
 * breakdown alone as a table (ADR 0050): income first, then spending, then
 * the summary; each line's name opening its subcategories; the lines with
 * nothing in the period folded; the year's average and comparison in the
 * table only. Every row here is invented.
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
  lineAverages,
  monthFlows,
  periodInvested,
  savingsRate,
  trendMonths,
  uncategorisedCounts,
  yearFlows,
} = await import('@/lib/domain/derive/finance.js');

const TODAY = '2026-04-20';
const UNIT = 100_000_000;

/** @returns {any} */
const category = (/** @type {any} */ o) => ({ name: o.id, kind: null, parentId: null, fixedCost: false, archived: false, ...o });
const categories = [
  category({ id: 'cat_home', name: 'Home', kind: 'expense' }),
  category({ id: 'cat_food', name: 'Food', kind: 'expense' }),
  category({ id: 'cat_groceries', name: 'Groceries', parentId: 'cat_food' }),
  category({ id: 'cat_gym', name: 'Gym', kind: 'expense' }),
  category({ id: 'cat_pay', name: 'Pay', kind: 'income' }),
];
/** @returns {any} */
const t = (/** @type {string} */ date, /** @type {number} */ amount, /** @type {string | null} */ categoryId) => ({
  id: 'tx_' + date + amount, date, amount, currency: 'EUR', description: '', accountId: 'account_a',
  counterAccountId: null, categoryId, notCounted: false, tags: [], note: '', origin: null,
  createdAt: '', updatedAt: '', source: 'user',
});
/** @returns {any} */
const trade = (/** @type {string} */ date, /** @type {'buy' | 'sell'} */ direction, /** @type {number} */ price) => ({
  id: 'trade_' + date + direction, accountId: 'account_etf', date, direction, units: UNIT, price, fee: 0, currency: 'EUR',
  origin: null, createdAt: '', updatedAt: '', source: 'user',
});
// April: 3,000 in, 1,500 out (Home 1,000, Food 500 on Groceries), 500 invested, 1,000 kept.
// The 12 months and 2026: 9,000 in, 3,920 out, 5,080 left -- 56%.
const transactions = [
  t('2026-01-01', 300000, 'cat_pay'),
  t('2026-01-02', -100000, 'cat_home'),
  t('2026-01-03', -20000, 'cat_food'),
  t('2026-01-04', -6000, 'cat_gym'),
  t('2026-03-01', 300000, 'cat_pay'),
  t('2026-03-02', -100000, 'cat_home'),
  t('2026-03-03', -10000, 'cat_food'),
  t('2026-03-04', -6000, 'cat_gym'),
  t('2026-04-01', 300000, 'cat_pay'),
  t('2026-04-02', -100000, 'cat_home'),
  t('2026-04-03', -50000, 'cat_groceries'),
];
const trades = [trade('2026-04-10', 'buy', 50000)];

/**
 * @param {'month' | 'year'} period
 * @param {string} month
 * @param {{ view?: 'circle' | 'table', target?: number | null, rows?: any[], held?: any[], place?: any }} [options]
 */
function render(period, month, { view = 'circle', target = null, rows = transactions, held = trades, place = {} } = {}) {
  const months = flowMonths(rows, TODAY, '2026-01-01');
  const year = period === 'year' ? calendarYearFlows(rows, categories, month, months) : null;
  const flows = year ?? monthFlows(rows, categories, month);
  const periodMonths = year?.months ?? [month];
  return renderToStaticMarkup(
    createElement(FinanceFlows, {
      flows,
      period,
      view,
      yearRate: period === 'year' ? null : savingsRate(yearFlows(rows, categories, month)),
      target,
      trend: flowTrend(rows, categories, year === null ? trendMonths(months, month) : periodMonths),
      invested: periodInvested(held, periodMonths),
      averages: year === null ? null : lineAverages(year),
      uncategorised: uncategorisedCounts(rows, categories, periodMonths),
      months,
      month,
      place: { month, period, view, ...place },
    })
  );
}

/** The summary list, alone. @param {string} html */
const summaryOf = (html) => html.slice(html.indexOf('<dl class="finance-summary"'), html.indexOf('</dl>') + 5);

describe('FinanceFlows', () => {
  describe('the trend', () => {
    it('draws income and spending as bars, with no chart switch and no net worth line (ADR 0048)', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('aria-label="Income and spending by month"');
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

    it('keeps the view in every month it links to', () => {
      expect(render('month', '2026-04', { view: 'table' })).toContain('href="/finances?month=2026-01&amp;view=table"');
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

  describe('the view (ADR 0050)', () => {
    it('shows the circle by default, beside the breakdown, with no composition bar', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('class="finance-flow-body"');
      expect(html).toContain('class="finance-circle"');
      expect(html).not.toContain('Spending by category:');
    });

    it('offers the circle and the table, keeping the place, and never writes the circle', () => {
      const html = render('month', '2026-04', { place: { category: 'cat_home' } });

      expect(html).toContain('role="group" aria-label="View"');
      expect(html).toContain('aria-current="true" href="/finances?month=2026-04&amp;category=cat_home">Circle</a>');
      expect(html).toContain('href="/finances?month=2026-04&amp;view=table&amp;category=cat_home">Table</a>');
    });

    it('shows the breakdown alone in the table view, with the composition of spending', () => {
      const html = render('month', '2026-04', { view: 'table' });

      expect(html).toContain('class="finance-flow-body is-table"');
      expect(html).not.toContain('class="finance-circle"');
      expect(html).toContain('role="img" aria-label="Spending by category: Home 67%, Food 33%"');
      expect(html).toContain('href="/finances?month=2026-04&amp;period=year&amp;view=table"');
    });
  });

  describe('the circle (ADR 0050)', () => {
    it('is named by what came in and its three parts', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('role="group" aria-label="What came in during April 2026, €\u20093,000: spent €\u20091,500, invested €\u2009500, kept €\u20091,000"');
    });

    it('makes each part focusable, named by its amount and its share of the income, with a title', () => {
      const html = render('month', '2026-04');

      for (const label of ['Spent €\u20091,500, 50% of income', 'Invested €\u2009500, 17% of income', 'Kept €\u20091,000, 33% of income']) {
        expect(html).toMatch(new RegExp('tabindex="0" role="img" aria-label="' + label + '"[^>]*><title>' + label + '</title>'));
      }
    });

    it('says in its centre what came in, and when', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('<span class="caption">April 2026</span><span class="num finance-circle-amount">€\u20093,000</span><span class="caption">came in</span>');
    });

    it('draws spending beyond the income outside the ring, and says it in the centre and the summary', () => {
      const html = render('month', '2026-04', { rows: [t('2026-04-01', 100000, 'cat_pay'), t('2026-04-02', -130000, 'cat_home')], held: [] });

      expect(html).toContain('finance-circle-excess');
      expect(html).toContain('aria-label="Spent €\u2009300 more than came in"');
      expect(html).toContain('<span class="caption down">Spent €\u2009300 more than came in</span>');
      expect(summaryOf(html)).toContain('Spent €\u2009300.00 more than came in');
      expect(html).toContain('Spent €\u20091,300, 130% of income');
    });

    it('is an empty ring without income, saying what was spent', () => {
      const html = render('month', '2026-04', { rows: [t('2026-04-02', -5000, 'cat_home')], held: [] });

      expect(html).toContain('finance-circle-track is-empty');
      expect(html).not.toContain('finance-circle-part');
      expect(html).toContain('<span class="caption">Nothing came in</span>');
      expect(html).toContain('<span class="caption down">Spent €\u200950</span>');
      expect(summaryOf(html)).toContain('Spent €\u200950.00 more than came in');
    });

    it('leaves nothing recorded to the empty state', () => {
      const html = render('month', '2026-04', { rows: [], held: [] });

      expect(html).toContain('Nothing came in or went out in April 2026.');
      expect(html).not.toContain('finance-circle');
      expect(html).not.toContain('finance-summary');
    });
  });

  describe('the breakdown (ADR 0050)', () => {
    it('lists income first, then spending, then the summary', () => {
      const html = render('month', '2026-04');

      expect(html.indexOf('<th>Income</th>')).toBeGreaterThan(-1);
      expect(html.indexOf('<th>Income</th>')).toBeLessThan(html.indexOf('<th>Spending</th>'));
      expect(html.indexOf('<th>Spending</th>')).toBeLessThan(html.indexOf('finance-summary'));
    });

    it('reads the summary as the final account: income, spent, invested, kept, then what was saved', () => {
      const summary = summaryOf(render('month', '2026-04'));
      const order = ['>Income<', '>Spent<', '>Invested<', '>Kept<', 'Saved this month', 'Saved over 12 months', 'Fixed'].map((word) => summary.indexOf(word));

      expect(order.every((at) => at > -1)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(summary).toContain('€\u20093,000.00');
      expect(summary).toContain('€\u2009500.00');
    });

    it('gives each part of the summary its swatch in the circle view, and none in the table', () => {
      expect(summaryOf(render('month', '2026-04'))).toContain('finance-swatch is-invested');
      expect(summaryOf(render('month', '2026-04', { view: 'table' }))).not.toContain('finance-swatch');
    });

    it('says when an investment came out of earlier savings, and when more was sold than bought', () => {
      const big = render('month', '2026-04', { held: [trade('2026-04-10', 'buy', 200000)] });
      // 1,500 left after spending, 2,000 invested.
      expect(summaryOf(big)).toContain('€\u2009500.00 of it from earlier savings');

      const sold = render('month', '2026-04', { held: [trade('2026-01-10', 'buy', 30000), trade('2026-04-10', 'sell', 30000)] });
      expect(summaryOf(sold)).toContain('Sold €\u2009300.00 more than bought');
    });

    it('heads the tables Share then the amount in the circle view, the amount last', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('<th>Spending</th><th class="num">Share</th><th class="num">Spent</th></tr>');
      expect(html).toContain('<th>Income</th><th class="num">Share</th><th class="num">Received</th></tr>');
    });

    it('adds the change from last month in the month\'s table, and never an average or a % column', () => {
      const html = render('month', '2026-04', { view: 'table' });

      expect(html).toContain('<th>Spending</th><th class="num">Share</th><th class="num">vs last month</th><th class="num">Spent</th></tr>');
      expect(html).not.toContain('Average');
      expect(html).not.toContain('<th class="num">%</th>');
    });

    it('adds each line\'s average month and the change from last year in the year\'s table', () => {
      const html = render('year', '2026-04', { view: 'table' });

      expect(html).toContain('<th>Spending</th><th class="num">Share</th><th class="num">Average</th><th class="num">vs 2025</th><th class="num">Spent</th></tr>');
      // Home: 3,000 over January to April.
      expect(html).toMatch(/>Home<\/a><\/td><td class="num caption">77%<\/td><td class="num caption">750.00<\/td><td class="num"><\/td><td class="num">3,000.00<\/td>/);
      expect(html).toContain('Average: per month over the 4 months of 2026 on offer.');
      // The year before was not tracked: no change is shown.
      expect(html).not.toMatch(/>\+\u2009/);
      expect(render('year', '2026-04')).not.toContain('Average');
    });
  });

  describe('a line\'s name', () => {
    it('opens a line with subcategories, and lists the movements of one without', () => {
      const html = render('month', '2026-04');

      expect(html).toMatch(/<button type="button" class="finance-line-toggle" aria-expanded="false"><span class="finance-line-mark" aria-hidden="true">▸<\/span>Food<\/button>/);
      expect(html).not.toContain('>Groceries<');
      expect(html).toContain('href="/finances?month=2026-04&amp;category=cat_home">Home</a>');
    });

    it('shows a selected subcategory open, with what was spent in it and the line\'s own movements', () => {
      const html = render('month', '2026-04', { place: { category: 'cat_groceries' } });

      expect(html).toContain('aria-expanded="true"><span class="finance-line-mark" aria-hidden="true">▾</span>Food</button>');
      expect(html).toMatch(/aria-current="true" href="\/finances\?month=2026-04&amp;category=cat_groceries">Groceries<\/a><\/td><td class="num caption">33%<\/td><td class="num">500.00<\/td>/);
      expect(html).toContain('href="/finances?month=2026-04&amp;category=cat_food">Movements in Food</a>');
    });
  });

  describe('a category with nothing this month', () => {
    it('is folded into one row at the end of the spending table, opening when it is selected', () => {
      // Gym: 60.00 in March, nothing in April.
      const html = render('month', '2026-04');
      expect(html).toContain('aria-expanded="false"><span class="finance-quiet-mark" aria-hidden="true">▸</span>1 category with nothing this month</button>');
      expect(html).not.toContain('>Gym<');

      const open = render('month', '2026-04', { place: { category: 'cat_gym' } });
      expect(open).toMatch(/>Gym<\/a><\/td><td class="num caption">0%<\/td><td class="num">0.00<\/td>/);
    });
  });

  describe('the target savings rate', () => {
    it('sets each rate against the target, in words and a mark', () => {
      const html = render('month', '2026-04', { target: 40 });

      expect(html.match(/finance-target-mark is-met" aria-hidden="true"><\/i>Meets the 40% target/g)?.length).toBe(2);
      const split = render('month', '2026-04', { target: 55 });
      expect(split).toContain('finance-target-mark" aria-hidden="true"></i>Under the 55% target');
      expect(split).toContain('finance-target-mark is-met" aria-hidden="true"></i>Meets the 55% target');
    });

    it('reads a rate printed as the target as met', () => {
      expect(render('month', '2026-04', { target: 50 })).toMatch(/>50%<\/dd><dd class="caption finance-target"><i class="finance-target-mark is-met"/);
    });

    it('says nothing about a target with no rate, or with no target', () => {
      // A month with spending and no income: its rate is blank, and so is its comparison.
      const blank = render('month', '2026-04', { rows: [t('2026-04-02', -5000, 'cat_home')], held: [], target: 20 });
      expect(blank).toContain('Saved this month</dt><dd class="num">—</dd></div>');
      expect(blank).not.toContain('the 20% target');
      expect(render('month', '2026-04')).not.toContain('finance-target');
    });

    it('in a year, says what would have to be left to meet it, only when it is not met', () => {
      // 2026: 9,000 in, 3,920 out, 5,080 left -- 56%. 60% of 9,000 is 5,400.
      const html = render('year', '2026-04', { target: 60 });
      expect(html).toContain('To meet the 60% target on what came in during 2026, <span class="num">€\u20095,400.00</span> would have to be left: <span class="num">€\u2009320.00</span> more.');

      expect(render('year', '2026-04', { target: 40 })).not.toContain('would have to be left');
      expect(render('month', '2026-04', { target: 60 })).not.toContain('would have to be left');
    });
  });

  it('reads a year: its own savings rate, a trend of its months that open a month', () => {
    const html = render('year', '2026-03');

    expect(html).toContain('Saved in 2026');
    expect(html).not.toContain('Saved over 12 months');
    expect(html).toContain('aria-label="Year"');
    expect(html).toContain('href="/finances?month=2026-02"');
    expect(html).toContain('What came in during 2026');
  });
});
