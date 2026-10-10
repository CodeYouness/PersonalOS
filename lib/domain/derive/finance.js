/**
 * Money, computed.
 *
 * Two things live here and they answer different questions:
 *
 *   net worth      a STOCK, from each account's value on a date
 *   income/spend   a FLOW, from transactions over a period
 *
 * They are not interchangeable, and this is the single most important thing
 * to understand about the finance domain. Net worth cannot be derived from
 * transactions: an investment changes value when the market moves and no
 * transaction happens, and a pension or a property never appears in a
 * transaction list at all. Balances are observed. Flows are recorded.
 *
 * All amounts are integers in minor units. Nothing here uses floating point
 * arithmetic on money.
 */

import { shiftDayKey } from '../dates.js';

/**
 * What net worth is computed from. One object, so a new input (trades,
 * prices) reaches every derivation without changing its signature.
 *
 * @typedef {object} FinanceInputs
 * @property {import('../types.js').FinanceAccount[]} accounts
 * @property {import('../types.js').FinanceObservation[]} observations
 * @property {import('../types.js').Trade[]} trades
 * @property {import('../types.js').Price[]} prices
 */

/** One unit, in the 10^-8 units a trade counts in. */
const UNIT = 100_000_000n;

/**
 * An account's value on a date, and the date that value comes from. Null
 * when there is none -- unknown, never zero. The one answer to "what was
 * this account worth", which net worth, the account table and the history
 * all ask.
 *
 * - By balance: its latest observation on or before the date.
 * - By units (a holding): the units held that day times the latest price on
 *   or before it -- a trade's price, or a Price typed without trading, which
 *   wins on a date that has both -- rounded half up to the cent once for the
 *   holding, and dated by that price. Unknown before the first trade. A fee
 *   is what you paid, never what the holding is worth.
 *
 * @param {import('../types.js').FinanceAccount} account
 * @param {FinanceInputs} inputs
 * @param {string} onOrBefore day key
 * @returns {{ amount: number, date: string } | null}
 */
export function accountValueOn(account, inputs, onOrBefore) {
  return account.valuation === 'units'
    ? holdingValueOn(account, inputs, onOrBefore)
    : balanceOn(account, inputs, onOrBefore);
}

/**
 * @param {import('../types.js').FinanceAccount} account
 * @param {FinanceInputs} inputs
 * @param {string} onOrBefore day key
 * @returns {{ amount: number, date: string } | null}
 */
function balanceOn(account, inputs, onOrBefore) {
  /** @type {import('../types.js').FinanceObservation | null} */
  let latest = null;
  for (const observation of inputs.observations) {
    if (observation.accountId !== account.id || observation.date > onOrBefore) continue;
    if (latest === null || observation.date > latest.date) latest = observation;
  }
  return latest === null ? null : { amount: latest.amount, date: latest.date };
}

/**
 * @param {import('../types.js').FinanceAccount} account
 * @param {FinanceInputs} inputs
 * @param {string} onOrBefore day key
 * @returns {{ amount: number, date: string } | null}
 */
function holdingValueOn(account, inputs, onOrBefore) {
  let units = 0;
  let traded = false;
  /** @type {{ date: string, price: number } | null} */
  let latest = null;
  for (const trade of inputs.trades) {
    if (trade.accountId !== account.id || trade.date > onOrBefore) continue;
    traded = true;
    units += trade.direction === 'buy' ? trade.units : -trade.units;
    // The later trade sets the price; on one day, the one recorded last.
    if (latest === null || trade.date >= latest.date) latest = trade;
  }
  if (!traded || latest === null) return null;
  for (const price of inputs.prices) {
    if (price.accountId !== account.id || price.date > onOrBefore) continue;
    // `>=`: on a date with a trade too, the Price typed for it wins.
    if (price.date >= latest.date) latest = price;
  }
  return { amount: valueOfUnits(units, latest.price), date: latest.date };
}

/**
 * Units (10^-8) times a price (cents), in cents, rounded half up. In BigInt:
 * a thousand units at a thousand euros is already past what a float holds
 * exactly once multiplied out.
 *
 * @param {number} units never negative
 * @param {number} price minor units per unit
 * @returns {number}
 */
