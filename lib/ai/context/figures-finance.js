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
import { monthOf, yearOf } from '../../domain/dates.js';
import {
  calendarYearFlows,
  CHANGE_WINDOW_DAYS,
  financeOverview,
  flowMonths,
  meetsSavingsTarget,
  monthFlows,
  savingsRate,
  tagFlows,
  targetShortfall,
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
  const target = archive.profile.financeSavingsTarget ?? null;
  const offered = flowMonths(archive.transactions, today, trackedSince);
  const month = monthOf(today);
  // The year reading as the card computes it for today's month (ADR 0044).
  const year = calendarYearFlows(archive.transactions, categories, month, offered);
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
    ...offered.flatMap((each) => monthFigures(archive.transactions, categories, each, currency, target)),
    ...yearFigures(year, month, currency, target),
    ...tagFigures(archive.transactions, categories, month, year.months, currency),
  ];
}

/**
 * The words that set a savings rate against the target savings rate (ADR
 * 0045), as the card does: none without a target or without a rate.
 *
 * @param {number | null} rate
 * @param {number | null} target
 * @returns {string | false}
 */
function againstTarget(rate, target) {
  const meets = meetsSavingsTarget(rate, target);
  return meets !== null && 'Against the target savings rate of ' + target + '%: ' + (meets ? 'meets it.' : 'under it.');
}

/**
 * The calendar year to date of today's month, as Income & spending's year
 * reading shows it (calendarYearFlows, ADR 0044): from January or "tracked
 * since" to today's month. Its period in the id is `<YYYY>-ytd`.
 *
 * @param {ReturnType<typeof calendarYearFlows>} year
 * @param {string} month YYYY-MM, today's
 * @param {string} currency
 * @param {number | null} target
 * @returns {ContextItem[]}
 */
function yearFigures(year, month, currency, target) {
  const period = yearOf(month) + '-ytd';
  const name = yearOf(month) + ' to date';
  const first = year.months[0];
  const last = year.months[year.months.length - 1];
  const span = first === last ? monthLabel(first) : monthLabel(first) + ' to ' + monthLabel(last);
  const opens = financesAddress({ month, period: 'year' });
  const counting = 'Transfers between your own accounts and movements marked not counted are left out.';
  const rate = savingsRate(year);
  const shortfall = targetShortfall(year, target);

  /** @type {ContextItem[]} */
  const items = [
    figure('figure:income:' + period, 'Income, ' + name, opens, [
      'Income in ' + name + ' (' + span + '): ' + formatMoney(year.income, currency),
      'Money earned in income categories (a chargeback reduces it) and uncategorised money in, over those months. ' + counting,
    ]),
    figure('figure:spending:' + period, 'Spending, ' + name, opens, [
      'Spending in ' + name + ' (' + span + '): ' + formatMoney(year.spending, currency),
      'Money spent in spending categories (a refund reduces it) and uncategorised money out, over those months. ' + counting,
    ]),
    figure('figure:left:' + period, 'Left, ' + name, opens, [
      'Left in ' + name + ' (' + span + '): ' + formatMoney(year.left, currency),
      'Income minus spending over those months; negative when more went out than came in.',
    ]),
  ];
  // The screen shows "—" without income: no rate, not 0%.
  if (rate !== null) {
    items.push(
      figure('figure:savings-rate:' + period, 'Savings rate, ' + name, opens, [
        'Savings rate in ' + name + ' (' + span + '): ' + percent(rate),
        'What was left as a share of what came in, over those months together.',
        againstTarget(rate, target),
        shortfall !== null &&
          'To meet it, ' + formatMoney(shortfall.needed, currency) + ' would have to be left of what came in: ' +
            formatMoney(shortfall.more, currency) + ' more.',
      ])
    );
  }
  return items;
}

/**
 * A tag as the part of a figure id after its period: the letters, digits,
 * dots and hyphens it is made of, and every other character -- a space, an
 * underscore, a letter with an accent -- as `_<hex code point>_`. Two
 * different tags never share a key, and the key is always a valid detail
 * of a figure id.
 *
 * @param {string} tag
 * @returns {string}
 */
function tagKey(tag) {
  return [...tag].map((char) => (/^[a-z0-9.-]$/.test(char) ? char : '_' + /** @type {number} */ (char.codePointAt(0)).toString(16) + '_')).join('');
}

/**
 * The By tag card's rows (tagFlows, ADR 0046) for today's month and for the
 * calendar year to date: each tag with a counted movement in the period,
 * its spending, income and movements -- and, on the year's figure only, its
 * totals over all time and its first and last day: today's month is always
 * in the year to date, so the tag has a year figure whenever it has a
 * month one, and the context is sent each line once (#204).
 *
 * @param {import('../../domain/types.js').Transaction[]} transactions
 * @param {import('../../domain/types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM, today's
 * @param {string[]} yearMonths the year reading's months
 * @param {string} currency
 * @returns {ContextItem[]}
 */
function tagFigures(transactions, categories, month, yearMonths, currency) {
  /** @type {[string, string, string[], string | null][]} id period, name, months, the address's period */
  const periods = [
    [month, monthLabel(month), [month], null],
    [yearOf(month) + '-ytd', yearOf(month) + ' to date', yearMonths, 'year'],
  ];
  return periods.flatMap(([period, name, months, reading]) =>
    tagFlows(transactions, categories, months).map((row) => {
      const opens = financesAddress({ month, period: /** @type {'year' | null} */ (reading), tag: row.tag });
      return figure('figure:tag:' + period + ':' + tagKey(row.tag), shortLabel('Tag "' + row.tag + '", ' + name), opens, [
        'Spending tagged "' + row.tag + '" in ' + name + ': ' + formatMoney(row.spending, currency) +
          ', over ' + row.movements + (row.movements === 1 ? ' movement' : ' movements') +
          (row.income !== 0 ? '; income tagged so: ' + formatMoney(row.income, currency) : '') + '.',
        // Today's month is always in the year to date: all time is said once, there.
        reading === 'year' &&
          'All time: ' + formatMoney(row.allSpending, currency) + ' spent' +
            (row.allIncome !== 0 ? ' and ' + formatMoney(row.allIncome, currency) + ' earned' : '') +
            ', over ' + row.allMovements + (row.allMovements === 1 ? ' movement' : ' movements') +
            ', from ' + humanDay(row.first) + ' to ' + humanDay(row.last) + '.',
        'Refunds reduce it, transfers and not-counted movements are out; a movement with several tags counts under each.',
      ]);
    })
  );
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
 * @param {number | null} target the target savings rate, a whole percent
 * @returns {ContextItem[]}
 */
function monthFigures(transactions, categories, month, currency, target) {
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
        againstTarget(monthRate, target),
      ])
    );
  }
  if (yearRate !== null) {
    items.push(
      figure('figure:savings-rate-12m:' + month, 'Savings rate, 12 months to ' + name, opens, [
        'Savings rate over the 12 months ending with ' + name + ': ' + percent(yearRate),
        'What was left as a share of what came in, over those twelve months together.',
        againstTarget(yearRate, target),
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
