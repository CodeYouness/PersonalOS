/**
 * What the Income & spending card renders: the trend above the figures --
 * net worth as a line by default, income and spending as bars on the switch
 * -- the composition bar, each spending line against its average in a
 * month, and the year reading with its comparison to the year before (or
 * none). Every row here is invented.
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {} }) }));

const { default: FinanceFlows } = await import('@/components/FinanceFlows.js');
const {
  calendarYearFlows,
  financeOverview,
  flowMonths,
  flowTrend,
  monthFlows,
  savingsRate,
  spendingAverages,
  trendMonths,
  worthTrend,
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

/** A savings account with a balance from February: January's net worth is unknown. */
const savings = {
  id: 'account_savings', name: 'Savings', kind: 'cash', currency: 'EUR', origin: null, archivedOn: null, valuation: 'balance',
  createdAt: '', updatedAt: '', source: 'user',
};
/** @returns {any} */
const balance = (/** @type {string} */ date, /** @type {number} */ amount) => ({
  id: 'observation_' + date, accountId: 'account_savings', kind: 'balance', amount, currency: 'EUR', date,
  observedAt: '', origin: null, createdAt: '', updatedAt: '', source: 'user',
});
const balances = [balance('2026-02-10', 500000), balance('2026-04-05', 650000)];

/**
 * @param {'month' | 'year'} period
 * @param {string} month
 * @param {{ chart?: 'worth' | 'flows', observations?: any[], target?: number | null, rows?: any[] }} [options]
 */
function render(period, month, { chart = 'worth', observations = balances, target = null, rows = transactions } = {}) {
  const months = flowMonths(rows, TODAY, '2026-01-01');
  const year = period === 'year' ? calendarYearFlows(rows, categories, month, months) : null;
  const flows = year ?? monthFlows(rows, categories, month);
  const chartMonths = year?.months ?? trendMonths(months, month);
  const { history } = financeOverview(
    { accounts: [/** @type {any} */ (savings)], observations, trades: [], prices: [], transactions: [], trackedSince: '2026-01-01' },
    TODAY
  );
  return renderToStaticMarkup(
    createElement(FinanceFlows, {
      flows,
      period,
      chart,
      yearRate: period === 'year' ? null : savingsRate(yearFlows(rows, categories, month)),
      target,
      categories,
      trend: flowTrend(rows, categories, chartMonths),
      worth: worthTrend(history, chartMonths, TODAY),
      averages: period === 'year' ? null : spendingAverages(rows, categories, month, months),
      months,
      month,
      todayKey: TODAY,
      place: { month, period, chart },
    })
  );
}

describe('FinanceFlows', () => {
  describe('the chart switch', () => {
    it('draws net worth by default, and offers the bars, keeping where you are', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('class="seg is-on" aria-current="true" href="/finances?month=2026-04">Net worth<');
      expect(html).toContain('class="seg" href="/finances?month=2026-04&amp;chart=flows">Income &amp; spending<');
      expect(html).toContain('aria-label="Net worth by month"');
      expect(html).not.toContain('aria-label="Income and spending by month"');
    });

    it('keeps the bars chosen when another month or the year is read', () => {
      const html = render('month', '2026-04', { chart: 'flows' });

      expect(html).toContain('class="seg is-on" aria-current="true" href="/finances?month=2026-04&amp;chart=flows">Income &amp; spending<');
      expect(html).toContain('href="/finances?month=2026-01&amp;chart=flows"');
      expect(html).toContain('href="/finances?month=2026-04&amp;period=year&amp;chart=flows"');
    });
  });

  describe('the net worth line', () => {
    it('names each month\'s net worth, an unknown month as unknown and left an empty slot', () => {
      const html = render('month', '2026-04');

      expect(html).toMatch(/is-empty"[^>]*aria-label="January 2026: net worth unknown"/);
      expect(html).toContain('aria-label="March 2026: net worth €\u20095,000 on 31 Mar"');
      // The month still running is read as of today.
      expect(html).toMatch(/aria-current="true" aria-label="April 2026: net worth €\u20096,500 on 20 Apr"/);
    });

    it('draws the line from the first known month, marks the selected one, and labels its scale', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('d="M1.5 100 L2.5 100 L3.5 0"');
      expect(html).toContain('finance-worth-point is-selected');
      expect(html).toMatch(/class="is-top num">€\u20096.5k</);
      expect(html).toMatch(/class="is-bottom num">€\u20095k</);
    });

    it('writes the newest value and the change over the span', () => {
      const html = render('month', '2026-04');

      expect(html).toContain('Net worth <span class="num">€\u20096,500</span> on 20 Apr');
      expect(html).toContain('<span class="num">+\u20091,500</span> since 28 Feb');
    });

    it('breaks the line at a month in between that is unknown', () => {
      const html = render('month', '2026-03', { observations: [balance('2026-02-10', 500000)] });

      // Months on offer: January to April; only February onwards has a value.
      expect(html).toContain('d="M1.5 50 L2.5 50 L3.5 50"');
    });

    it('says there is nothing to draw before the first balance, with no scale', () => {
      const html = render('month', '2026-04', { observations: [] });

      expect(html).toContain('No net worth to draw yet');
      expect(html).not.toContain('class="is-top');
      expect(html).not.toMatch(/<path /);
    });

    it('draws the year\'s months in the year reading, none of them selected', () => {
      const html = render('year', '2026-03');

      expect(html).toContain('aria-label="February 2026: net worth €\u20095,000 on 28 Feb"');
      expect(html).not.toContain('is-selected');
    });
  });

  describe('the income and spending bars', () => {
    it('draws a trend whose months read their month, the selected one marked and an empty one left empty', () => {
      const html = render('month', '2026-04', { chart: 'flows' });

      expect(html).toMatch(/aria-current="true"[^>]*aria-label="April 2026: income/);
      expect(html).toMatch(/is-empty"[^>]*aria-label="February 2026: nothing recorded"/);
      expect(html).not.toContain('finance-worth-line');
    });

    it('labels the scale from zero to the highest bar', () => {
      const html = render('month', '2026-04', { chart: 'flows' });

      expect(html).toMatch(/class="is-top num">€\u20093k</);
      expect(html).toMatch(/class="is-bottom num">€\u20090</);
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
    const html = render('year', '2026-03', { chart: 'flows' });

    expect(html).toContain('Saved in 2026');
    expect(html).not.toContain('Saved over 12 months');
    expect(html).not.toContain('>Average<');
    expect(html).toContain('aria-label="Year"');
    expect(html).toContain('href="/finances?month=2026-02&amp;chart=flows"');
    expect(html).not.toContain('aria-current="true" aria-label="March 2026');
  });

  it('leaves the change blank when the year before has nothing to compare with', () => {
    const html = render('year', '2026-03', { chart: 'flows' });

    expect(html).toContain('>vs 2025<');
    expect(html).not.toContain('n.d.');
    expect(html).not.toMatch(/>\+\u2009/);
  });

  describe('a category with nothing this month or last', () => {
    it('is still listed when its average is above zero, at zero and against its average', () => {
      const html = render('month', '2026-04');

      // Gym: 60.00 in January, nothing since: an average of 20.00 over January to March.
      expect(html).toMatch(/>Gym<\/a><\/td><td class="num">0.00<\/td><td class="num caption">20.00<\/td>/);
      expect(html).toMatch(/>Gym<[\s\S]*?<td class="num caption">0%<\/td>/);
    });

    it('is not listed in a year, which has no average', () => {
      expect(render('year', '2026-04')).toContain('>Gym<');
      expect(render('month', '2026-03')).not.toContain('>Gym<');
    });
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