function valueOfUnits(units, price) {
  return Number((BigInt(units) * BigInt(price) + UNIT / 2n) / UNIT);
}

/**
 * The first day a holding's trades would leave it holding fewer than zero
 * units, or null when they never do. A day is settled whole -- a sell and a
 * buy on one day are fine in either order. The store refuses any trade, or
 * any change to one, that gives this a day (#116).
 *
 * @param {import('../types.js').Trade[]} trades one account's
 * @returns {string | null}
 */
export function firstDayUnitsGoNegative(trades) {
  /** @type {Map<string, number>} */
  const byDay = new Map();
  for (const trade of trades) {
    byDay.set(trade.date, (byDay.get(trade.date) ?? 0) + (trade.direction === 'buy' ? trade.units : -trade.units));
  }
  let units = 0;
  for (const day of [...byDay.keys()].sort()) {
    units += /** @type {number} */ (byDay.get(day));
    if (units < 0) return day;
  }
  return null;
}

/**
 * Whether an account counts on a date: always, until the day it was
 * archived. An archived account keeps counting on every earlier day it had a
 * value, so closing a loan never raises last year's net worth.
 *
 * @param {import('../types.js').FinanceAccount} account
 * @param {string} date day key
 * @returns {boolean}
 */
export function countsOn(account, date) {
  return account.archivedOn === null || date < account.archivedOn;
}

/**
 * Net worth on a date, from each counted account's value on that date.
 *
 * An account with no value is simply absent -- never treated as zero. An
 * account nobody has measured is unknown, and pretending it is empty would
 * quietly understate your position. The sign is meaningful: an overdraft is
 * a negative cash balance and lowers net worth; a liability is the positive
 * amount owed and is subtracted as it stands (docs/domain.md).
 *
 * @param {FinanceInputs} inputs
 * @param {string} onOrBefore day key
 * @returns {{ netWorth: number, cash: number, invested: number, otherAssets: number, liabilities: number, measuredAccounts: number, unmeasuredAccounts: number }}
 */
export function netWorthOn(inputs, onOrBefore) {
  let cash = 0;
  let invested = 0;
  let otherAssets = 0;
  let liabilities = 0;
  let measured = 0;
  let unmeasured = 0;

  for (const account of inputs.accounts) {
    if (!countsOn(account, onOrBefore)) continue;
    const value = accountValueOn(account, inputs, onOrBefore);
    if (value === null) {
      unmeasured += 1;
      continue;
    }
    measured += 1;
    if (account.kind === 'cash') cash += value.amount;
    else if (account.kind === 'investment') invested += value.amount;
    else if (account.kind === 'asset') otherAssets += value.amount;
    else liabilities += value.amount;
  }

  return {
    netWorth: cash + invested + otherAssets - liabilities,
    cash,
    invested,
    otherAssets,
    liabilities,
    measuredAccounts: measured,
    unmeasuredAccounts: unmeasured,
  };
}

/** The account table's order: the order net worth is written in. */
const KIND_ORDER = ['cash', 'investment', 'asset', 'liability'];

/**
 * @typedef {object} AccountRow
 * @property {import('../types.js').FinanceAccount} account
 * @property {number | null} value minor units; null when unknown
 * @property {string | null} valueDate the day the value comes from, so a
 *   stale one shows its age
 * @property {number | null} change30d today's value minus the value 30 days
 *   ago; null when either is unknown -- a missing past is not a change from 0
 */

/**
 * One month of the history: net worth at its end -- today, for the month
 * still running -- and the change from the month before.
 *
 * @typedef {object} HistoryRow
 * @property {string} month YYYY-MM
 * @property {number} netWorth minor units
 * @property {number | null} change null for the first month
 */

/** How far back the short change looks, for net worth and for an account. */
const CHANGE_WINDOW_DAYS = 30;

/** How far back the long change looks. */
const YEAR_DAYS = 365;

/** How many month-ends the Pulse card's sparkline draws. */
const SPARKLINE_MONTHS = 12;

