/**
 * The finance figures of the context (#174, ADR 0028): the numbers the
 * Finances screen and the Pulse card already show, each as a citable item.
 *
 * Nothing here is computed. Every number comes from the one implementation in
 * lib/domain/derive/finance.js (rule 6), called with the arguments the
 * screens call it with, so the number in an answer is the number on the
 * screen. This module only chooses which results are figures, names their
 * period, and writes them down in words -- including how they count, which is
 * what lets an answer be honest about them ("refunds reduce it", "an account
 * with no balance is left out, not zero").
 *
 * Where a screen shows "--" there is no figure: an unknown is omitted, never
 * written as zero.
 */

import { financesAddress } from '../../domain/addresses.js';
import { monthOf } from '../../domain/dates.js';
import {
  CHANGE_WINDOW_DAYS,
  financeOverview,
  flowMonths,
  monthFlows,
  savingsRate,
  yearFlows,
} from '../../domain/derive/finance.js';
import { formatPercentChange, monthLabel, percent } from '../../domain/format.js';
import { formatMoney, formatMoneyChange, humanDay, joinLines, shortLabel } from './render.js';

/**
 * @typedef {import('./build.js').ContextItem} ContextItem
 * @typedef {import('../../domain/derive/finance.js').CategoryFlow} CategoryFlow
 */

/**
 * @param {string} id figure:<what>:<period>[:<detail>]
 * @param {string} label
 * @param {string | null} opens
 * @param {(string | null | false)[]} lines
 * @returns {ContextItem}
 */
function figure(id, label, opens, lines) {
  return { id, type: 'figure', label, content: joinLines(lines), labels: [], opens };
}

/**
 * @param {import('./read.js').Archive} archive
 * @param {{ today: string }} when today's day key, in the user's timezone
 * @returns {ContextItem[]}
 */
export function financeFigures(archive, { today }) {
  const currency = archive.profile.baseCurrency;
  const categories = archive.profile.financeCategories;
  const trackedSince = archive.profile.financeTrackedSince;
  const inputs = {
    accounts: archive.accounts,
    observations: archive.observations,
    trades: archive.trades,
    prices: archive.prices,
    transactions: archive.transactions,
    trackedSince,
  };

  return [
    ...netWorthFigures(financeOverview(inputs, today), currency, today),
    ...flowMonths(archive.transactions, today, trackedSince).flatMap((month) =>
      monthFigures(archive.transactions, categories, month, currency)
    ),
  ];
}

/**
 * Net worth now, at each month-end the History card draws, and the two
 * changes the Pulse card shows. All from one `financeOverview`, as the
 * screens read it.
 *
 * @param {ReturnType<typeof financeOverview>} overview
 * @param {string} currency
 * @param {string} today
 * @returns {ContextItem[]}
 */
function netWorthFigures(overview, currency, today) {
  const opens = financesAddress();
  const month = monthOf(today);
  /** @type {ContextItem[]} */
  const items = [];

  // The Pulse card says "nothing recorded yet" and no number: so does this.
  if (overview.asOf !== null) {
    items.push(
      figure('figure:net-worth:now', 'Net worth now', opens, [
        'Net worth today (' + humanDay(today) + '): ' + formatMoney(overview.netWorth, currency),
        'Each counted account at its latest known value: cash, investments and other assets, minus what is owed.',
        'The newest balance, movement or price it rests on is from ' + humanDay(overview.asOf) + '.',
        overview.unmeasuredAccounts > 0 &&
          overview.unmeasuredAccounts +
            (overview.unmeasuredAccounts === 1 ? ' account has' : ' accounts have') +
            ' no known value yet: left out of the total, not counted as zero.',
      ])
    );
  }

  const changes = /** @type {const} */ ([
    [CHANGE_WINDOW_DAYS + 'd', CHANGE_WINDOW_DAYS + ' days', overview.changes.days30],
    ['1y', '1 year', overview.changes.year],
  ]);
  for (const [key, name, change] of changes) {
    if (change === null) continue;
    items.push(
      figure('figure:net-worth:change-' + key, 'Net worth change, ' + name, opens, [
        'Change in net worth over the ' + (key === '1y' ? 'year' : name) + ' up to today (' + humanDay(today) + '): ' + formatMoneyChange(change, currency),
        'Net worth today minus net worth then. An account with no known value on a date is left out of that date, not counted as zero.',
      ])
    );
  }

  for (const row of overview.history) {
    // The month still running has no end yet: its row holds today's value.
    const running = row.month === month;
    items.push(
      figure('figure:net-worth:' + row.month, running ? 'Net worth, ' + monthLabel(row.month) + ' so far (' + humanDay(today) + ')' : 'Net worth, end of ' + monthLabel(row.month), opens, [
        running
          ? 'Net worth for ' + monthLabel(row.month) + ', the month still running, so today\'s (' + humanDay(today) + '): ' + formatMoney(row.netWorth, currency)
          : 'Net worth at the end of ' + monthLabel(row.month) + ': ' + formatMoney(row.netWorth, currency),
        row.change !== null && 'Change from the month before: ' + formatMoneyChange(row.change, currency),
      ])
    );
  }
  return items;
}

