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
 * transactions alone: an investment changes value when the market moves and
 * no transaction happens, and a pension or a property never appears in a
 * transaction list at all. A balance is observed, and between two balances
 * a cash account follows the movements recorded on it (ADR 0024) -- the
 * observation anchors the value, the flow carries it forward.
 *
 * All amounts are integers in minor units. Nothing here uses floating point
 * arithmetic on money.
 */

import { limits } from '../../../personalos.config.js';
import { monthOf, monthRange, shiftDayKey, shiftMonth, yearOf } from '../dates.js';
import { wholePercent } from '../format.js';

/**
 * What net worth is computed from. One object, so a new input (trades,
 * prices) reaches every derivation without changing its signature.
 *
 * @typedef {object} FinanceInputs
 * @property {import('../types.js').FinanceAccount[]} accounts
 * @property {import('../types.js').FinanceObservation[]} observations
 * @property {import('../types.js').Trade[]} trades
 * @property {import('../types.js').Price[]} prices
 * @property {import('../types.js').Transaction[]} transactions
 * @property {string | null} [trackedSince] the day tracking started
 *   (ADR 0025): the history and the 1-year change start there. Absent or
 *   null, they start at the first value.
 */

/** One unit, in the 10^-8 units a trade counts in. */
const UNIT = 100_000_000n;

/**
 * An account's value on a date, and the date that value comes from. Null
 * when there is none -- unknown, never zero. The one answer to "what was
 * this account worth", which net worth, the account table and the history
 * all ask.
 *
 * - By balance: its latest observation on or before the date, plus every
 *   movement on it dated after that observation and on or before the date
 *   (ADR 0024), and dated by the later of the two. A movement on the
 *   observation's own day is already in it. Unknown before the first
 *   observation, however many movements there are.
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
 * A category's kind: its own at the top level, its parent's below (#136).
 * Null for a category that does not exist.
 *
 * @param {string | null} categoryId
 * @param {import('../types.js').FinanceCategory[]} categories
 * @returns {'income' | 'expense' | null}
 */
export function categoryKind(categoryId, categories) {
  const category = categories.find((row) => row.id === categoryId);
  if (category === undefined) return null;
  if (category.parentId === null) return category.kind;
  return categories.find((row) => row.id === category.parentId)?.kind ?? null;
}

/**
 * Whether money can be recorded moving on an account by itself, rather than
 * as the other end of a transfer: open, and valued by balance -- a holding is
 * valued by its trades and ignores transactions (ADR 0024). The default
 * account must be one (ADR 0026).
 *
 * @param {import('../types.js').FinanceAccount} account
 * @returns {boolean}
 */
export function isMovableAccount(account) {
  return account.archivedOn === null && account.valuation === 'balance';
}

/**
 * Whether money moved on an account in a transaction: it is the
 * transaction's account, or the other end of a transfer (ADR 0023).
 *
 * @param {Pick<import('../types.js').Transaction, 'accountId' | 'counterAccountId'>} transaction
 * @param {string} accountId
 * @returns {boolean}
 */
export function touchesAccount(transaction, accountId) {
  return transaction.accountId === accountId || transaction.counterAccountId === accountId;
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
    // `>=`: of two balances on one day, the one recorded last reconciles.
    if (latest === null || observation.date >= latest.date) latest = observation;
  }
  if (latest === null) return null;

  let { amount, date } = latest;
  // Money landing in a debt reduces what is owed, which is stored positive.
  const sign = account.kind === 'liability' ? -1 : 1;
  for (const transaction of inputs.transactions) {
    if (transaction.date <= latest.date || transaction.date > onOrBefore) continue;
    if (!touchesAccount(transaction, account.id)) continue;
    // From the account's side: `amount` where it is the account, `-amount`
    // where it is the other end of a transfer.
    amount += sign * (transaction.accountId === account.id ? transaction.amount : -transaction.amount);
    if (transaction.date > date) date = transaction.date;
  }
  return { amount, date };
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
export function valueOfUnits(units, price) {
  return Number((BigInt(units) * BigInt(price) + UNIT / 2n) / UNIT);
}

/**
 * The first day a holding's trades would leave it holding fewer than zero
 * units, or null when they never do. A day is settled whole -- a sell and a
 * buy on one day are fine in either order. The store refuses any trade, or
 * any change to one, that gives this a day (#116).
 *
 * @param {Pick<import('../types.js').Trade, 'date' | 'direction' | 'units'>[]} trades one account's
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
 * The day a holding ran out of units: the day of its last trade, when the
 * trades leave it with none at all. Null while units remain, and for a
 * holding with no trades. A holding that went to zero and came back has no
 * such day. A day is settled whole, as above.
 *
 * @param {Pick<import('../types.js').Trade, 'date' | 'direction' | 'units'>[]} trades one account's
 * @returns {string | null}
 */
export function dayUnitsReachedZero(trades) {
  if (trades.length === 0) return null;
  const held = trades.reduce((sum, trade) => sum + (trade.direction === 'buy' ? trade.units : -trade.units), 0);
  return held === 0 ? trades.reduce((last, trade) => (trade.date > last ? trade.date : last), '') : null;
}

/**
 * Whether a holding's `archivedOn` is the sync's own doing: it held no units
 * on that day, so the sync's archive-at-zero put it there. An archive day on
 * which units were still held was a hand's, and the sync leaves it alone
 * (ADR 0031). Derived from the trades; nothing is stored for it.
 *
 * @param {string} archivedOn day key
 * @param {{ date: string, direction: string, units: number }[]} trades
 * @returns {boolean}
 */