/**
 * Everything the Finances screen and the Pulse card render from (#111):
 * net worth today, its components, how many accounts are unknown, one row
 * per active account, the monthly history (#118), and for the Pulse card
 * (#119) the 30-day and 1-year changes, twelve month-ends for a sparkline
 * and the date of the newest value counted. Never calls the model or an
 * integration -- it is handed what the store holds.
 *
 * The history is derived, not stored (ADR 0022): in one currency the
 * observations, trades and prices it comes from are all still there.
 *
 * @param {FinanceInputs} inputs
 * @param {string} todayKey
 * @returns {ReturnType<typeof netWorthOn> & {
 *   accounts: AccountRow[],
 *   history: HistoryRow[],
 *   changes: { days30: number | null, year: number | null },
 *   sparkline: (number | null)[],
 *   asOf: string | null,
 * }}
 */
export function financeOverview(inputs, todayKey) {
  const monthAgo = shiftDayKey(todayKey, -CHANGE_WINDOW_DAYS);
  const rows = inputs.accounts
    .filter((account) => account.archivedOn === null)
    .map((account) => {
      const value = accountValueOn(account, inputs, todayKey);
      const then = accountValueOn(account, inputs, monthAgo);
      return {
        account,
        value: value?.amount ?? null,
        valueDate: value?.date ?? null,
        change30d: value === null || then === null ? null : value.amount - then.amount,
      };
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.account.kind) - KIND_ORDER.indexOf(b.account.kind));

  const now = netWorthOn(inputs, todayKey);
  const history = monthlyHistory(inputs, todayKey);
  /** @param {number} days @returns {number | null} null when nothing had a value that far back */
  const changeSince = (days) => {
    const then = netWorthOn(inputs, shiftDayKey(todayKey, -days));
    return then.measuredAccounts === 0 ? null : now.netWorth - then.netWorth;
  };
  const byMonth = new Map(history.map((row) => [row.month, row.netWorth]));
  const valueDates = rows.flatMap((row) => (row.valueDate === null ? [] : [row.valueDate])).sort();

  return {
    ...now,
    accounts: rows,
    history,
    changes: { days30: changeSince(CHANGE_WINDOW_DAYS), year: changeSince(YEAR_DAYS) },
    // Before the first value a month is empty, not zero.
    sparkline: lastMonths(todayKey, SPARKLINE_MONTHS).map((month) => byMonth.get(month) ?? null),
    asOf: valueDates[valueDates.length - 1] ?? null,
  };
}

/**
 * The `count` months ending with today's, oldest first.
 *
 * @param {string} todayKey
 * @param {number} count
 * @returns {string[]} YYYY-MM
 */
function lastMonths(todayKey, count) {
  const months = [todayKey.slice(0, 7)];
  while (months.length < count) {
    months.unshift(shiftDayKey(months[0] + '-01', -1).slice(0, 7));
  }
  return months;
}

/**
 * Month-end net worth for every month from the first value to today, newest
 * first. A value stays flat between two balances or prices: nothing here
 * invents a movement that was not recorded.
 *
 * @param {FinanceInputs} inputs
 * @param {string} todayKey
 * @returns {HistoryRow[]}
 */
function monthlyHistory(inputs, todayKey) {
  const first = firstValueDate(inputs);
  if (first === null || first > todayKey) return [];

  /** @type {HistoryRow[]} */
  const rows = [];
  /** @type {number | null} */
  let previous = null;
  for (let month = first.slice(0, 7); month <= todayKey.slice(0, 7); month = nextMonth(month)) {
    const end = lastDayOf(month);
    const { netWorth } = netWorthOn(inputs, end < todayKey ? end : todayKey);
    rows.push({ month, netWorth, change: previous === null ? null : netWorth - previous });
    previous = netWorth;
  }
  return rows.reverse();
}

/**
 * The day of the earliest value: a balance, or a holding's first trade.
 * A price before any trade values nothing, so it does not start the history.
 *
 * @param {FinanceInputs} inputs
 * @returns {string | null}
 */
function firstValueDate(inputs) {
  const dates = [...inputs.observations, ...inputs.trades].map((row) => row.date).sort();
  return dates[0] ?? null;
}

/** @param {string} month YYYY-MM @returns {string} */
function nextMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 12 ? year + 1 + '-01' : year + '-' + String(number + 1).padStart(2, '0');
}