/**
 * One month on offer, as the Income & spending section shows it.
 *
 * @param {import('../../domain/types.js').Transaction[]} transactions
 * @param {import('../../domain/types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM
 * @param {string} currency
 * @returns {ContextItem[]}
 */
function monthFigures(transactions, categories, month, currency) {
  const flows = monthFlows(transactions, categories, month);
  const monthRate = savingsRate(flows);
  const yearRate = savingsRate(yearFlows(transactions, categories, month));
  const name = monthLabel(month);
  const opens = financesAddress({ month });
  const counting = 'Transfers between your own accounts and movements marked not counted are left out.';

  /** @type {ContextItem[]} */
  const items = [
    figure('figure:income:' + month, 'Income, ' + name, opens, [
      'Income in ' + name + ': ' + formatMoney(flows.income, currency),
      'Money earned in income categories (a chargeback reduces it) and uncategorised money in. ' + counting,
    ]),
    figure('figure:spending:' + month, 'Spending, ' + name, opens, [
      'Spending in ' + name + ': ' + formatMoney(flows.spending, currency),
      'Money spent in spending categories (a refund reduces it) and uncategorised money out. ' + counting,
    ]),
    figure('figure:left:' + month, 'Left, ' + name, opens, [
      'Left in ' + name + ': ' + formatMoney(flows.left, currency),
      'Income minus spending for the month; negative when more went out than came in.',
    ]),
  ];

  // The screen shows "—" without income: no rate, not 0%.
  if (monthRate !== null) {
    items.push(
      figure('figure:savings-rate:' + month, 'Savings rate, ' + name, opens, [
        'Savings rate in ' + name + ': ' + percent(monthRate),
        'What was left as a share of what came in, that month.',
      ])
    );
  }
  if (yearRate !== null) {
    items.push(
      figure('figure:savings-rate-12m:' + month, 'Savings rate, 12 months to ' + name, opens, [
        'Savings rate over the 12 months ending with ' + name + ': ' + percent(yearRate),
        'What was left as a share of what came in, over those twelve months together.',
      ])
    );
  }

  items.push(
    figure('figure:fixed:' + month, 'Fixed spending, ' + name, opens, [
      'Fixed spending in ' + name + ': ' + formatMoney(flows.fixed, currency),
      'The part of the month\'s spending in categories marked as fixed costs.',
    ]),
    figure('figure:variable:' + month, 'Variable spending, ' + name, opens, [
      'Variable spending in ' + name + ': ' + formatMoney(flows.variable, currency),
      'The rest of the month\'s spending: not in a fixed-cost category, uncategorised spending included.',
    ])
  );

  // The section's tables, line by line: parents then their subcategories,
  // Uncategorised last, and only the lines the screen lists.
  /** @type {{ line: CategoryFlow, kind: 'spending' | 'income', parent: string | null }[]} */
  const rows = [];
  for (const [kind, lines, uncategorised] of /** @type {const} */ ([
    ['spending', flows.spendingCategories, flows.uncategorisedSpending],
    ['income', flows.incomeCategories, flows.uncategorisedIncome],
  ])) {
    for (const line of lines) {
      rows.push({ line, kind, parent: null });
      for (const child of line.children) rows.push({ line: child, kind, parent: line.name });
    }
    if (uncategorised.total !== 0 || uncategorised.previous !== 0) {
      rows.push({ line: { ...uncategorised, name: 'Uncategorised ' + kind }, kind, parent: null });
    }
  }
  for (const { line, kind, parent } of rows) {
    const lineLabel = parent === null ? line.name : line.name + ' (under ' + parent + ')';
    items.push(
      figure('figure:category:' + month + ':' + line.id, shortLabel(lineLabel + ', ' + name), opens, [
        (kind === 'spending' ? 'Spending on ' : 'Income from ') + lineLabel + ' in ' + name + ': ' + formatMoney(line.total, currency),
        line.children.length > 0 && 'Includes its subcategories.',
        'Its share of the month\'s ' + kind + ': ' + percent(line.share),
        'The month before: ' + formatMoney(line.previous, currency) + '. Change: ' + formatMoneyChange(line.change, currency) + ' (' + formatPercentChange(line.changeRatio) + ')' +
          (line.changeRatio === null ? ', no percentage when the month before was zero' : ''),
      ])
    );
  }
  return items;
}
