/**
 * The finance figures of the question context (#174, ADR 0028).
 *
 * The one test that calls a context module directly: the route-level test
 * (questions-route-model.test.js) covers what the model is sent, and this
 * pins what each figure says against the derivation it comes from. The
 * expected numbers are computed here by the same derivations on the same
 * store data for the faked date, never typed in from the screen -- except a
 * few sums on the seed that are written out so a regression in the
 * derivation itself would not pass vacuously.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHANGE_WINDOW_DAYS, financeOverview, flowMonths, monthFlows, savingsRate, yearFlows } from '@/lib/domain/derive/finance.js';
import { percent as formatPercent } from '@/lib/domain/format.js';
import { formatMoney } from '@/lib/ai/context/render.js';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const TODAY = '2026-09-24';
const CURRENT = 'account_seed_current';
const SAVINGS = 'account_seed_savings';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/ai/context/read.js')} */
let read;
/** @type {typeof import('@/lib/ai/context/figures-finance.js')} */
let figures;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-figures-finance-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  read = await import('@/lib/ai/context/read.js');
  figures = await import('@/lib/ai/context/figures-finance.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/** @returns {Promise<{ archive: import('@/lib/ai/context/read.js').Archive, items: import('@/lib/ai/context/build.js').ContextItem[] }>} */
async function build() {
  const archive = await read.readArchive();
  return { archive, items: figures.financeFigures(archive, { today: TODAY }) };
}

/**
 * @param {import('@/lib/ai/context/build.js').ContextItem[]} items
 * @param {string} id
 */
function item(items, id) {
  return items.find((candidate) => candidate.id === id);
}

/** @param {import('@/lib/ai/context/read.js').Archive} archive */
function inputsOf(archive) {
  return {
    accounts: archive.accounts,
    observations: archive.observations,
    trades: archive.trades,
    prices: archive.prices,
    transactions: archive.transactions,
    trackedSince: archive.profile.financeTrackedSince,
  };
}

/** @param {number} minor */
const eur = (minor) => formatMoney(minor, 'EUR');

describe('finance figures: shape', () => {
  it('is an ordinary figure item with a stable id, a label and where it opens', async () => {
    const { items } = await build();

    expect(items.length).toBeGreaterThan(0);
    for (const one of items) {
      expect(one.type).toBe('figure');
      expect(one.labels).toEqual([]);
      expect(one.id).toMatch(/^figure:[a-z0-9-]+(:[A-Za-z0-9._-]+)*$/);
      expect(one.label).not.toBe('');
      expect(one.content).not.toBe('');
    }
    expect(new Set(items.map((one) => one.id)).size).toBe(items.length);
    // No record reference: a colon cannot occur in one.
    expect(items.every((one) => one.id.startsWith('figure:'))).toBe(true);
  });

  it('opens a month figure on that month and a net worth figure on Finances', async () => {
    const { items } = await build();

    expect(item(items, 'figure:spending:2026-01')?.opens).toBe('/finances?month=2026-01');
    expect(item(items, 'figure:category:2026-01:cat_groceries')?.opens).toBe('/finances?month=2026-01');
    expect(item(items, 'figure:net-worth:now')?.opens).toBe('/finances');
    expect(item(items, 'figure:net-worth:2026-01')?.opens).toBe('/finances');
  });

  it('is deterministic for a data set and a date', async () => {
    const first = await build();
    const second = await build();
    expect(second.items).toEqual(first.items);
  });

  it('writes the period into the label, in words', async () => {
    const { items } = await build();

    expect(item(items, 'figure:spending:2026-09')?.label).toBe('Spending, September 2026');
    expect(item(items, 'figure:net-worth:2026-08')?.label).toBe('Net worth, end of August 2026');
  });

  it('does not call the running month an end: its figure is today\'s, and its label says so', async () => {
    const { items } = await build();

    const running = item(items, 'figure:net-worth:2026-09');
    expect(running?.label).toBe('Net worth, September 2026 so far (24 Sep 2026)');
    expect(running?.label).not.toContain('end of');
  });

  it('names the short change by the derivation\'s own window, not a copy of it', async () => {
    const { items } = await build();

    expect(item(items, 'figure:net-worth:change-' + CHANGE_WINDOW_DAYS + 'd')).toBeDefined();
    expect(item(items, 'figure:net-worth:change-' + CHANGE_WINDOW_DAYS + 'd')?.content).toContain('the ' + CHANGE_WINDOW_DAYS + ' days');
  });
});

describe('finance figures: net worth', () => {
  it('says the number the Pulse card shows, with its as-of day', async () => {
    const { archive, items } = await build();
    const overview = financeOverview(inputsOf(archive), TODAY);

    const now = item(items, 'figure:net-worth:now');
    expect(now?.content).toContain(eur(overview.netWorth));
    expect(now?.content).toContain('5 Jan 2026');
    // Every seed account has a value, so nothing is said about unknown ones.
    expect(overview.unmeasuredAccounts).toBe(0);
    expect(now?.content).not.toContain('no known value');
  });

  it('has one figure per month-end of the history, the running month included', async () => {
    const { archive, items } = await build();
    const { history } = financeOverview(inputsOf(archive), TODAY);

    expect(history.length).toBeGreaterThan(1);
    expect(items.filter((one) => one.id.startsWith('figure:net-worth:20')).map((one) => one.id)).toEqual(
      history.map((row) => 'figure:net-worth:' + row.month)
    );
    for (const row of history) {
      const one = item(items, 'figure:net-worth:' + row.month);
      expect(one?.content).toContain(eur(row.netWorth));
      if (row.change !== null) expect(one?.content).toContain('Change from the month before: ' + (row.change > 0 ? '+' : '') + eur(row.change));
    }
    expect(item(items, 'figure:net-worth:2026-09')?.content).toContain('still running');
    expect(item(items, 'figure:net-worth:2026-08')?.content).not.toContain('still running');
  });

  it('gives the 30-day and 1-year changes when the screen shows them, and only then', async () => {
    const { archive, items } = await build();
    const { changes } = financeOverview(inputsOf(archive), TODAY);

    // The seed has a balance from January: 30 days ago is known, a year ago is not.
    const days30 = changes.days30 ?? NaN;
    expect(changes.days30).not.toBeNull();
    expect(item(items, 'figure:net-worth:change-30d')?.content).toContain((days30 > 0 ? '+' : '') + eur(days30));
    expect(changes.year).toBeNull();
    expect(item(items, 'figure:net-worth:change-1y')).toBeUndefined();
  });

  it('gives the 1-year change once a year ago has a value', async () => {
    await store.recordObservation({ accountId: CURRENT, kind: 'balance', amount: 1000000, currency: 'EUR', date: '2025-08-01' });
    const { archive, items } = await build();
    const { changes } = financeOverview(inputsOf(archive), TODAY);

    const year = changes.year ?? NaN;
    expect(changes.year).not.toBeNull();
    expect(item(items, 'figure:net-worth:change-1y')?.content).toContain((year > 0 ? '+' : '') + eur(year));
  });

  it('leaves net worth out when nothing is recorded -- unknown, never zero', async () => {
    for (const observation of await store.getObservations({})) await store.deleteObservation(observation.id);
    for (const trade of await store.getTrades()) await store.deleteTrade(trade.id);
    const { archive, items } = await build();

    expect(financeOverview(inputsOf(archive), TODAY).asOf).toBeNull();
    expect(items.filter((one) => one.id.startsWith('figure:net-worth:'))).toEqual([]);
    // The month figures do not depend on balances.
    expect(item(items, 'figure:spending:2026-01')).toBeDefined();
  });

  it('keeps an account with no balance unknown rather than adding it as zero', async () => {
    const created = await store.createAccount({ name: 'Brokerage (unmeasured)', kind: 'cash', currency: 'EUR' });
    const { archive, items } = await build();
    const overview = financeOverview(inputsOf(archive), TODAY);

    expect(created.id).toBeDefined();
    expect(overview.unmeasuredAccounts).toBe(1);
    const now = item(items, 'figure:net-worth:now');
    expect(now?.content).toContain(eur(overview.netWorth));
    expect(now?.content).toContain('1 account has no known value yet: left out of the total, not counted as zero');
  });
});

describe('finance figures: a month', () => {
  it('matches the derivations for the months on offer', async () => {
    const { archive, items } = await build();
    const categories = archive.profile.financeCategories;
    const months = flowMonths(archive.transactions, TODAY, archive.profile.financeTrackedSince);

    expect(months[0]).toBe('2026-09');
    expect(months[months.length - 1]).toBe('2026-01');
    for (const month of months) {
      const flows = monthFlows(archive.transactions, categories, month);
      expect(item(items, 'figure:income:' + month)?.content).toContain(eur(flows.income));
      expect(item(items, 'figure:spending:' + month)?.content).toContain(eur(flows.spending));
      expect(item(items, 'figure:left:' + month)?.content).toContain(eur(flows.left));
      expect(item(items, 'figure:fixed:' + month)?.content).toContain(eur(flows.fixed));
      expect(item(items, 'figure:variable:' + month)?.content).toContain(eur(flows.variable));

      const monthRate = savingsRate(flows);
      const monthItem = item(items, 'figure:savings-rate:' + month);
      if (monthRate === null) expect(monthItem).toBeUndefined();
      else expect(monthItem?.content).toContain(formatPercent(monthRate));

      const yearRate = savingsRate(yearFlows(archive.transactions, categories, month));
      const yearItem = item(items, 'figure:savings-rate-12m:' + month);
      if (yearRate === null) expect(yearItem).toBeUndefined();
      else expect(yearItem?.content).toContain(formatPercent(yearRate));
    }
  });

  it('says the seed\'s January in numbers, a transfer never counted as spending', async () => {
    const { items } = await build();

    // 2,500.00 + 800.00 in; 950.00 rent + 62.50 groceries out. The 1,000.00
    // moved to savings is a transfer between the user's own accounts.
    expect(item(items, 'figure:income:2026-01')?.content).toContain('3300.00 EUR');
    expect(item(items, 'figure:spending:2026-01')?.content).toContain('1012.50 EUR');
    expect(item(items, 'figure:left:2026-01')?.content).toContain('2287.50 EUR');
    expect(item(items, 'figure:savings-rate:2026-01')?.content).toContain('69%');
    expect(item(items, 'figure:fixed:2026-01')?.content).toContain('950.00 EUR');
    expect(item(items, 'figure:variable:2026-01')?.content).toContain('62.50 EUR');
    expect(item(items, 'figure:spending:2026-01')?.content).toMatch(/transfers between your own accounts/i);
  });

  it('does not count a new transfer, or a not-counted movement, as spending', async () => {
    const before = await build();
    await store.createTransaction({ date: '2026-01-10', amount: -50000, currency: 'EUR', accountId: CURRENT, counterAccountId: SAVINGS });
    await store.createTransaction({ date: '2026-01-11', amount: -7000, currency: 'EUR', accountId: CURRENT, notCounted: true });
    const after = await build();

    expect(item(after.items, 'figure:spending:2026-01')).toEqual(item(before.items, 'figure:spending:2026-01'));
    expect(item(after.items, 'figure:income:2026-01')).toEqual(item(before.items, 'figure:income:2026-01'));
  });

  it('reduces spending by a refund', async () => {
    await store.createTransaction({ date: '2026-01-12', amount: 2000, currency: 'EUR', accountId: CURRENT, categoryId: 'cat_groceries' });
    const { items } = await build();

    expect(item(items, 'figure:spending:2026-01')?.content).toContain('992.50 EUR');
  });

  it('is zero, with no rate, for a month with no transactions', async () => {
    const { items } = await build();

    expect(item(items, 'figure:income:2026-05')?.content).toContain('0.00 EUR');
    expect(item(items, 'figure:spending:2026-05')?.content).toContain('0.00 EUR');
    expect(item(items, 'figure:left:2026-05')?.content).toContain('0.00 EUR');
    // No income: the screen shows "—", so there is no figure.
    expect(item(items, 'figure:savings-rate:2026-05')).toBeUndefined();
    expect(items.filter((one) => one.id.startsWith('figure:category:2026-05:'))).toEqual([]);
  });

  it('offers no month before "tracked since", and no month figure for one', async () => {
    await store.updateProfile({ financeTrackedSince: '2026-07-01' });
    const { archive, items } = await build();

    expect(flowMonths(archive.transactions, TODAY, '2026-07-01')).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(item(items, 'figure:spending:2026-07')).toBeDefined();
    expect(item(items, 'figure:spending:2026-06')).toBeUndefined();
    expect(item(items, 'figure:income:2026-01')).toBeUndefined();
    expect(items.some((one) => one.id.startsWith('figure:category:2026-01:'))).toBe(false);
    // The history starts at the first month-end on or after it, as the History card does.
    const months = financeOverview(inputsOf(archive), TODAY).history.map((row) => row.month);
    expect(months[months.length - 1]).toBe('2026-07');
    expect(item(items, 'figure:net-worth:2026-06')).toBeUndefined();
    expect(item(items, 'figure:net-worth:2026-07')).toBeDefined();
  });
});

describe('finance figures: category lines', () => {
  it('has a line for each category the screen lists, with the screen\'s name and numbers', async () => {
    const { archive, items } = await build();
    const flows = monthFlows(archive.transactions, archive.profile.financeCategories, '2026-01');

    const lines = [...flows.spendingCategories, ...flows.incomeCategories];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const one = item(items, 'figure:category:2026-01:' + line.id);
      expect(one?.label).toBe(line.name + ', January 2026');
      expect(one?.content).toContain(eur(line.total));
      expect(one?.content).toContain(formatPercent(line.share));
    }
    expect(item(items, 'figure:category:2026-01:cat_groceries')?.content).toContain('62.50 EUR');
    expect(item(items, 'figure:category:2026-01:cat_consulting')?.content).toMatch(/^Income from Consulting in January 2026: 2500.00 EUR/);
  });

  it('keeps a category label short and on one line, whatever the user called it', async () => {
    await store.updateFinanceCategory('cat_groceries', { name: 'Line one\nA very long category name that goes on and on and on forever' });
    const { items } = await build();

    const one = item(items, 'figure:category:2026-01:cat_groceries');
    expect(one?.label).not.toMatch(/\s{2}|\n/);
    expect((one?.label ?? '').length).toBeLessThanOrEqual(60);
    expect(one?.label).toMatch(/^Line one A very long/);
  });

  it('writes a negative rate with the real minus the screen uses', async () => {
    // January earns 2500.00 EUR: spend more than that and the month is below zero.
    await store.createTransaction({ date: '2026-01-20', amount: -400000, currency: 'EUR', accountId: CURRENT, categoryId: 'cat_groceries' });
    const { archive, items } = await build();
    const rate = savingsRate(monthFlows(archive.transactions, archive.profile.financeCategories, '2026-01'));

    expect(rate).not.toBeNull();
    expect(/** @type {number} */ (rate)).toBeLessThan(0);
    const content = item(items, 'figure:savings-rate:2026-01')?.content ?? '';
    expect(content).toContain('−');
    expect(content).toContain(formatPercent(/** @type {number} */ (rate)));
    expect(content).not.toMatch(/-\d+%/);
  });

  it('names a subcategory under its parent, and a parent says it includes them', async () => {
    const { items } = await build();

    expect(item(items, 'figure:category:2026-01:cat_rent')?.label).toBe('Rent (under Home), January 2026');
    expect(item(items, 'figure:category:2026-01:cat_rent')?.content).toContain('950.00 EUR');
    expect(item(items, 'figure:category:2026-01:cat_home')?.content).toContain('Includes its subcategories');
  });

  it('shows how a line moved against the month before, with n.d. when that was zero', async () => {
    await store.createTransaction({ date: '2026-02-03', amount: -9000, currency: 'EUR', accountId: CURRENT, categoryId: 'cat_groceries' });
    const { items } = await build();

    const february = item(items, 'figure:category:2026-02:cat_groceries')?.content ?? '';
    expect(february).toContain('90.00 EUR');
    expect(february).toContain('The month before: 62.50 EUR');
    expect(february).toContain('+27.50 EUR (+44%)');
    const january = item(items, 'figure:category:2026-01:cat_groceries')?.content ?? '';
    expect(january).toContain('n.d.');
  });

  it('has an Uncategorised line only when the screen lists one', async () => {
    const before = await build();
    // The seed's one uncategorised movement is a transfer: not a line.
    expect(item(before.items, 'figure:category:2026-01:uncategorised-spending')).toBeUndefined();

    await store.createTransaction({ date: '2026-01-15', amount: -3300, currency: 'EUR', accountId: CURRENT });
    await store.createTransaction({ date: '2026-01-16', amount: 1500, currency: 'EUR', accountId: CURRENT });
    const after = await build();

    const spending = item(after.items, 'figure:category:2026-01:uncategorised-spending');
    expect(spending?.label).toBe('Uncategorised spending, January 2026');
    expect(spending?.content).toContain('33.00 EUR');
    expect(item(after.items, 'figure:category:2026-01:uncategorised-income')?.content).toContain('15.00 EUR');
  });
});