/** @param {string} month YYYY-MM @returns {string} day key */
function lastDayOf(month) {
  return shiftDayKey(nextMonth(month) + '-01', -1);
}

/**
 * The allocation bar: cash, invested, other assets and debt, each as a share
 * of the four together. An overdrawn cash balance has no width -- a bar
 * cannot be negative -- and the legend still shows its amount.
 *
 * @param {{ cash: number, invested: number, otherAssets: number, liabilities: number }} components
 * @returns {{ key: 'cash' | 'invested' | 'otherAssets' | 'debt', amount: number, share: number }[]}
 */
export function allocation({ cash, invested, otherAssets, liabilities }) {
  const parts = /** @type {const} */ ([
    ['cash', cash],
    ['invested', invested],
    ['otherAssets', otherAssets],
    ['debt', liabilities],
  ]);
  const total = parts.reduce((sum, [, amount]) => sum + Math.max(0, amount), 0);
  return parts.map(([key, amount]) => ({
    key,
    amount,
    share: total === 0 ? 0 : Math.max(0, amount) / total,
  }));
}

/**
 * The sparkline's bars: each month's height between the lowest and the
 * highest value shown -- the lowest still visible at a fifth, a flat series
 * at three fifths -- and whether it fell from the month before. An empty
 * month stays empty: it is drawn as nothing, never as zero.
 *
 * @param {(number | null)[]} series minor units, oldest first
 * @returns {({ height: number, fell: boolean } | null)[]} height in 0..1, to
 *   two decimals
 */
export function sparkBars(series) {
  const values = series.filter((value) => value !== null);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return series.map((value, index) => {
    if (value === null) return null;
    const ratio = high === low ? 0.5 : (value - low) / (high - low);
    const before = series[index - 1];
    return {
      height: Math.round((0.2 + 0.8 * ratio) * 100) / 100,
      fell: before !== null && before !== undefined && value < before,
    };
  });
}

/**
 * The transactions in a period that are income or spending: transfers and
 * not-counted ones excluded (ADR 0023).
 *
 * Moving money between two accounts you own is neither income nor spending.
 * Counting it would double your monthly total, and the error looks plausible
 * enough that you would believe it. A transaction is a transfer exactly when
 * it has a counter account. A not-counted one moves a balance and nothing
 * else.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {string} from day key
 * @param {string} to day key
 * @returns {import('../types.js').Transaction[]}
 */
export function flowsBetween(transactions, from, to) {
  return transactions.filter(
    (transaction) =>
      transaction.counterAccountId === null &&
      !transaction.notCounted &&
      transaction.date >= from &&
      transaction.date <= to
  );
}

/**
 * Totals for a period: what came in, what went out, and the difference. A
 * flow counts by its sign -- negative is spending, positive is income -- as
 * every amount is signed from its account's side.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {string} from day key
 * @param {string} to day key
 * @returns {{ income: number, expense: number, net: number, count: number }}
 */
export function periodTotals(transactions, from, to) {
  const flows = flowsBetween(transactions, from, to);
  let income = 0;
  let expense = 0;

  for (const transaction of flows) {
    if (transaction.amount > 0) income += transaction.amount;
    else expense -= transaction.amount;
  }

  return { income, expense, net: income - expense, count: flows.length };
}

/**
 * Totals per category for a period, one direction at a time, as positive
 * amounts: spending is the money that left, income the money that came in.
 *
 * Uncategorised transactions are grouped under the empty string rather than
 * dropped: a total that silently omits what you have not filed yet is worse
 * than one that shows you the gap.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {'income'|'expense'} direction
 * @param {string} from day key
 * @param {string} to day key
 * @returns {Record<string, number>} category id to minor units
 */
export function totalsByCategory(transactions, direction, from, to) {
  /** @type {Record<string, number>} */
  const totals = {};

  for (const transaction of flowsBetween(transactions, from, to)) {
    if ((transaction.amount > 0 ? 'income' : 'expense') !== direction) continue;
    const key = transaction.categoryId ?? '';
    totals[key] = (totals[key] ?? 0) + Math.abs(transaction.amount);
  }

  return totals;
}