export function wasArchivedAtZero(archivedOn, trades) {
  const held = trades
    .filter((trade) => trade.date <= archivedOn)
    .reduce((sum, trade) => sum + (trade.direction === 'buy' ? trade.units : -trade.units), 0);
  return held === 0;
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

/**
 * The accounts table's sections, in the order net worth is written in, each
 * kind with the allocation bar's part it is (ADR 0049): one map, so a
 * section's subtotal and the bar's part are the same number.
 *
 * @type {readonly { kind: import('../types.js').FinanceAccount['kind'], part: 'cash' | 'invested' | 'otherAssets' | 'debt' }[]}
 */
const SECTIONS = [
  { kind: 'cash', part: 'cash' },
  { kind: 'investment', part: 'invested' },
  { kind: 'asset', part: 'otherAssets' },
  { kind: 'liability', part: 'debt' },
];

/** The account table's order: the sections'. */
const KIND_ORDER = SECTIONS.map((section) => section.kind);

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
 * @property {number} measuredAccounts how many accounts had a value at its
 *   end; 0 when none did, and its net worth is then a 0 the net worth line
 *   draws as unknown (worthTrend, ADR 0046)
 */

/**
 * How far back the short change looks, for net worth and for an account.
 * Exported: the question context names its figure by it (#174).
 */
export const CHANGE_WINDOW_DAYS = 30;

/** How far back the long change looks. */
const YEAR_DAYS = 365;

/** How many month-ends the sparkline holds (the Pulse card's, until ADR 0040). */
const SPARKLINE_MONTHS = 12;

/**
 * Everything the Finances screen and Home's money figures render from (#111):
 * net worth today, its components, how many accounts are unknown, one row
 * per active account, the monthly history (#118), and, first drawn by the
 * Pulse card (#119), the 30-day and 1-year changes, twelve month-ends for a sparkline
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
  /**
   * @param {number} days
   * @param {boolean} [boundedByTracking] blank when that far back is before
   *   the first month-end the history draws (ADR 0025)
   * @returns {number | null} null when nothing had a value that far back
   */
  const changeSince = (days, boundedByTracking = false) => {
    const from = shiftDayKey(todayKey, -days);
    if (boundedByTracking && inputs.trackedSince && from < monthRange(monthOf(inputs.trackedSince)).to) return null;
    const then = netWorthOn(inputs, from);
    return then.measuredAccounts === 0 ? null : now.netWorth - then.netWorth;
  };
  const byMonth = new Map(history.map((row) => [row.month, row.netWorth]));
  const valueDates = rows.flatMap((row) => (row.valueDate === null ? [] : [row.valueDate])).sort();

  return {
    ...now,
    accounts: rows,
    history,
    changes: { days30: changeSince(CHANGE_WINDOW_DAYS), year: changeSince(YEAR_DAYS, true) },
    // Before the first value a month is empty, not zero.
    sparkline: lastMonths(todayKey, SPARKLINE_MONTHS).map((month) => byMonth.get(month) ?? null),
    asOf: valueDates[valueDates.length - 1] ?? null,
  };
}

/**
 * The accounts table's rows, the quiet ones folded (ADR 0048): an account
 * worth zero or unknown with nothing recorded on it -- a movement, either end
 * of a transfer included, a balance or a trade -- from
 * `limits.financeQuietAccountDays` days before today to today goes under
 * "N more accounts". A closed card or an empty pot is still one click away,
 * and twenty accounts read as the handful that hold money. The selected
 * account is always shown, so its row is beside its panel. Both lists keep
 * the table's order.
 *
 * @param {AccountRow[]} rows financeOverview's `accounts`
 * @param {Pick<FinanceInputs, 'transactions' | 'observations' | 'trades'>} inputs
 * @param {{ todayKey: string, selectedId: string | null, days?: number }} options
 * @returns {{ shown: AccountRow[], quiet: AccountRow[] }}
 */
export function quietAccounts(rows, inputs, { todayKey, selectedId, days = limits.financeQuietAccountDays }) {
  const from = shiftDayKey(todayKey, -days);
  /** @param {{ date: string }} row */
  const within = (row) => row.date >= from && row.date <= todayKey;
  /** @type {Set<string>} */
  const active = new Set();
  for (const transaction of inputs.transactions) {
    if (!within(transaction)) continue;
    active.add(transaction.accountId);
    if (transaction.counterAccountId !== null) active.add(transaction.counterAccountId);
  }
  for (const row of [...inputs.observations, ...inputs.trades]) if (within(row)) active.add(row.accountId);

  /** @param {AccountRow} row */
  const quiet = (row) => (row.value === null || row.value === 0) && !active.has(row.account.id) && row.account.id !== selectedId;
  return { shown: rows.filter((row) => !quiet(row)), quiet: rows.filter(quiet) };
}

/**
 * One section of the accounts table (ADR 0049): a kind of account, its rows
 * in the table's order, and its subtotal.
 *
 * @typedef {object} AccountSection
 * @property {import('../types.js').FinanceAccount['kind']} kind
 * @property {'cash' | 'invested' | 'otherAssets' | 'debt'} part the allocation
 *   bar's part the kind is
 * @property {number | null} subtotal minor units: the allocation bar's amount
 *   for the part -- a debt as the positive amount owed -- so the two never
 *   disagree; an unknown value is left out of it, and null when no account of
 *   the kind has a value -- unknown, not zero
 * @property {AccountRow[]} rows
 */

/**
 * The accounts table by kind (ADR 0049): cash, invested, other assets and
 * debt, in that order, each with its subtotal; a kind with no row in `rows`
 * is left out. The subtotal is the whole kind's, read from the allocation
 * the bar draws -- never added up again here -- so grouping only some rows
 * (the shown ones, or the folded quiet ones) does not change it: a quiet
 * account is worth zero or unknown and adds nothing.
 *
 * @param {Pick<ReturnType<typeof financeOverview>, 'cash' | 'invested' | 'otherAssets' | 'liabilities' | 'accounts'>} overview
 * @param {AccountRow[]} rows the rows to group, from `overview.accounts`
 * @returns {AccountSection[]}
 */
export function accountSections(overview, rows) {
  const parts = allocation(overview);
  return SECTIONS.flatMap(({ kind, part }) => {
    const ofKind = rows.filter((row) => row.account.kind === kind);
    if (ofKind.length === 0) return [];
    const measured = overview.accounts.some((row) => row.account.kind === kind && row.value !== null);
    const amount = /** @type {{ amount: number }} */ (parts.find((row) => row.key === part)).amount;
    return [{ kind, part, subtotal: measured ? amount : null, rows: ofKind }];
  });
}

/**
 * The day an account's value comes from, when that is more than
 * `limits.financeStaleAccountDays` days before today (ADR 0049): the table
 * says "since 2 Jan" after its name, so an account nobody updates does not
 * hide among fresh ones. Null when the value is recent enough, and when it is
 * unknown -- the row already says so.
 *
 * @param {Pick<AccountRow, 'valueDate'>} row
 * @param {string} todayKey
 * @param {number} [days]
 * @returns {string | null} day key
 */
export function accountStaleSince(row, todayKey, days = limits.financeStaleAccountDays) {
  if (row.valueDate === null) return null;
  return row.valueDate < shiftDayKey(todayKey, -days) ? row.valueDate : null;
}

/**
 * The `count` months ending with today's, oldest first.
 *
 * @param {string} todayKey
 * @param {number} count
 * @returns {string[]} YYYY-MM
 */
function lastMonths(todayKey, count) {
  const months = [monthOf(todayKey)];
  while (months.length < count) months.unshift(shiftMonth(months[0], -1));
  return months;
}

/**
 * Month-end net worth for every month from the first value to today, newest
 * first -- or, once "tracked since" is set, from the first month-end on or
 * after it (ADR 0025): years that were not tracked are never drawn as years
 * with almost nothing. Earlier trades still count toward a holding's units;
 * they are only not drawn. A value stays flat between two balances or
 * prices: nothing here invents a movement that was not recorded.
 *
 * @param {FinanceInputs} inputs
 * @param {string} todayKey
 * @returns {HistoryRow[]}
 */
function monthlyHistory(inputs, todayKey) {
  const firstValue = firstValueDate(inputs);
  if (firstValue === null || firstValue > todayKey) return [];
  // The first month-end on or after the day is the end of the day's month.
  const first = inputs.trackedSince && inputs.trackedSince > firstValue ? inputs.trackedSince : firstValue;

  /** @type {HistoryRow[]} */
  const rows = [];
  /** @type {number | null} */
  let previous = null;
  for (let month = monthOf(first); month <= monthOf(todayKey); month = shiftMonth(month, 1)) {
    const end = monthRange(month).to;
    const { netWorth, measuredAccounts } = netWorthOn(inputs, end < todayKey ? end : todayKey);
    rows.push({ month, netWorth, change: previous === null ? null : netWorth - previous, measuredAccounts });
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

/** The Uncategorised lines of the month, one per direction (#137). */
export const UNCATEGORISED_SPENDING = 'uncategorised-spending';
export const UNCATEGORISED_INCOME = 'uncategorised-income';

/**
 * One line of a month (#137): a category's total -- its own movements and,
 * for a parent, its subcategories' -- or an Uncategorised line's; its share
 * of the month's total for its kind; and its change from the previous month.
 *
 * @typedef {object} CategoryFlow
 * @property {string} id a category id, or UNCATEGORISED_SPENDING /
 *   UNCATEGORISED_INCOME
 * @property {string} name
 * @property {number} total minor units, positive for money spent (spending)
 *   or earned (income); a refund or a chargeback reduces it
 * @property {number} own a parent's movements filed on itself, not on a
 *   subcategory; equal to total otherwise
 * @property {number} share 0..1 of the month's spending or income; 0 when
 *   that is 0
 * @property {number} previous the same total in the month before
 * @property {number} change total - previous
 * @property {number | null} changeRatio change measured against the size of
 *   the previous month; null ("n.d.") when it was 0 -- a new expense is not
 *   +infinity
 * @property {CategoryFlow[]} children a parent's subcategories, in order
 */

/**
 * The month's flows, the Income & spending section's numbers (#137). A
 * category's kind decides what its money is: in a spending category a
 * negative amount is spending and a refund reduces it; in an income category
 * a positive amount is income and a chargeback reduces it. Uncategorised
 * money counts by its sign, on a line per direction. Transfers and
 * not-counted transactions are left out (flowsBetween).
 *
 * A line is listed when it has money this month or the last; a parent also
 * when one of its subcategories does, so it can always be opened. Fixed vs
 * variable reads each transaction's own category's flag, never its
 * parent's; uncategorised spending is variable. A month is always compared
 * with the month before (`compared` is true).
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM
 * @returns {PeriodFlows}
 */
export function monthFlows(transactions, categories, month) {
  return periodFlows(transactions, categories, [month], [shiftMonth(month, -1)]);
}

/**
 * The flows of a period of months: what monthFlows reads for one month and
 * calendarYearFlows for a year -- one implementation, so a year is
 * always the sum of its months.
 *
 * @typedef {object} PeriodFlows
 * @property {number} income
 * @property {number} spending
 * @property {number} left
 * @property {number} fixed
 * @property {number} variable
 * @property {CategoryFlow} uncategorisedSpending
 * @property {CategoryFlow} uncategorisedIncome
 * @property {CategoryFlow[]} spendingCategories
 * @property {CategoryFlow[]} incomeCategories
 * @property {boolean} compared whether `previous`, `change` and `changeRatio`
 *   compare with anything; when false they are against nothing, and are
 *   not shown
 */

/**
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM, the period
 * @param {string[] | null} previous YYYY-MM, the period it is compared with;
 *   null for none
 * @returns {PeriodFlows}
 */
function periodFlows(transactions, categories, months, previous) {
  const now = totalsOver(transactions, categories, months);
  const before = totalsOver(transactions, categories, previous ?? []);
  /** @param {'income' | 'expense'} kind @param {number} whole */
  const lines = (kind, whole) =>
    categories
      .filter((category) => category.parentId === null && category.kind === kind)
      .map((parent) => {
        const children = categories
          .filter((category) => category.parentId === parent.id)
          .map((child) => categoryFlow(child, now.byCategory, before.byCategory, whole, []));
        return categoryFlow(parent, now.byCategory, before.byCategory, whole, children);
      })
      .filter((line) => line.total !== 0 || line.previous !== 0 || line.children.length > 0);
  /** @param {string} id @param {'income' | 'spending'} direction */
  const uncategorised = (id, direction) =>
    lineFlow(id, 'Uncategorised', now.uncategorised[direction], before.uncategorised[direction], now[direction], []);

  return {
    income: now.income,
    spending: now.spending,
    left: now.income - now.spending,
    fixed: now.fixed,
    variable: now.spending - now.fixed,
    uncategorisedSpending: uncategorised(UNCATEGORISED_SPENDING, 'spending'),
    uncategorisedIncome: uncategorised(UNCATEGORISED_INCOME, 'income'),
    spendingCategories: lines('expense', now.spending),
    incomeCategories: lines('income', now.income),
    compared: previous !== null,
  };
}

/**
 * Whether a transaction is one a line of the month counts (#137): the same
 * rule monthFlows totals by, so a line's list never shows money its total
 * leaves out. A category line holds its flows and, for a parent, its
 * subcategories'; an Uncategorised line holds the flows filed on no category
 * that exists, in its direction. Never a transfer or a not-counted one.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {string} line a category id, UNCATEGORISED_SPENDING or UNCATEGORISED_INCOME
 * @param {import('../types.js').FinanceCategory[]} categories
 * @returns {boolean}
 */
export function lineHolds(transaction, line, categories) {
  if (transaction.counterAccountId !== null || transaction.notCounted) return false;
  const category = countedCategory(transaction, categories);
  if (line === UNCATEGORISED_SPENDING) return category === null && transaction.amount < 0;
  if (line === UNCATEGORISED_INCOME) return category === null && transaction.amount > 0;
  return category !== null && (category.id === line || category.parentId === line);
}

/**
 * The category a flow counts under: its own, when it exists and its kind can
 * be read; otherwise none, and it counts as uncategorised.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {import('../types.js').FinanceCategory[]} categories
 * @returns {import('../types.js').FinanceCategory | null}
 */
function countedCategory(transaction, categories) {
  if (transaction.categoryId === null) return null;
  const category = categories.find((row) => row.id === transaction.categoryId);
  return category === undefined || categoryKind(category.id, categories) === null ? null : category;
}

/**
 * What one transaction counts as by the month's rules.
 *
 * @typedef {object} CountedFlow
 * @property {import('../types.js').FinanceCategory | null} category the
 *   category it counts under; null for uncategorised
 * @property {'income' | 'spending'} direction
 * @property {number} value minor units, positive for money earned (income)
 *   or spent (spending); a refund or a chargeback is negative
 */

/**
 * The one reading of a single transaction every flow adds up (#137, ADR
 * 0023): null for a transfer or a movement not counted; otherwise, in a
 * category, the category's kind decides -- in a spending category a negative
 * amount is spending and a refund reduces it, in an income category a
 * positive amount is income and a chargeback reduces it -- and uncategorised
 * money counts by its sign. A month, a year, a week and a tag (tagFlows) all
 * read a transaction through here, so they never disagree about one.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {import('../types.js').FinanceCategory[]} categories
 * @returns {CountedFlow | null}
 */
function countedFlow(transaction, categories) {
  if (transaction.counterAccountId !== null || transaction.notCounted) return null;
  const category = countedCategory(transaction, categories);
  if (category === null) {
    return transaction.amount < 0
      ? { category, direction: 'spending', value: -transaction.amount }
      : { category, direction: 'income', value: transaction.amount };
  }
  return categoryKind(category.id, categories) === 'income'
    ? { category, direction: 'income', value: transaction.amount }
    : { category, direction: 'spending', value: -transaction.amount };
}

/**
 * Whether a tag's reading counts a transaction (ADR 0046): it carries the
 * tag and is counted -- never a transfer or a movement not counted -- the
 * same rule its totals add by, so a tag's list never shows money its total
 * leaves out and is as long as its count of movements.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {string} tag
 * @returns {boolean}
 */
export function tagHolds(transaction, tag) {
  return transaction.counterAccountId === null && !transaction.notCounted && transaction.tags.includes(tag);
}

/**
 * The transactions Finances' Transactions card lists, newest first as they
 * are handed (#134, #137, ADR 0046): the period's -- or, with a line
 * selected, the period's the line counts (lineHolds); with a tag, the
 * period's the tag counts (tagHolds), or all of them, whatever the period,
 * with `span: 'all'`. A month or a year with nothing selected is a hundred
 * rows or hundreds (ADR 0048): only the newest `max`, and `more` says how
 * many were left out, so the card can say so, offer them all and say how to
 * narrow it. With `span: 'all'` and nothing selected, the whole period. A
 * selected line or tag is listed whole.
 *
 * @param {import('../types.js').Transaction[]} transactions newest first
 * @param {{
 *   categories: import('../types.js').FinanceCategory[],
 *   months: string[],
 *   category: string | null,
 *   tag: string | null,
 *   span: 'all' | null,
 *   max: number,
 * }} selection
 * @returns {{ rows: import('../types.js').Transaction[], more: number }}
 */
export function listedTransactions(transactions, { categories, months, category, tag, span, max }) {
  const inPeriod = new Set(months);
  const rows = transactions.filter((transaction) => {
    if (tag !== null) return tagHolds(transaction, tag) && (span === 'all' || inPeriod.has(monthOf(transaction.date)));
    if (!inPeriod.has(monthOf(transaction.date))) return false;
    return category === null || lineHolds(transaction, category, categories);
  });
  if (category !== null || tag !== null || span === 'all' || rows.length <= max) return { rows, more: 0 };
  return { rows: rows.slice(0, max), more: rows.length - max };
}

/**
 * How many of a period's counted movements are on no category (ADR 0048),
 * by direction -- exactly the ones the Uncategorised lines hold (lineHolds),
 * so the count and the list a "review" link opens are the same length. A
 * transfer or a movement not counted needs no category and is not counted.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM, the period
 * @returns {{ spending: number, income: number }}
 */
export function uncategorisedCounts(transactions, categories, months) {
  const inPeriod = new Set(months);
  let spending = 0;
  let income = 0;
  for (const transaction of transactions) {
    if (!inPeriod.has(monthOf(transaction.date))) continue;
    if (lineHolds(transaction, UNCATEGORISED_SPENDING, categories)) spending += 1;
    else if (lineHolds(transaction, UNCATEGORISED_INCOME, categories)) income += 1;
  }
  return { spending, income };
}

/**
 * One tag of a period (ADR 0046).
 *
 * @typedef {object} TagFlow
 * @property {string} tag
 * @property {number} movements counted movements in the period
 * @property {number} spending minor units, in the period; a refund reduces it
 * @property {number} income minor units, in the period; a chargeback reduces it
 * @property {number} allMovements counted movements on any day
 * @property {number} allSpending minor units, on any day
 * @property {number} allIncome minor units, on any day
 * @property {string} first day key of its first counted movement
 * @property {string} last day key of its last counted movement
 */

/**
 * Spending and income by tag (ADR 0046): for a period of months -- the month
 * or the calendar year Income & spending reads -- each tag with a counted
 * movement in it, its spending and income by the month's rules (countedFlow),
 * its number of movements, and, since a trip rarely fits one month, its
 * totals over all time and its first and last day. A movement with several
 * tags counts under each, so the tags' totals do not add up to the period's
 * spending. Largest spending in the period first, then by name.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM, the period
 * @returns {TagFlow[]}
 */
export function tagFlows(transactions, categories, months) {
  const period = new Set(months);
  /** @type {Map<string, TagFlow>} */
  const byTag = new Map();
  for (const transaction of transactions) {
    if (transaction.tags.length === 0) continue;
    const flow = countedFlow(transaction, categories);
    if (flow === null) continue;
    const inPeriod = period.has(monthOf(transaction.date));
    for (const tag of new Set(transaction.tags)) {
      const row = byTag.get(tag) ?? {
        tag, movements: 0, spending: 0, income: 0, allMovements: 0, allSpending: 0, allIncome: 0,
        first: transaction.date, last: transaction.date,
      };
      row.allMovements += 1;
      if (flow.direction === 'spending') row.allSpending += flow.value;
      else row.allIncome += flow.value;
      if (transaction.date < row.first) row.first = transaction.date;
      if (transaction.date > row.last) row.last = transaction.date;
      if (inPeriod) {
        row.movements += 1;
        if (flow.direction === 'spending') row.spending += flow.value;
        else row.income += flow.value;
      }
      byTag.set(tag, row);
    }
  }
  return [...byTag.values()]
    .filter((row) => row.movements > 0)
    .sort((a, b) => b.spending - a.spending || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

/**
 * Income and spending over the twelve months ending with `month`, for the
 * savings rate over a year (#137).
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM, the last of the twelve
 * @returns {{ income: number, spending: number }}
 */
export function yearFlows(transactions, categories, month) {
  const { income, spending } = categoryTotals(transactions, categories, shiftMonth(month, -11), month);
  return { income, spending };
}

/**
 * A calendar year to date, the Income & spending section's year reading
 * (ADR 0044): the months on offer in the selected month's calendar year -- from
 * "tracked since" or January, to today's month or December -- read by the
 * month's own rules, so the year is the sum of the months its trend draws.
 *
 * It is compared with the same months a year before -- January to November
 * against January to November, never against a whole year -- and only when
 * every one of them was on offer and held something counted; otherwise
 * `compared` is false and the change is not shown.
 *
 * Not `yearFlows`: that is the twelve months ending with a month, the
 * savings rate over 12 months the section and the question context show.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM, a month of the year
 * @param {string[]} offered the months on offer, as flowMonths gives them
 * @returns {PeriodFlows & { months: string[] }}
 */
export function calendarYearFlows(transactions, categories, month, offered) {
  const found = yearMonths(offered, month);
  const months = found.length === 0 ? [month] : found;
  const before = months.map((each) => shiftMonth(each, -12));
  const comparable =
    before.every((each) => offered.includes(each)) && totalsOver(transactions, categories, before).flows > 0;
  return { ...periodFlows(transactions, categories, months, comparable ? before : null), months };
}

/**
 * The months of a month's calendar year that are on offer, oldest first.
 *
 * @param {string[]} offered YYYY-MM, as flowMonths gives them
 * @param {string} month YYYY-MM
 * @returns {string[]}
 */
export function yearMonths(offered, month) {
  const year = yearOf(month);
  return offered.filter((each) => yearOf(each) === year).sort();
}

/** How many months the trend draws. */
export const TREND_MONTHS = 12;

/**
 * The months the trend draws, oldest first: the newest twelve on
 * offer while the selected month is among them -- so picking one of them
 * does not move the others -- and otherwise the twelve ending with it, so
 * the selected month is always drawn.
 *
 * @param {string[]} offered YYYY-MM, as flowMonths gives them
 * @param {string} month YYYY-MM, the selected month
 * @returns {string[]}
 */
export function trendMonths(offered, month) {
  const oldestFirst = [...offered].sort();
  const at = oldestFirst.indexOf(month);
  const newest = Math.max(0, oldestFirst.length - TREND_MONTHS);
  if (at === -1 || at >= newest) return oldestFirst.slice(newest);
  return oldestFirst.slice(Math.max(0, at - TREND_MONTHS + 1), at + 1);
}

/**
 * One month of the trend.
 *
 * @typedef {object} TrendMonth
 * @property {string} month YYYY-MM
 * @property {number | null} income null when nothing was counted that month
 * @property {number | null} spending
 * @property {number | null} left
 */

/**
 * Income, spending and what was left for each month, by the month's
 * own rules (monthFlows): transfers and not-counted movements left out, a
 * refund reducing spending. A month with nothing counted is empty -- all
 * null -- since a month nobody recorded is not a month of zero.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM
 * @returns {TrendMonth[]}
 */
export function flowTrend(transactions, categories, months) {
  return months.map((month) => {
    const totals = categoryTotals(transactions, categories, month);
    if (totals.flows === 0) return { month, income: null, spending: null, left: null };
    return { month, income: totals.income, spending: totals.spending, left: totals.income - totals.spending };
  });
}

/**
 * The trend's bars: each month's income and spending as a height
 * against the highest of either drawn, and what was left as a mark at its
 * own height -- none when nothing was left. Negative income (a net
 * chargeback) has no height; an empty month stays empty, never zero.
 *
 * @param {TrendMonth[]} trend
 * @returns {({ income: number, spending: number, left: number | null } | null)[]}
 *   heights in 0..1, to two decimals
 */
export function trendBars(trend) {
  const high = trendHigh(trend);
  /** @param {number} value */
  const height = (value) => (high === 0 ? 0 : Math.round((Math.max(0, value) / high) * 100) / 100);
  return trend.map((row) => {
    if (row.income === null || row.spending === null || row.left === null) return null;
    return { income: height(row.income), spending: height(row.spending), left: row.left > 0 ? height(row.left) : null };
  });
}

/**
 * The top of the trend's scale: the highest income or spending drawn, which
 * the bars are heights against and the axis prints. Zero when nothing is.
 *
 * @param {TrendMonth[]} trend
 * @returns {number} minor units
 */
export function trendHigh(trend) {
  return Math.max(0, ...trend.flatMap((row) => [row.income ?? 0, row.spending ?? 0]));
}

/**
 * One month of the net worth line (ADR 0044).
 *
 * @typedef {object} WorthMonth
 * @property {string} month YYYY-MM
 * @property {number | null} netWorth minor units; null when unknown
 * @property {string | null} asOf the day it is read on -- the month's last
 *   day, or today for the month still running; null when unknown
 */

/**
 * Net worth at the end of each of the chart's months -- today, for the month
 * still running -- read from the monthly history (financeOverview's
 * `history`), the one reading of net worth over time. A month
 * the history does not draw is unknown: before the first value, before
 * "tracked since" (ADR 0025), after today. Unknown is not zero -- and so is
 * a month the history draws with no account valued at its end (ADR 0046):
 * the only valued account archived before it. The history keeps its 0 there,
 * as the question context has always read it; the
 * line does not draw a fall to nothing that never happened.
 *
 * @param {HistoryRow[]} history
 * @param {string[]} months YYYY-MM, oldest first, as the net worth chart draws them (worthMonths)
 * @param {string} todayKey
 * @returns {WorthMonth[]}
 */
export function worthTrend(history, months, todayKey) {
  const byMonth = new Map(history.flatMap((row) => (row.measuredAccounts === 0 ? [] : [[row.month, row.netWorth]])));
  const current = monthOf(todayKey);
  return months.map((month) => {
    const netWorth = byMonth.get(month) ?? null;
    if (netWorth === null) return { month, netWorth, asOf: null };
    return { month, netWorth, asOf: month === current ? todayKey : monthRange(month).to };
  });
}

/**
 * The least the net worth line's scale spans, as a share of the largest
 * value drawn: a few hundred euros on a hundred thousand are drawn as the
 * near-flat line they are, not as the chart's full height.
 */
export const WORTH_MIN_SPAN = 0.1;

/**
 * The net worth line (ADR 0044): each month's height between the bottom and
 * the top of its scale, the newest value and the change over the span.
 *
 * The scale is the series' own lowest and highest value, not zero: a line is
 * read by its slope and position, and from zero a year of saving 5% would be
 * a flat line. So that a small wobble is not drawn as a cliff, the scale
 * spans at least a tenth of the largest value, widened evenly around the
 * values. The bottom and top are returned so the chart labels them. An
 * unknown month has no point -- a gap in the line, never a zero -- and the
 * change runs from the first known month to the newest.
 *
 * @param {WorthMonth[]} series oldest first
 * @returns {{
 *   points: (number | null)[],
 *   low: number | null,
 *   high: number | null,
 *   first: WorthMonth | null,
 *   newest: WorthMonth | null,
 *   change: number | null,
 * }} points in 0..1, to two decimals; low and high in minor units, the
 *   scale's bottom and top
 */
export function worthLine(series) {
  const known = series.filter((row) => row.netWorth !== null);
  if (known.length === 0) {
    return { points: series.map(() => null), low: null, high: null, first: null, newest: null, change: null };
  }
  const values = known.map((row) => /** @type {number} */ (row.netWorth));
  let low = Math.min(...values);
  let high = Math.max(...values);
  const least = Math.round(Math.max(Math.abs(low), Math.abs(high)) * WORTH_MIN_SPAN);
  if (high - low < least) {
    const widen = least - (high - low);
    low -= Math.floor(widen / 2);
    high += widen - Math.floor(widen / 2);
  }
  const first = known[0];
  const newest = known[known.length - 1];
  return {
    points: series.map((row) => {
      if (row.netWorth === null) return null;
      return high === low ? 0.5 : Math.round(((row.netWorth - low) / (high - low)) * 100) / 100;
    }),
    low,
    high,
    first,
    newest,
    change: known.length < 2 ? null : /** @type {number} */ (newest.netWorth) - /** @type {number} */ (first.netWorth),
  };
}

/**
 * The months the net worth chart covers (ADR 0048): every month of the
 * history, oldest first -- from the first value, or "tracked since", to
 * today's month. All tracked time, so the chart grows by itself as months are
 * filled in; it reads no selected month or period.
 *
 * @param {HistoryRow[]} history newest first, as financeOverview gives it
 * @returns {string[]} YYYY-MM
 */
export function worthMonths(history) {
  return history.map((row) => row.month).reverse();
}

/** At most this many month labels under the net worth chart when it is wide. */
export const WORTH_TICKS_WIDE = 12;

/** At most this many when it is narrow: a phone's width. */
export const WORTH_TICKS_NARROW = 4;

/**
 * The steps the labels thin out by, in months: every month, the quarters,
 * the half years, each January, then every second, fourth and eighth
 * January. Each is a multiple of the one before and counted from January,
 * so a label kept at a coarser step is always one kept at a finer one.
 */
const WORTH_TICK_STEPS = [1, 3, 6, 12, 24, 48, 96];

/**
 * One label under the net worth chart.
 *
 * @typedef {object} WorthTick
 * @property {number} index the month's place in the chart, from 0
 * @property {string} month YYYY-MM
 * @property {boolean} year whether the year is written under it when the
 *   chart is wide: under each January and the first label
 * @property {boolean} narrow whether it is kept when the chart is narrow
 * @property {boolean} narrowYear whether the year is written under it then
 */

/**
 * Which months of the net worth chart are labelled (ADR 0048). Many months
 * stay readable by labelling fewer of them: the finest step -- every month,
 * the quarters (January, April, July, October), the half years, each
 * January, then every other January and so on -- that puts at most
 * `WORTH_TICKS_WIDE` labels under a wide chart and, among those, at most
 * `WORTH_TICKS_NARROW` under a narrow one. The year is written under each
 * January and under the first label, so it is always named.
 *
 * @param {string[]} months YYYY-MM, oldest first
 * @returns {WorthTick[]}
 */
export function worthTicks(months) {
  if (months.length === 0) return [];
  const wide = tickStep(months, WORTH_TICKS_WIDE);
  const narrow = tickStep(months, WORTH_TICKS_NARROW);
  const ticks = months.flatMap((month, index) => (onStep(month, wide) ? [{ index, month }] : []));
  const firstNarrow = ticks.find((tick) => onStep(tick.month, narrow));
  return ticks.map((tick, at) => {
    const january = tick.month.endsWith('-01');
    const kept = onStep(tick.month, narrow);
    return { ...tick, year: january || at === 0, narrow: kept, narrowYear: kept && (january || tick === firstNarrow) };
  });
}

/**
 * The finest step that labels at least one month and at most `max`.
 *
 * @param {string[]} months
 * @param {number} max
 * @returns {number}
 */
function tickStep(months, max) {
  for (const step of WORTH_TICK_STEPS) {
    const count = months.filter((month) => onStep(month, step)).length;
    if (count >= 1 && count <= max) return step;
  }
  return WORTH_TICK_STEPS[WORTH_TICK_STEPS.length - 1];
}

/**
 * Whether a month is labelled at a step: counted from January, and for a
 * step of years from a year the step divides.
 *
 * @param {string} month YYYY-MM
 * @param {number} step months
 * @returns {boolean}
 */
function onStep(month, step) {
  const number = Number(month.slice(5, 7));
  if (step < 12) return (number - 1) % step === 0;
  return number === 1 && Number(yearOf(month)) % (step / 12) === 0;
}

/**
 * The net worth chart of the Net worth card and Home (ADR 0048): net worth
 * at the end of every month tracked (worthMonths, worthTrend), the line
 * drawn through it (worthLine) and the months labelled under it
 * (worthTicks). One derivation, so the two places never draw it apart.
 *
 * @param {HistoryRow[]} history as financeOverview gives it
 * @param {string} todayKey
 * @returns {{ series: WorthMonth[], line: ReturnType<typeof worthLine>, ticks: WorthTick[] }}
 */
export function worthChart(history, todayKey) {
  const months = worthMonths(history);
  const series = worthTrend(history, months, todayKey);
  return { series, line: worthLine(series), ticks: worthTicks(months) };
}

/**
 * A category table without the noise (ADR 0048): the lines with money in
 * the period stay where they are, and the ones with a total of zero -- a
 * category listed for the money of the period before or for its
 * subcategories -- fold into one row at the end, Uncategorised last, which
 * opens to show them. Nothing is dropped: the composition and the shares
 * read the same lines as before.
 *
 * @param {CategoryFlow[]} lines the table's lines, in its order
 * @param {CategoryFlow} uncategorised the table's Uncategorised line
 * @param {boolean} showUncategorised whether the table lists it
 * @returns {{ lines: CategoryFlow[], showUncategorised: boolean, quiet: CategoryFlow[] }}
 */
export function foldedLines(lines, uncategorised, showUncategorised) {
  const quietUncategorised = showUncategorised && uncategorised.total === 0;
  return {
    lines: lines.filter((line) => line.total !== 0),
    showUncategorised: showUncategorised && !quietUncategorised,
    quiet: [...lines.filter((line) => line.total === 0), ...(quietUncategorised ? [uncategorised] : [])],
  };
}

/**
 * The composition bar: each spending line with money spent -- the
 * top-level categories in the table's order, then Uncategorised -- as its
 * part of what they add up to. A net refund has no part, as a bar cannot be
 * negative; the table still shows it.
 *
 * @param {PeriodFlows} flows
 * @returns {{ id: string, name: string, share: number }[]}
 */
export function spendingParts(flows) {
  const spent = [...flows.spendingCategories, flows.uncategorisedSpending].filter((line) => line.total > 0);
  const whole = spent.reduce((sum, line) => sum + line.total, 0);
  return spent.map((line) => ({ id: line.id, name: line.name, share: line.total / whole }));
}

/**
 * The months the Income & spending section offers (#137): from "tracked
 * since" (ADR 0025), or else the first transaction's month, to today's,
 * newest first -- never a month that cannot have data. Today's alone when
 * nothing is recorded.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {string} todayKey
 * @param {string | null} [trackedSince] day key
 * @returns {string[]} YYYY-MM
 */
export function flowMonths(transactions, todayKey, trackedSince = null) {
  const current = monthOf(todayKey);
  let first = current;
  if (trackedSince) {
    first = monthOf(trackedSince) < current ? monthOf(trackedSince) : current;
  } else {
    for (const transaction of transactions) {
      const month = monthOf(transaction.date);
      if (month < first) first = month;
    }
  }
  const months = [];
  for (let month = current; month >= first; month = shiftMonth(month, -1)) months.push(month);
  return months;
}

/**
 * The offered months plus one a selected transaction sits in (#173). A
 * citation links to a transaction with its month, and the transaction can
 * predate "tracked since" or lie after today -- months `flowMonths` leaves
 * out. Dropping the month would show the record beside a list that does not
 * contain it, so that one month is added, not the whole gap.
 *
 * @param {string[]} months from `flowMonths`, newest first
 * @param {string | null} month YYYY-MM
 * @returns {string[]}
 */
export function monthsWith(months, month) {
  if (month === null || months.includes(month)) return months;
  return [...months, month].sort().reverse();
}

/**
 * The savings rate (#137): what was left as a share of what came in. Null
 * when income is zero or less -- 0% or -infinity would be a number that
 * means nothing.
 *
 * @param {{ income: number, spending: number }} flows
 * @returns {number | null}
 */
export function savingsRate({ income, spending }) {
  return income > 0 ? (income - spending) / income : null;
}

/**
 * Whether a savings rate meets the target savings rate (ADR 0045): the rate
 * as it is printed -- a whole percent, `wholePercent` -- at or above the
 * target, so a rate shown as 20% against a target of 20 reads as met. Null
 * when there is no rate (no income: the rate is blank, so is the comparison)
 * or no target.
 *
 * @param {number | null} rate from savingsRate
 * @param {number | null} target whole percent, 1 to 99
 * @returns {boolean | null}
 */
export function meetsSavingsTarget(rate, target) {
  if (rate === null || target === null) return null;
  return wholePercent(rate) >= target;
}

/**
 * What would have had to be left of a period's income to meet the target
 * (ADR 0045): the target's share of the income, rounded up to the cent, and
 * how much more than was left that is. Read from the income and what was
 * left, both on the card. Null when the target is met (meetsSavingsTarget),
 * when there is no rate, or no target -- so it is only ever a shortfall.
 *
 * @param {{ income: number, spending: number, left: number }} flows
 * @param {number | null} target whole percent, 1 to 99
 * @returns {{ needed: number, more: number } | null} minor units
 */
export function targetShortfall(flows, target) {
  if (target === null || meetsSavingsTarget(savingsRate(flows), target) !== false) return null;
  const needed = Math.ceil((flows.income * target) / 100);
  return { needed, more: needed - flows.left };
}

/**
 * What was put into investments in a period of months (ADR 0050), in cash:
 * every trade dated in it, on any holding -- only an investment is valued by
 * units, so every trade is on one -- a buy at what it cost (its units at its
 * price, rounded half up to the cent as valueOfUnits does, plus its fee) and
 * a sell at what it brought back (the same, less its fee). `net` is bought
 * less sold, negative when the period sold more than it bought.
 *
 * Read from the trades alone. A payment to a broker is a transfer or a
 * movement not counted (ADR 0042), never spending, so the money is not
 * counted twice. A merger or a move of units between brokers is a sell and a
 * buy on one day (ADR 0031) and nets out, unless the broker reports the two
 * at different values.
 *
 * @param {import('../types.js').Trade[]} trades
 * @param {string[]} months YYYY-MM, the period
 * @returns {{ bought: number, sold: number, net: number }} minor units
 */
export function periodInvested(trades, months) {
  const inPeriod = new Set(months);
  let bought = 0;
  let sold = 0;
  for (const trade of trades) {
    if (!inPeriod.has(monthOf(trade.date))) continue;
    const value = valueOfUnits(trade.units, trade.price);
    if (trade.direction === 'buy') bought += value + trade.fee;
    else sold += value - trade.fee;
  }
  return { bought, sold, net: bought - sold };
}

/**
 * One part of the circle (ADR 0050).
 *
 * @typedef {object} CirclePart
 * @property {'spent' | 'invested' | 'kept'} key
 * @property {string} name
 * @property {number} amount minor units, what the summary prints: what was
 *   spent, what was invested net, what was kept -- never below zero
 * @property {number | null} share amount over the period's income, which can
 *   pass 1 for what was spent or invested; null without income
 * @property {number} start turns from the top, clockwise, 0..1, to four
 *   decimals: where the drawn part begins
 * @property {number} end where it ends. What is drawn is capped at the
 *   income, so it can be shorter than `share`
 */

/**
 * The circle of a period (ADR 0050).
 *
 * @typedef {object} FlowCircle
 * @property {'empty' | 'no-income' | 'parts'} state `empty` when nothing
 *   came in, went out or was traded; `no-income` when something was spent
 *   or invested but nothing came in -- an outlined ring with nothing drawn on
 *   it; `parts` otherwise
 * @property {number} income the whole: the period's income, 0 when it is
 *   zero or less
 * @property {CirclePart[]} parts spent, invested and kept, in that order,
 *   always all three
 * @property {number} overspent minor units: what was spent beyond what came
 *   in; all of the spending without income
 * @property {number | null} excess turns of the arc drawn outside the ring
 *   for the overspending, from the top, capped at a full turn; null without
 *   overspending or without income
 * @property {number} fromSavings minor units: what was invested beyond what
 *   spending left of the income, so out of earlier savings
 * @property {number} sold minor units: what was sold beyond what was bought
 */

/**
 * The circle Income & spending draws for a period (ADR 0050): the income is
 * the whole, split clockwise from the top into what was spent, what was
 * invested (periodInvested) and what was kept.
 *
 * - **Spent** is the period's spending (a period of net refunds spent
 *   nothing), drawn up to the whole income.
 * - **Invested** is bought less sold, never below zero -- a period that sold
 *   more says how much in `sold` -- drawn up to what spending left; the rest
 *   of it came from earlier savings (`fromSavings`).
 * - **Kept** is what neither took: income less spent less invested, never
 *   below zero. Invested and kept together are what was saved, the savings
 *   rate's (income − spending), whenever spending is within the income and
 *   the investment within what it left.
 * - **Overspending** -- spending beyond the income -- is drawn outside the
 *   ring from the top, as a share of the income, capped at a full turn: more
 *   than twice the income is a whole outer ring, and its amount is said.
 *
 * @param {{ income: number, spending: number }} flows
 * @param {{ bought: number, sold: number, net: number }} invested from periodInvested
 * @returns {FlowCircle}
 */
export function flowCircle(flows, invested) {
  const whole = Math.max(0, flows.income);
  const spent = Math.max(0, flows.spending);
  const put = Math.max(0, invested.net);
  const sold = Math.max(0, -invested.net);
  const spentDrawn = Math.min(spent, whole);
  const investedDrawn = Math.min(put, whole - spentDrawn);
  const kept = whole - spentDrawn - investedDrawn;
  const overspent = Math.max(0, spent - whole);
  /** @param {number} amount */
  const turn = (amount) => (whole === 0 ? 0 : Math.round((amount / whole) * 10000) / 10000);
  /** @type {[CirclePart['key'], string, number, number][]} */
  const rows = [
    ['spent', 'Spent', spent, spentDrawn],
    ['invested', 'Invested', put, investedDrawn],
    ['kept', 'Kept', kept, kept],
  ];
  let at = 0;
  const parts = rows.map(([key, name, amount, drawn]) => {
    const start = at;
    at += drawn;
    return { key, name, amount, share: whole === 0 ? null : amount / whole, start: turn(start), end: turn(at) };
  });
  const nothing = flows.income === 0 && flows.spending === 0 && invested.bought === 0 && invested.sold === 0;
  return {
    state: nothing ? 'empty' : whole === 0 ? 'no-income' : 'parts',
    income: whole,
    parts,
    overspent,
    excess: whole === 0 || overspent === 0 ? null : Math.min(1, turn(overspent)),
    fromSavings: put - investedDrawn,
    sold,
  };
}

/**
 * The SVG path of an arc of the circle (ADR 0050): from `start` to `end`,
 * in turns clockwise from the top, at `radius` around a centre at
 * (`centre`, `centre`), to two decimals. A full turn is two half arcs, which
 * one SVG arc cannot draw; nothing is an empty path.
 *
 * @param {number} start turns, 0..1
 * @param {number} end turns, start..1
 * @param {number} radius
 * @param {number} centre
 * @returns {string}
 */
export function circleArc(start, end, radius, centre) {
  if (end <= start) return '';
  /** @param {number} turns */
  const point = (turns) => {
    const angle = turns * 2 * Math.PI;
    return round2(centre + radius * Math.sin(angle)) + ' ' + round2(centre - radius * Math.cos(angle));
  };
  const arc = (/** @type {number} */ to, /** @type {number} */ large) => 'A ' + radius + ' ' + radius + ' 0 ' + large + ' 1 ' + point(to);
  if (end - start >= 1) return 'M ' + point(start) + ' ' + arc(start + 0.5, 1) + ' ' + arc(start, 1);
  return 'M ' + point(start) + ' ' + arc(end, end - start > 0.5 ? 1 : 0);
}

/**
 * @param {number} value
 * @returns {number} to two decimals, never -0
 */
function round2(value) {
  return Math.round(value * 100) / 100 + 0;
}

/**
 * Each line's average month in a year (ADR 0050): its total over the year's
 * months on offer (calendarYearFlows), rounded to a cent -- every top-level
 * line, every subcategory and both Uncategorised lines. A month with nothing
 * in a line counts as zero: the month was tracked. The year reading only;
 * a month has no average.
 *
 * @param {PeriodFlows & { months: string[] }} year
 * @returns {Map<string, number>} minor units by line id
 */
export function lineAverages(year) {
  const count = Math.max(1, year.months.length);
  /** @type {Map<string, number>} */
  const byLine = new Map();
  for (const line of [...year.spendingCategories, ...year.incomeCategories, year.uncategorisedSpending, year.uncategorisedIncome]) {
    for (const each of [line, ...line.children]) byLine.set(each.id, Math.round(each.total / count));
  }
  return byLine;
}

/**
 * @param {import('../types.js').FinanceCategory} category
 * @param {Map<string, number>} now
 * @param {Map<string, number>} before
 * @param {number} whole the month's spending or income
 * @param {CategoryFlow[]} children
 * @returns {CategoryFlow}
 */
function categoryFlow(category, now, before, whole, children) {
  const total = (now.get(category.id) ?? 0) + children.reduce((sum, child) => sum + child.total, 0);
  const previous = (before.get(category.id) ?? 0) + children.reduce((sum, child) => sum + child.previous, 0);
  return {
    ...lineFlow(category.id, category.name, total, previous, whole, children.filter((child) => child.total !== 0 || child.previous !== 0)),
    own: now.get(category.id) ?? 0,
  };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {number} total
 * @param {number} previous
 * @param {number} whole the month's spending or income
 * @param {CategoryFlow[]} children
 * @returns {CategoryFlow}
 */
function lineFlow(id, name, total, previous, whole, children) {
  const change = total - previous;
  return {
    id,
    name,
    total,
    own: total,
    share: whole === 0 ? 0 : total / whole,
    previous,
    change,
    // Against the size of the previous month: a net refund last month is
    // not a negative base that flips the sign of growth.
    changeRatio: previous === 0 ? null : change / Math.abs(previous),
    children,
  };
}

/**
 * The totals of a list of months, each month by categoryTotals and added up
 * -- the months need not follow each other. Empty totals for no months.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM
 * @returns {ReturnType<typeof totalsBetween>}
 */
function totalsOver(transactions, categories, months) {
  /** @type {ReturnType<typeof totalsBetween>} */
  const sum = { income: 0, spending: 0, fixed: 0, uncategorised: { income: 0, spending: 0 }, byCategory: new Map(), flows: 0 };
  for (const month of new Set(months)) {
    const totals = categoryTotals(transactions, categories, month);
    sum.income += totals.income;
    sum.spending += totals.spending;
    sum.fixed += totals.fixed;
    sum.uncategorised.income += totals.uncategorised.income;
    sum.uncategorised.spending += totals.uncategorised.spending;
    sum.flows += totals.flows;
    for (const [id, value] of totals.byCategory) sum.byCategory.set(id, (sum.byCategory.get(id) ?? 0) + value);
  }
  return sum;
}

/**
 * Income, spending and the fixed part of it, from a first month to a last,
 * and each category's own total -- positive for what it stands for.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} first YYYY-MM
 * @param {string} [last] YYYY-MM, the first when omitted
 */
function categoryTotals(transactions, categories, first, last = first) {
  return totalsBetween(transactions, categories, monthRange(first).from, monthRange(last).to);
}

/**
 * The same totals over any run of days, by the month's own rules: transfers
 * and not-counted rows left out, a refund reducing what it refunds. The week
 * review reads this, so a week and a month never disagree about a purchase.
 * `flows` is how many transactions were counted -- 0 means the figures rest
 * on nothing, which is not the same as having spent 0.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} from day key, inclusive
 * @param {string} to day key, inclusive
 */
export function totalsBetween(transactions, categories, from, to) {
  /** @type {Map<string, number>} */
  const byCategory = new Map();
  let income = 0;
  let spending = 0;
  let fixed = 0;
  const uncategorised = { income: 0, spending: 0 };
  const counted = flowsBetween(transactions, from, to);

  for (const transaction of counted) {
    const { category, direction, value } = /** @type {CountedFlow} */ (countedFlow(transaction, categories));
    if (category === null) {
      uncategorised[direction] += value;
      continue;
    }
    byCategory.set(category.id, (byCategory.get(category.id) ?? 0) + value);
    if (direction === 'income') income += value;
    else {
      spending += value;
      if (category.fixedCost) fixed += value;
    }
  }

  return {
    income: income + uncategorised.income,
    spending: spending + uncategorised.spending,
    fixed,
    uncategorised,
    byCategory,
    flows: counted.length,
  };
}
