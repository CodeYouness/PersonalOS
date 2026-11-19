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
import { dayKeyRange, monthKeyRange, monthOf, monthRange, shiftDayKey, shiftMonth, yearOf } from '../dates.js';
import { wholePercent } from '../format.js';
import { foldInterest } from './interest.js';
import { hiddenAsRefunded, NO_REFUNDS, refundStanding } from './refunds.js';
import { searchTransactions } from './search.js';

/** @typedef {import('./interest.js').InterestRun} InterestRun */
/** @typedef {import('./refunds.js').RefundPairs} RefundPairs */
/** @typedef {import('./refunds.js').RefundStanding} RefundStanding */

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
 * @property {import('../types.js').Link[]} [refundLinks] the `refund_of`
 *   links (ADR 0055), read into pairs by refundPairs; the flows read them,
 *   balances and net worth never do
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
  const price = holdingPriceOn(account.id, inputs, onOrBefore);
  if (price === null) return null;
  let units = 0;
  for (const trade of inputs.trades) {
    if (trade.accountId !== account.id || trade.date > onOrBefore) continue;
    units += trade.direction === 'buy' ? trade.units : -trade.units;
  }
  return { amount: valueOfUnits(units, price.price), date: price.date };
}

/**
 * The price a holding is valued at on a date, and the day it is from: the
 * latest on or before it -- a trade's price, or a Price typed without
 * trading, which wins on a date that has both. Null before the first trade:
 * a price before it values nothing. The one rule `accountValueOn` and a
 * holding's change since a day (investments.js) both price with.
 *
 * @param {string} accountId a holding's
 * @param {Pick<FinanceInputs, 'trades' | 'prices'>} inputs
 * @param {string} onOrBefore day key
 * @returns {{ price: number, date: string } | null} minor units per whole unit
 */
export function holdingPriceOn(accountId, inputs, onOrBefore) {
  /** @type {{ date: string, price: number } | null} */
  let latest = null;
  for (const trade of inputs.trades) {
    if (trade.accountId !== accountId || trade.date > onOrBefore) continue;
    // The later trade sets the price; on one day, the one recorded last.
    if (latest === null || trade.date >= latest.date) latest = trade;
  }
  if (latest === null) return null;
  for (const price of inputs.prices) {
    if (price.accountId !== accountId || price.date > onOrBefore) continue;
    // `>=`: on a date with a trade too, the Price typed for it wins.
    if (price.date >= latest.date) latest = price;
  }
  return { price: latest.price, date: latest.date };
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
 * One part of the allocation bar with the accounts that make it up (ADR
 * 0053), for the bar's and its legend's hover.
 *
 * @typedef {object} AllocationAccounts
 * @property {'cash' | 'invested' | 'otherAssets' | 'debt'} part
 * @property {number | null} amount minor units: the section's subtotal, the
 *   bar's own amount for the part; null when no account of the kind has a value
 * @property {{ id: string, name: string, value: number }[]} accounts the
 *   kind's accounts with a value other than zero, largest first, then by
 *   name -- a debt as the positive amount owed
 * @property {number} unknown how many of the kind's accounts have no value:
 *   left out, since unknown is not zero
 */

/**
 * What each part of the allocation bar is made of (ADR 0053): the accounts
 * table's sections (accountSections) over every active account, so a part,
 * its section's subtotal and the accounts listed are one reading -- each
 * holding an account of its own, as the table lists it. An account with an
 * unknown value is counted in `unknown`, never listed at 0; one worth exactly
 * zero -- a closed card, an empty pot -- makes up nothing and is not listed
 * (the accounts table folds it too, ADR 0048).
 *
 * @param {Pick<ReturnType<typeof financeOverview>, 'cash' | 'invested' | 'otherAssets' | 'liabilities' | 'accounts'>} overview
 * @returns {AllocationAccounts[]} in the bar's order; a kind with no account
 *   is left out
 */
export function allocationAccounts(overview) {
  return accountSections(overview, overview.accounts).map((section) => ({
    part: section.part,
    amount: section.subtotal,
    accounts: section.rows
      .flatMap((row) => (row.value === null || row.value === 0 ? [] : [{ id: row.account.id, name: row.account.name, value: row.value }]))
      .sort((a, b) => b.value - a.value || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    unknown: section.rows.filter((row) => row.value === null).length,
  }));
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
 * One line of a period (#137): a category's total -- its own movements and,
 * for a parent, its subcategories' -- or an Uncategorised line's, or a
 * parent's own movements alone (ownLine); its share of the period's total
 * for its kind; and how many counted movements it holds.
 *
 * @typedef {object} CategoryFlow
 * @property {string} id a category id, UNCATEGORISED_SPENDING /
 *   UNCATEGORISED_INCOME, or ownLine(parent)
 * @property {string} name
 * @property {number} total minor units, positive for money spent (spending)
 *   or earned (income); a refund or a chargeback reduces it
 * @property {number | null} share of the period's spending or income, 0 and
 *   up -- past 1 beside a net refund; null for a net refund or when the
 *   period's spending or income is not positive (lineShare, ADR 0059)
 * @property {number} movements the counted movements of the period it holds
 *   (lineHolds), a parent's subcategories' included; a movement counted over
 *   several months (ADR 0052) once
 * @property {CategoryFlow[]} children a parent's subcategories listed, in
 *   order
 * @property {CategoryFlow | null} own a parent's movements filed on itself,
 *   not on a subcategory, as a line of their own (ADR 0057) -- when it opens
 *   into subcategories and holds such a movement; null otherwise. The
 *   children's totals and its add up to the parent's.
 */

/**
 * The month's flows, the Income & spending section's numbers (#137). A
 * category's kind decides what its money is: in a spending category a
 * negative amount is spending and a refund reduces it; in an income category
 * a positive amount is income and a chargeback reduces it. Uncategorised
 * money counts by its sign, on a line per direction. Transfers and
 * not-counted transactions are left out (flowsBetween). A refund paired with
 * its purchase (ADR 0055) reduces the purchase's line (countedFlow).
 *
 * Which lines are listed is periodFlows' (ADR 0057). Fixed vs variable
 * reads each transaction's own category's flag, never its parent's;
 * uncategorised spending is variable.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM
 * @param {RefundPairs} [refunds] the pairs (refundPairs, ADR 0055); every
 *   screen and the question context pass them, none pairs nothing
 * @returns {PeriodFlows}
 */
export function monthFlows(transactions, categories, month, refunds = NO_REFUNDS) {
  return periodFlows(transactions, categories, [month], refunds);
}

/**
 * How a line of a month moved against the month before.
 *
 * @typedef {object} LineChange
 * @property {number} previous the line's total in the month before
 * @property {number} change total - previous
 * @property {number | null} changeRatio change measured against the size of
 *   the month before; null ("n.d.") when it was 0 -- a new expense is not
 *   +infinity
 */

/**
 * Each line of a month against the month before (#137): every category
 * listed and subcategory, and both Uncategorised lines, by id. The question
 * context states it; Income & spending no longer shows a comparison (ADR
 * 0057), so the month's flows carry none. A parent's month before is its own
 * movements and all its subcategories', as its total is.
 *
 * @param {PeriodFlows} flows the month's (monthFlows)
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM, the month of `flows`
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {Map<string, LineChange>}
 */
export function lineChanges(flows, transactions, categories, month, refunds = NO_REFUNDS) {
  const before = totalsOver(transactions, categories, [shiftMonth(month, -1)], refunds);
  /** @param {string} id */
  const ownBefore = (id) => before.byCategory.get(id) ?? 0;
  /** @type {Map<string, LineChange>} */
  const byLine = new Map();
  /** @param {CategoryFlow} line @param {number} previous */
  const add = (line, previous) => {
    const change = line.total - previous;
    // Against the size of the month before: a net refund then is not a
    // negative base that flips the sign of growth.
    byLine.set(line.id, { previous, change, changeRatio: previous === 0 ? null : change / Math.abs(previous) });
  };
  for (const line of [...flows.spendingCategories, ...flows.incomeCategories]) {
    const subcategories = categories.filter((category) => category.parentId === line.id);
    add(line, subcategories.reduce((sum, category) => sum + ownBefore(category.id), ownBefore(line.id)));
    for (const child of line.children) add(child, ownBefore(child.id));
  }
  add(flows.uncategorisedSpending, before.uncategorised.spending);
  add(flows.uncategorisedIncome, before.uncategorised.income);
  return byLine;
}

/**
 * The flows of a period of months: what monthFlows reads for one month and
 * calendarYearFlows for a year -- one implementation, so a year is
 * always the sum of its months. A movement counted over several months (ADR
 * 0052) adds its part in each (totalsOver).
 *
 * @typedef {object} PeriodFlows
 * @property {number} income
 * @property {number} spending
 * @property {number} left
 * @property {number} fixed
 * @property {number} variable
 * @property {FixedCost[]} fixedCosts what `fixed` is made of (ADR 0060)
 * @property {CategoryFlow} uncategorisedSpending
 * @property {CategoryFlow} uncategorisedIncome
 * @property {CategoryFlow[]} spendingCategories
 * @property {CategoryFlow[]} incomeCategories
 */

/**
 * Which lines a period lists (ADR 0057): a spending line, or a subcategory
 * of one, only when it holds a counted movement in the period -- a purchase
 * refunded in full nets to nothing and is listed, since it happened; a line
 * with nothing in the period is not, whatever it had before. **Income lists
 * every category and subcategory**, also at nothing, so each pay line shows
 * in a month it paid nothing -- unless it is archived (it, or its parent)
 * and holds nothing. The Uncategorised lines are always given; the screen
 * lists one when it holds a movement.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM, the period
 * @param {RefundPairs} refunds
 * @returns {PeriodFlows}
 */
function periodFlows(transactions, categories, months, refunds) {
  const now = totalsOver(transactions, categories, months, refunds);
  /** @param {'income' | 'expense'} kind @param {number} whole */
  const lines = (kind, whole) => {
    /** @param {CategoryFlow} line @param {boolean} archived */
    const listed = (line, archived) => line.movements > 0 || (kind === 'income' && !archived);
    return categories
      .filter((category) => category.parentId === null && category.kind === kind)
      .map((parent) => {
        const children = categories
          .filter((category) => category.parentId === parent.id)
          .map((child) => ({ child, line: categoryFlow(child, now, whole, []) }));
        const line = categoryFlow(
          parent,
          now,
          whole,
          children.filter(({ child, line: each }) => listed(each, parent.archived || child.archived)).map(({ line: each }) => each)
        );
        return { line, archived: parent.archived };
      })
      .filter(({ line, archived }) => listed(line, archived))
      .map(({ line }) => line);
  };
  /** @param {string} id @param {'income' | 'spending'} direction */
  const uncategorised = (id, direction) =>
    lineFlow(id, 'Uncategorised', now.uncategorised[direction], now.held.get(id) ?? 0, now[direction], []);

  return {
    income: now.income,
    spending: now.spending,
    left: now.income - now.spending,
    fixed: now.fixed,
    variable: now.spending - now.fixed,
    fixedCosts: fixedCostsOf(now, categories),
    uncategorisedSpending: uncategorised(UNCATEGORISED_SPENDING, 'spending'),
    uncategorisedIncome: uncategorised(UNCATEGORISED_INCOME, 'income'),
    spendingCategories: lines('expense', now.spending),
    incomeCategories: lines('income', now.income),
  };
}

/**
 * A category marked as a fixed cost and what it counted in a period: one
 * part of the period's `fixed`.
 *
 * @typedef {object} FixedCost
 * @property {string} id the category's
 * @property {string} name
 * @property {number} amount minor units, as the period's spending counts it
 */

/**
 * What a period's fixed spending is made of (ADR 0060): each category marked
 * as a fixed cost with its own total, read from the totals `fixed` is added
 * up in (addFlow) -- a movement's own category's flag, spending only, a
 * paired refund off its purchase, a transfer or a movement not counted left
 * out, a spread movement by its part -- so the amounts always add up to
 * `fixed`. A category at nothing in the period is left out. Largest first,
 * then by name.
 *
 * @param {FlowTotals} totals
 * @param {import('../types.js').FinanceCategory[]} categories
 * @returns {FixedCost[]}
 */
function fixedCostsOf(totals, categories) {
  return categories
    .filter((category) => category.fixedCost && categoryKind(category.id, categories) !== 'income')
    .map((category) => ({ id: category.id, name: category.name, amount: totals.byCategory.get(category.id) ?? 0 }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

/**
 * The one line under Income & spending's summary that splits what was spent
 * (ADR 0060): fixed costs -- with the categories they are made of -- and the
 * rest, `variable`. Null, so nothing is said, when nothing or less than
 * nothing was spent, or when no spending is a fixed cost -- nothing marked,
 * nothing spent on what is, or refunds outweighing it: "fixed costs € 0.00"
 * says nothing (ADR 0059).
 *
 * @param {Pick<PeriodFlows, 'spending' | 'fixed' | 'variable' | 'fixedCosts'>} flows
 * @returns {{ spent: number, fixed: number, rest: number, costs: FixedCost[] } | null}
 */
export function fixedCostSplit(flows) {
  if (flows.spending <= 0 || flows.fixed <= 0) return null;
  return { spent: flows.spending, fixed: flows.fixed, rest: flows.variable, costs: flows.fixedCosts };
}

/** What a parent's own line is named: the movements filed on it, on no subcategory (ADR 0057). */
export const OWN_LINE_NAME = 'No subcategory';

const OWN_LINE_PREFIX = 'own:';

/**
 * The id of a parent's own line (ADR 0057): its movements filed on itself,
 * not on a subcategory. A line id like a category's, so it opens in place,
 * is listed by `?category=` and is held by lineHolds.
 *
 * @param {string} categoryId a top-level category
 * @returns {string}
 */
export function ownLine(categoryId) {
  return OWN_LINE_PREFIX + categoryId;
}

/**
 * The parent whose own line an id is, or null when it is not one.
 *
 * @param {string} line
 * @returns {string | null}
 */
export function ownLineParent(line) {
  return line.startsWith(OWN_LINE_PREFIX) ? line.slice(OWN_LINE_PREFIX.length) : null;
}

/**
 * Whether a transaction is one a line of the month counts (#137): the same
 * rule monthFlows totals by, so a line's list never shows money its total
 * leaves out. A category line holds its flows and, for a parent, its
 * subcategories'; an Uncategorised line holds the flows filed on no category
 * that exists, in its direction. Never a transfer or a not-counted one. A
 * paired refund is held by its purchase's line (ADR 0055): read through
 * countedFlow, the one place that says where a movement counts. A parent's
 * own line (ownLine, ADR 0057) holds only the flows filed on the parent
 * itself, none of its subcategories'.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {string} line a category id, UNCATEGORISED_SPENDING,
 *   UNCATEGORISED_INCOME or ownLine(parent)
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {RefundPairs} [refunds]
 * @returns {boolean}
 */
export function lineHolds(transaction, line, categories, refunds = NO_REFUNDS) {
  const flow = countedFlow(transaction, categories, refunds);
  if (flow === null) return false;
  if (line === UNCATEGORISED_SPENDING) return flow.category === null && flow.direction === 'spending';
  if (line === UNCATEGORISED_INCOME) return flow.category === null && flow.direction === 'income';
  const parent = ownLineParent(line);
  if (parent !== null) return flow.category !== null && flow.category.id === parent;
  return flow.category !== null && (flow.category.id === line || flow.category.parentId === line);
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
 *   or spent (spending); a refund or a chargeback is negative -- the whole
 *   of it, on the day it moved
 * @property {{ month: string, value: number }[]} parts the same value in
 *   the months it counts in (countedParts, ADR 0052), oldest first; one part,
 *   the month of its date, unless it says otherwise
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
 * Which months it counts in is here too (ADR 0052): `parts` spreads the
 * value over the months the movement is for, so every reading by months --
 * a month, a year, the twelve months, the trend, a tag's period -- reads the
 * same parts. A reading by days (totalsBetween: the week) takes the whole
 * value on its day.
 *
 * **A refund paired with its purchase** (ADR 0055) counts where the purchase
 * counts, whatever category it carries itself: in the purchase's category
 * -- or, the purchase being uncategorised, as uncategorised spending -- in
 * the purchase's direction, so a refund of spending reduces spending and is
 * never income. It counts on its own date (and its own months, if it says
 * so), not the purchase's. A purchase not counted, or turned into a
 * transfer, takes its refunds out of every flow with it.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {RefundPairs} [refunds]
 * @returns {CountedFlow | null}
 */
function countedFlow(transaction, categories, refunds = NO_REFUNDS) {
  if (!isCounted(transaction, refunds)) return null;
  // What says where it counts: the movement, or the purchase it refunds.
  const reading = refunds.purchaseOf.get(transaction.id) ?? transaction;
  const category = countedCategory(reading, categories);
  /** @type {'income' | 'spending'} */
  const direction =
    category === null
      ? reading.amount < 0 ? 'spending' : 'income'
      : categoryKind(category.id, categories) === 'income' ? 'income' : 'spending';
  // Spending is money out: what left the account, so the sign turns.
  const sign = direction === 'spending' ? -1 : 1;
  return {
    category,
    direction,
    value: sign * transaction.amount,
    parts: countedParts(transaction).map((part) => ({ month: part.month, value: sign * part.amount || 0 })),
  };
}

/**
 * Whether a movement is in the flows at all: not a transfer, not marked not
 * counted, and -- a paired refund (ADR 0055) -- refunding a purchase that is
 * neither.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {RefundPairs} refunds
 * @returns {boolean}
 */
function isCounted(transaction, refunds) {
  if (transaction.counterAccountId !== null || transaction.notCounted) return false;
  const purchase = refunds.purchaseOf.get(transaction.id);
  return purchase === undefined || (purchase.counterAccountId === null && !purchase.notCounted);
}

/**
 * One month a movement counts in (ADR 0052).
 *
 * @typedef {object} CountedPart
 * @property {string} month YYYY-MM
 * @property {number} amount minor units, signed from the account's side as
 *   the movement's amount: its equal part of it
 * @property {number} index which of its months this is, from 1
 * @property {number} of how many months it counts in
 */

/**
 * The months a movement counts in and its part of the amount in each (ADR
 * 0052): the month of its date unless it says which months it is for
 * (`countedOver`), then each month of that range, oldest first, with an
 * equal part (splitEvenly). Its date is never moved: a balance follows the
 * day the money moved, and only the flow readings read this.
 *
 * @param {Pick<import('../types.js').Transaction, 'date' | 'amount'> & { countedOver?: import('../types.js').CountedOver | null }} transaction
 * @returns {CountedPart[]}
 */
export function countedParts(transaction) {
  const range = transaction.countedOver ?? null;
  if (range === null) return [{ month: monthOf(transaction.date), amount: transaction.amount, index: 1, of: 1 }];
  const months = monthKeyRange(range.from, range.to);
  const amounts = splitEvenly(transaction.amount, months.length);
  return months.map((month, at) => ({ month, amount: amounts[at], index: at + 1, of: months.length }));
}

/**
 * An amount in minor units split into `count` equal parts in whole cents
 * (ADR 0052): each part the amount over the count, rounded down in size,
 * and the cents left over one each to the first months -- so the parts
 * always add up exactly to the amount and never differ by more than a cent.
 * The sign is the amount's; a part of nothing is 0, never -0.
 *
 * @param {number} amount minor units, a whole number
 * @param {number} count a whole number of months, 1 or more
 * @returns {number[]}
 */
export function splitEvenly(amount, count) {
  if (!Number.isInteger(amount)) throw new Error('amount must be whole minor units, received ' + String(amount));
  if (!Number.isInteger(count) || count < 1) throw new Error('count must be a positive integer, received ' + String(count));
  const sign = amount < 0 ? -1 : 1;
  const whole = Math.abs(amount);
  const part = Math.floor(whole / count);
  const left = whole - part * count;
  return Array.from({ length: count }, (_, at) => sign * (part + (at < left ? 1 : 0)) || 0);
}

/**
 * Whether a movement counts in any month of a period (ADR 0052): the month
 * of its date, or one of the months it says it is for.
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {Set<string>} months YYYY-MM
 * @returns {boolean}
 */
function countsIn(transaction, months) {
  return countedParts(transaction).some((part) => months.has(part.month));
}

/**
 * Whether a tag's reading counts a transaction (ADR 0046): it carries the
 * tag and is counted -- never a transfer or a movement not counted -- the
 * same rule its totals add by, so a tag's list never shows money its total
 * leaves out and is as long as its count of movements.
 *
 * A paired refund whose purchase is not counted is not counted either (ADR
 * 0055).
 *
 * @param {import('../types.js').Transaction} transaction
 * @param {string} tag
 * @param {RefundPairs} [refunds]
 * @returns {boolean}
 */
export function tagHolds(transaction, tag, refunds = NO_REFUNDS) {
  return isCounted(transaction, refunds) && transaction.tags.includes(tag);
}

/**
 * The transactions Finances' Transactions card lists, newest first as they
 * are handed (#134, #137, ADR 0046): the period's, by date -- or, with a line
 * selected, the ones the line counts in the period (lineHolds); with a tag,
 * the ones the tag counts in the period (tagHolds), or all of them, whatever
 * the period, with `span: 'all'`. A selection counts a movement in the
 * months it is for (ADR 0052), so its list holds what its total adds up. A month or a year with nothing selected can be
 * hundreds of rows (ADR 0048): only the newest `max`, and `more` says how
 * many were left out, so the card can say so and offer them all. With `span: 'all'` and nothing selected, the whole period. A
 * selected line or tag is listed whole.
 *
 * **A refund and its purchase** (ADR 0055) are noise side by side: unless
 * `refunded` is `show`, a paired refund is left out, and so is a purchase all
 * of which came back; a purchase partly refunded stays, its `standing`
 * saying what is left of it. `refunded` counts the movements of the span
 * left out that way -- or, shown, that would be -- so the card can say so and
 * offer them; the cap and `more` count what is listed.
 *
 * **A deposit's interest** (ADR 0056, foldInterest): each account's interest
 * movements of a month -- with nothing selected the interest and the tax
 * withheld on it, with a line only what the line counts -- are one net row
 * when there are at least `limits.financeInterestRunMin` of them, unless
 * `interest` is `show`. `interest` counts the movements folded (or, shown,
 * that would be). One end of a refund pair is never folded. The cap and
 * `more` count the rows as shown.
 *
 * **A movement not counted** (ADR 0058) -- your own money moved aside, a loan
 * to a friend and its repayment -- is in no total, so with nothing selected
 * it is left out like a refunded one unless `uncounted` is `show`, and
 * `uncounted` counts it. A selected line or tag never holds one (lineHolds,
 * tagHolds). A transfer between your own accounts that is not marked stays:
 * it is not noise, it says where the money went.
 *
 * **The movement open in the panel** (`selected`, ADR 0058) is never left
 * out, refunded or not counted, and is not counted as left out: the list
 * beside a panel holds what the panel shows.
 *
 * **A search** (`query`, ADR 0058, searchTransactions) lists every movement
 * of all time that matches, newest first, whatever the period, line or tag:
 * nothing is left out and nothing folded -- finding a refunded purchase is
 * the point -- and each end of a refund pair keeps its standing. Capped at
 * `max` with `more`, as the period is, and whole with `span: 'all'`.
 *
 * @param {import('../types.js').Transaction[]} transactions newest first
 * @param {{
 *   categories: import('../types.js').FinanceCategory[],
 *   accounts?: Pick<import('../types.js').FinanceAccount, 'id' | 'name'>[],
 *   months: string[],
 *   category: string | null,
 *   tag: string | null,
 *   span: 'all' | null,
 *   max: number,
 *   refunds?: RefundPairs,
 *   refunded?: 'show' | null,
 *   interest?: 'show' | null,
 *   uncounted?: 'show' | null,
 *   selected?: string | null,
 *   query?: string | null,
 * }} selection
 * @returns {{ rows: (import('../types.js').Transaction | InterestRun)[], more: number, refunded: number, uncounted: number, interest: number, standings: Map<string, RefundStanding> }}
 *   `standings` holds each listed row that is one end of a pair
 */
export function listedTransactions(
  transactions,
  { categories, accounts = [], months, category, tag, span, max, refunds = NO_REFUNDS, refunded = null, interest = null, uncounted = null, selected = null, query = null }
) {
  if (query !== null) {
    const found = searchTransactions(transactions, query, { categories, accounts });
    const { standings } = withoutRefunded(found, refunds, 'show', (row) => row);
    const rows = span === 'all' ? found : found.slice(0, max);
    return { rows, more: found.length - rows.length, refunded: 0, uncounted: 0, interest: 0, standings };
  }
  const inPeriod = new Set(months);
  const inSpan = transactions.filter((transaction) => {
    // A selected line or tag lists what its total counts: a movement counted
    // over several months (ADR 0052) in each of them. Nothing selected lists
    // the period by date, as the bank does.
    if (tag !== null) return tagHolds(transaction, tag, refunds) && (span === 'all' || countsIn(transaction, inPeriod));
    if (category === null) return inPeriod.has(monthOf(transaction.date));
    return lineHolds(transaction, category, categories, refunds) && countsIn(transaction, inPeriod);
  });
  const open = (/** @type {import('../types.js').Transaction} */ row) => row.id === selected;
  const { kept: paid, refunded: hidden, standings } = withoutRefunded(inSpan, refunds, refunded, (row) => row, open);
  let aside = 0;
  const kept = paid.filter((row) => {
    if (!row.notCounted || open(row)) return true;
    aside += 1;
    return uncounted === 'show';
  });
  const { rows, interest: folded } = foldInterest(kept, { show: interest === 'show', keep: (row) => standings.has(row.id) });
  const counts = { refunded: hidden, uncounted: aside, interest: folded, standings };
  if (category !== null || tag !== null || span === 'all' || rows.length <= max) return { rows, more: 0, ...counts };
  return { rows: rows.slice(0, max), more: rows.length - max, ...counts };
}

/**
 * A list by date without its refunded movements (ADR 0055), unless they are
 * shown: what is kept, how many were (or, shown, would be) left out, and
 * the standing of each kept row that is one end of a pair. A row `keep`
 * holds (the movement open in the panel, ADR 0058) is never left out, nor
 * counted as left out.
 *
 * @template T
 * @param {T[]} rows
 * @param {RefundPairs} refunds
 * @param {'show' | null} refunded
 * @param {(row: T) => import('../types.js').Transaction} movementOf
 * @param {(movement: import('../types.js').Transaction) => boolean} [keep]
 * @returns {{ kept: T[], refunded: number, standings: Map<string, RefundStanding> }}
 */
function withoutRefunded(rows, refunds, refunded, movementOf, keep = () => false) {
  /** @type {Map<string, RefundStanding>} */
  const standings = new Map();
  /** @type {T[]} */
  const kept = [];
  let hidden = 0;
  for (const row of rows) {
    const movement = movementOf(row);
    const standing = refundStanding(movement, refunds);
    if (hiddenAsRefunded(standing) && !keep(movement)) {
      hidden += 1;
      if (refunded !== 'show') continue;
    }
    if (standing !== null) standings.set(movement.id, standing);
    kept.push(row);
  }
  return { kept, refunded: hidden, standings };
}

/**
 * One movement as a line's list in Income & spending shows it (ADR 0052):
 * only what the row prints, so the page hands little to the screen.
 *
 * @typedef {object} LineMovement
 * @property {string} id
 * @property {string} date day key, the day the money moved
 * @property {string} description
 * @property {number} amount minor units, signed from its account's side as
 *   the movement's amount: the whole of it, or for a movement counted over
 *   several months its parts in the period
 * @property {{ first: string, last: string, index: number, count: number, of: number } | null} spread
 *   null for a movement counted in the month of its date; otherwise its
 *   first and last month in the period, which of its months the first is
 *   (from 1), how many of them are in the period and how many it has
 * @property {RefundStanding | null} [refund] one end of a pair (ADR 0055): a
 *   refund shown, or a purchase that has refunds; null otherwise
 */

/**
 * Each asked-for line's movements in a period (ADR 0050, 0052), for Income &
 * spending to open in place: what the line counts (lineHolds) in the period,
 * a movement counted over several months in each month it counts in, with
 * its part. Newest first by the day the money moved, at most `max` -- `more`
 * says how many were left out, as the Transactions card does. One pass over
 * the movements; a line asked for and holding nothing is an empty list.
 *
 * Refunded movements are left out as the Transactions card leaves them out
 * (ADR 0055, withoutRefunded): a paired refund -- held by its purchase's line
 * -- and a purchase all of which came back, unless `refunded` is `show`; a
 * purchase partly refunded shows what is left of it, unless it is counted
 * over several months, which shows its part and the note. `refunded` counts
 * them per line.
 *
 * A deposit's interest is folded as the Transactions card folds it (ADR
 * 0056, foldInterest), line by line: an account's month of interest is one
 * row of the line that counts it, at what that line counts -- the interest
 * in its income line, the tax withheld in its own -- unless `interest` is
 * `show`. `interest` counts the movements folded per line; the cap and
 * `more` count the rows as shown.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {{ months: string[], lines: string[], max: number, refunds?: RefundPairs, refunded?: 'show' | null, interest?: 'show' | null }} selection
 * @returns {Map<string, { rows: (LineMovement | InterestRun)[], more: number, refunded: number, interest: number }>}
 */
export function lineMovements(transactions, categories, { months, lines, max, refunds = NO_REFUNDS, refunded = null, interest = null }) {
  const inPeriod = new Set(months);
  /** @type {Map<string, import('../types.js').Transaction[]>} */
  const held = new Map(lines.map((line) => [line, []]));
  const newestFirst = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const transaction of newestFirst) {
    if (!isCounted(transaction, refunds)) continue;
    if (!countsIn(transaction, inPeriod)) continue;
    for (const [line, list] of held) {
      if (lineHolds(transaction, line, categories, refunds)) list.push(transaction);
    }
  }
  /** @type {Map<string, { rows: (LineMovement | InterestRun)[], more: number, refunded: number, interest: number }>} */
  const byLine = new Map();
  for (const [line, list] of held) {
    const { kept, refunded: hidden, standings } = withoutRefunded(list, refunds, refunded, (row) => row);
    const { rows: shown, interest: folded } = foldInterest(kept, { show: interest === 'show', keep: (row) => standings.has(row.id) });
    const rows = shown.slice(0, max).map((transaction) => {
      // A run folded is a row as it is: only what this line counts, by its own date.
      if ('kind' in transaction) return transaction;
      const parts = countedParts(transaction).filter((part) => inPeriod.has(part.month));
      const spread = (transaction.countedOver ?? null) !== null;
      const refund = standings.get(transaction.id) ?? null;
      const whole = parts.reduce((sum, part) => sum + part.amount, 0);
      return {
        id: transaction.id,
        date: transaction.date,
        description: transaction.description,
        amount: refunded !== 'show' && refund?.kind === 'purchase' && !spread ? refund.net : whole,
        spread: spread ? { first: parts[0].month, last: parts[parts.length - 1].month, index: parts[0].index, count: parts.length, of: parts[0].of } : null,
        refund,
      };
    });
    byLine.set(line, { rows, more: Math.max(0, shown.length - max), refunded: hidden, interest: folded });
  }
  return byLine;
}

/**
 * The lines of a period whose name opens their movements in place (ADR
 * 0050, 0052, 0057) -- the ones lineMovements is asked for: each subcategory
 * listed and a parent's own line after them, each top-level line with none
 * listed, then Uncategorised income and spending. A line with subcategories
 * opens them instead, and lists all its movements by its "Movements in" link.
 *
 * @param {PeriodFlows} flows
 * @returns {string[]}
 */
export function movementLines(flows) {
  return [
    ...[...flows.incomeCategories, ...flows.spendingCategories].flatMap((line) =>
      line.children.length === 0 ? [line.id] : [...line.children.map((child) => child.id), ...(line.own === null ? [] : [line.own.id])]
    ),
    flows.uncategorisedIncome.id,
    flows.uncategorisedSpending.id,
  ];
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
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {{ spending: number, income: number }}
 */
export function uncategorisedCounts(transactions, categories, months, refunds = NO_REFUNDS) {
  const inPeriod = new Set(months);
  let spending = 0;
  let income = 0;
  for (const transaction of transactions) {
    if (!countsIn(transaction, inPeriod)) continue;
    if (lineHolds(transaction, UNCATEGORISED_SPENDING, categories, refunds)) spending += 1;
    else if (lineHolds(transaction, UNCATEGORISED_INCOME, categories, refunds)) income += 1;
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
 * movement in it, its spending and income by the month's rules (countedFlow,
 * a movement counted over several months by its part in the period, ADR 0052),
 * its number of movements, and, since a trip rarely fits one month, its
 * totals over all time and its first and last day. A movement with several
 * tags counts under each, so the tags' totals do not add up to the period's
 * spending. Largest spending in the period first, then by name.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM, the period
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {TagFlow[]}
 */
export function tagFlows(transactions, categories, months, refunds = NO_REFUNDS) {
  const period = new Set(months);
  /** @type {Map<string, TagFlow>} */
  const byTag = new Map();
  for (const transaction of transactions) {
    if (transaction.tags.length === 0) continue;
    const flow = countedFlow(transaction, categories, refunds);
    if (flow === null) continue;
    const inPeriod = valueIn(flow, period);
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
      if (inPeriod !== null) {
        row.movements += 1;
        if (flow.direction === 'spending') row.spending += inPeriod;
        else row.income += inPeriod;
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
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {{ income: number, spending: number }}
 */
export function yearFlows(transactions, categories, month, refunds = NO_REFUNDS) {
  const { income, spending } = totalsOver(transactions, categories, monthKeyRange(shiftMonth(month, -11), month), refunds);
  return { income, spending };
}

/**
 * A calendar year to date, the Income & spending section's year reading
 * (ADR 0044): the months on offer in the selected month's calendar year -- from
 * "tracked since" or January, to today's month or December -- read by the
 * month's own rules, so the year is the sum of the months its trend draws,
 * and its lines are listed by the month's rule over its months (ADR 0057).
 *
 * Not `yearFlows`: that is the twelve months ending with a month, the
 * savings rate over 12 months the section and the question context show.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM, a month of the year
 * @param {string[]} offered the months on offer, as flowMonths gives them
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {PeriodFlows & { months: string[] }}
 */
export function calendarYearFlows(transactions, categories, month, offered, refunds = NO_REFUNDS) {
  const found = yearMonths(offered, month);
  const months = found.length === 0 ? [month] : found;
  return { ...periodFlows(transactions, categories, months, refunds), months };
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
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {TrendMonth[]}
 */
export function flowTrend(transactions, categories, months, refunds = NO_REFUNDS) {
  return months.map((month) => {
    const totals = totalsOver(transactions, categories, [month], refunds);
    if (totals.flows === 0) return { month, income: null, spending: null, left: null };
    return { month, income: totals.income, spending: totals.spending, left: totals.income - totals.spending };
  });
}

/**
 * A column of Income & spending's columns (ADR 0053): a month of a year. A
 * day of a month is drawn by dayBars instead (ADR 0053, amended).
 *
 * @typedef {{ income: number | null, spending: number | null, left?: number | null }} FlowColumn
 */

/**
 * A year's bars: each month's income and spending as a height against the
 * highest of either drawn, and what was left as a mark at its own height --
 * none when nothing was left, or for a column with no `left`. Negative
 * income (a net chargeback) has no height; an empty column -- a month with
 * nothing counted, a day still to come -- stays empty, never zero.
 *
 * @template {FlowColumn} T
 * @param {T[]} columns
 * @returns {({ income: number, spending: number, left: number | null } | null)[]}
 *   heights in 0..1, to two decimals
 */
export function trendBars(columns) {
  const high = trendHigh(columns);
  /** @param {number} value */
  const height = (value) => (high === 0 ? 0 : Math.round((Math.max(0, value) / high) * 100) / 100);
  return columns.map((row) => {
    if (row.income === null || row.spending === null) return null;
    const left = row.left ?? null;
    return { income: height(row.income), spending: height(row.spending), left: left !== null && left > 0 ? height(left) : null };
  });
}

/**
 * The top of the columns' scale: the highest income or spending drawn, which
 * the bars are heights against and the axis prints. Zero when nothing is.
 *
 * @template {FlowColumn} T
 * @param {T[]} columns
 * @returns {number} minor units
 */
export function trendHigh(columns) {
  return Math.max(0, ...columns.flatMap((row) => [row.income ?? 0, row.spending ?? 0]));
}

/**
 * The top of a month's day columns' scale (ADR 0053, amended): the largest
 * day's spending, which the spending bars are heights against and the axis
 * prints. Income is not on it -- a payday of thousands would flatten days of
 * tens to a pixel -- and is marked on its day instead (dayBars). A day of
 * rent is on it, as tall as it is: no cap. Zero when nothing went out.
 *
 * @param {DayColumn[]} days
 * @returns {number} minor units
 */
export function dayHigh(days) {
  return Math.max(0, ...days.map((row) => row.spending ?? 0));
}

/**
 * The least a day's income must be to be marked on a month's columns (ADR
 * 0053, amended): `limits.financeDayIncomeMarkPercent` of the month's
 * income, rounded up to a whole euro, so the card can print the figure and
 * mean it exactly -- "Income of € 49 or more is marked". Integer arithmetic
 * on minor units: a ceiling of the percent of the income, in euros. None when
 * nothing came in over the month -- no income, or more charged back than
 * received -- and then no day is marked.
 *
 * @param {number} income minor units, the month's income (monthFlows), what is on no day included
 * @returns {number | null} minor units, a whole number of euros
 */
export function dayMarkFloor(income) {
  if (income <= 0) return null;
  return Math.floor((income * limits.financeDayIncomeMarkPercent + 9999) / 10000) * 100;
}

/**
 * A month's day columns as drawn (ADR 0053, amended): each day's spending as
 * a height against the largest day's (dayHigh), to two decimals, and whether
 * the day is marked for money in -- at least the month's floor came in
 * (dayMarkFloor), so a few cents of interest are no mark; a net chargeback is
 * no mark, as it is no height. The amounts stay on the day (dayColumns) for
 * its tooltip, whatever their size. A day still to come stays empty, never
 * zero; a month with nothing out is all heights of zero, never NaN.
 *
 * @param {DayColumn[]} days
 * @param {number} income minor units, the month's income, as dayMarkFloor reads it
 * @returns {({ spending: number, marked: boolean } | null)[]}
 */
export function dayBars(days, income) {
  const high = dayHigh(days);
  const floor = dayMarkFloor(income);
  return days.map((row) => {
    if (row.income === null || row.spending === null) return null;
    const spending = high === 0 ? 0 : Math.round((Math.max(0, row.spending) / high) * 100) / 100;
    return { spending, marked: floor !== null && row.income >= floor };
  });
}

/**
 * One month of a year's columns (ADR 0053): the trend's month, and whether
 * the year offers it.
 *
 * @typedef {TrendMonth & { offered: boolean }} YearColumn
 */

/**
 * A year's columns (ADR 0053): its twelve months, January first, each read
 * by the month's own rules (flowTrend) when the year offers it -- the months
 * calendarYearFlows adds up, so the columns add up to the year's totals --
 * and empty otherwise: a month before "tracked since" or after today's holds
 * nothing the card counts (ADR 0052), not a zero.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} year YYYY
 * @param {string[]} offered YYYY-MM, the months on offer, as flowMonths gives them
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {YearColumn[]}
 */
export function yearColumns(transactions, categories, year, offered, refunds = NO_REFUNDS) {
  const months = monthKeyRange(year + '-01', year + '-12');
  const on = new Set(offered);
  const read = new Map(flowTrend(transactions, categories, months.filter((month) => on.has(month)), refunds).map((row) => [row.month, row]));
  return months.map((month) => ({ ...(read.get(month) ?? { month, income: null, spending: null, left: null }), offered: on.has(month) }));
}

/**
 * One day of a month's columns (ADR 0053).
 *
 * @typedef {object} DayColumn
 * @property {string} day day key
 * @property {number | null} income minor units, what came in that day; null
 *   for a day after today with nothing on it, which is drawn empty
 * @property {number | null} spending minor units, what went out; null as income
 * @property {number} movements how many counted movements are on it
 */

/**
 * A month's columns, one per day (ADR 0053): what came in and went out each
 * day, by the month's own rules (countedFlow) -- transfers and movements not
 * counted left out, a refund reducing spending.
 *
 * **A movement counted over several months has no single day** (ADR 0052): a
 * day is the day money moved, and a part of a month is not a part of a day.
 * So a movement is on its day only when it counts whole in the month of its
 * date; any other part in the month -- of a movement spread over months, paid
 * in this month or another -- is `apart`: in the month's totals, on no day.
 * The days and `apart` add up exactly to the month's income and spending
 * (monthFlows), so the card can say what the columns leave out.
 *
 * A day after today is empty, never zero, unless something is already on it.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} month YYYY-MM
 * @param {string} todayKey
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {{ days: DayColumn[], apart: { income: number, spending: number, movements: number } }}
 */
export function dayColumns(transactions, categories, month, todayKey, refunds = NO_REFUNDS) {
  const { from, to } = monthRange(month);
  /** @type {Map<string, { income: number, spending: number, movements: number }>} */
  const byDay = new Map(dayKeyRange(from, to).map((day) => [day, { income: 0, spending: 0, movements: 0 }]));
  const apart = { income: 0, spending: 0, movements: 0 };
  for (const transaction of transactions) {
    const flow = countedFlow(transaction, categories, refunds);
    if (flow === null) continue;
    const part = flow.parts.find((each) => each.month === month);
    if (part === undefined) continue;
    const onItsDay = flow.parts.length === 1 && monthOf(transaction.date) === month;
    const into = onItsDay ? /** @type {{ income: number, spending: number, movements: number }} */ (byDay.get(transaction.date)) : apart;
    into[flow.direction] += part.value;
    into.movements += 1;
  }
  return {
    days: [...byDay].map(([day, totals]) =>
      day > todayKey && totals.movements === 0 ? { day, income: null, spending: null, movements: 0 } : { day, ...totals }
    ),
    apart,
  };
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
 * The composition bar: each spending line with money spent -- the
 * top-level categories in the table's order, then Uncategorised -- as its
 * part of what they add up to, and what it spent, which its part's tooltip
 * says (ADR 0053, amended). A net refund has no part, as a bar cannot be
 * negative; the table still shows it.
 *
 * @param {PeriodFlows} flows
 * @returns {{ id: string, name: string, amount: number, share: number }[]} `amount` in minor units
 */
export function spendingParts(flows) {
  const spent = [...flows.spendingCategories, flows.uncategorisedSpending].filter((line) => line.total > 0);
  const whole = spent.reduce((sum, line) => sum + line.total, 0);
  return spent.map((line) => ({ id: line.id, name: line.name, amount: line.total, share: line.total / whole }));
}

/**
 * The months the Income & spending section offers (#137): from "tracked
 * since" (ADR 0025), or else the first transaction's month -- or the first
 * month one counts in (ADR 0052), when that is earlier -- to today's,
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
      // A movement counted over months before its own (ADR 0052) brings them.
      const month = countedParts(transaction)[0].month;
      const own = monthOf(transaction.date);
      if (month < first) first = month;
      if (own < first) first = own;
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
 * The lowest savings rate, as printed (`wholePercent`), that still says
 * something (ADR 0059): −100%, spending exactly twice what came in. Below it
 * a percent -- "−250%" -- reads as a number and means nothing.
 */
const LOWEST_READABLE_RATE = -100;

/**
 * What a period's savings show (ADR 0059), one rule for every place that
 * prints them -- the card's "Saved this month", "Saved over 12 months" and
 * "Saved in <year>", and the question context's figures.
 *
 * - **The rate** (savingsRate) when there was income and, as printed, it is
 *   −100% or above.
 * - **What was saved** -- income less spending, in minor units, negative
 *   when more went out than came in -- when a percent says nothing: no income
 *   (zero or less), or a rate below −100%, more than twice what came in gone
 *   out.
 * - **Neither** when nothing came in and nothing went out: the blank.
 *
 * `meets` is the target's verdict, true to what is shown: the rate's as
 * printed (meetsSavingsTarget); for money, under the target whenever less
 * than nothing was saved -- no target of 1% or more is met by losing money --
 * and no verdict when something was saved with no income to be a share of.
 * None without a target.
 *
 * @param {{ income: number, spending: number }} flows
 * @param {number | null} target whole percent, 1 to 99
 * @returns {{ rate: number | null, saved: number | null, meets: boolean | null }}
 *   at most one of `rate` and `saved`
 */
export function savingsReading(flows, target) {
  const rate = savingsRate(flows);
  if (rate !== null && wholePercent(rate) >= LOWEST_READABLE_RATE) return { rate, saved: null, meets: meetsSavingsTarget(rate, target) };
  if (flows.income === 0 && flows.spending === 0) return { rate: null, saved: null, meets: null };
  const saved = flows.income - flows.spending;
  return { rate: null, saved, meets: target === null || saved >= 0 ? null : false };
}

/**
 * Whether a savings rate meets the target savings rate (ADR 0045): the rate
 * as it is printed -- a whole percent, `wholePercent` -- at or above the
 * target, so a rate shown as 20% against a target of 20 reads as met. Null
 * when there is no rate (no income) or no target; where the card shows what
 * was saved instead, savingsReading gives the verdict (ADR 0059).
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
    const cash = tradeCash(trade);
    if (trade.direction === 'buy') bought += cash;
    else sold -= cash;
  }
  return { bought, sold, net: bought - sold };
}

/**
 * The money a trade put into a holding: a buy's units times its price plus
 * its fee, positive; a sell's units times its price less its fee, as a
 * negative. The one answer to "how much went in or came out", which the
 * period's invested amount and a holding's cost and year to date
 * (investments.js) all read.
 *
 * @param {Pick<import('../types.js').Trade, 'direction' | 'units' | 'price' | 'fee'>} trade
 * @returns {number} minor units
 */
export function tradeCash(trade) {
  const value = valueOfUnits(trade.units, trade.price);
  return trade.direction === 'buy' ? value + trade.fee : -(value - trade.fee);
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
 * line, every subcategory, a parent's own line and both Uncategorised lines.
 * A month with nothing in a line counts as zero: the month was tracked. The
 * year reading only; a month has no average.
 *
 * @param {PeriodFlows & { months: string[] }} year
 * @returns {Map<string, number>} minor units by line id
 */
export function lineAverages(year) {
  const count = Math.max(1, year.months.length);
  /** @type {Map<string, number>} */
  const byLine = new Map();
  for (const line of [...year.spendingCategories, ...year.incomeCategories, year.uncategorisedSpending, year.uncategorisedIncome]) {
    for (const each of [line, ...line.children, ...(line.own === null ? [] : [line.own])]) byLine.set(each.id, Math.round(each.total / count));
  }
  return byLine;
}

/**
 * A category's line: its own flows plus its listed subcategories' -- every
 * subcategory not listed holds nothing, so adds nothing -- and, when it has
 * subcategories listed and a movement filed on itself, its own line.
 *
 * @param {import('../types.js').FinanceCategory} category
 * @param {FlowTotals} now
 * @param {number} whole the period's spending or income
 * @param {CategoryFlow[]} children the subcategories listed
 * @returns {CategoryFlow}
 */
function categoryFlow(category, now, whole, children) {
  const ownTotal = now.byCategory.get(category.id) ?? 0;
  const ownMovements = now.held.get(category.id) ?? 0;
  const line = lineFlow(
    category.id,
    category.name,
    children.reduce((sum, child) => sum + child.total, ownTotal),
    children.reduce((sum, child) => sum + child.movements, ownMovements),
    whole,
    children
  );
  if (children.length === 0 || ownMovements === 0) return line;
  return { ...line, own: lineFlow(ownLine(category.id), OWN_LINE_NAME, ownTotal, ownMovements, whole, []) };
}

/**
 * @param {string} id
 * @param {string} name
 * @param {number} total
 * @param {number} movements
 * @param {number} whole the period's spending or income
 * @param {CategoryFlow[]} children
 * @returns {CategoryFlow}
 */
function lineFlow(id, name, total, movements, whole, children) {
  return { id, name, total, share: lineShare(total, whole), movements, children, own: null };
}

/**
 * A line's share of its period's whole (ADR 0059): null when a percent would
 * say nothing -- the line is a net refund or chargeback (a total below zero),
 * or the whole is not positive (nothing came in, or the period's refunds
 * outweigh its spending). A line beside a net refund keeps its share of the
 * whole, so the shares then add up to more than 100%.
 *
 * @param {number} total minor units
 * @param {number} whole minor units, the period's spending or income
 * @returns {number | null}
 */
function lineShare(total, whole) {
  return total < 0 || whole <= 0 ? null : total / whole;
}

/**
 * Income, spending and the fixed part of it, and each category's own total
 * -- positive for what it stands for -- by the month's own rules.
 * `flows` is how many transactions were counted -- 0 means the figures rest
 * on nothing, which is not the same as having spent 0.
 *
 * @typedef {object} FlowTotals
 * @property {number} income
 * @property {number} spending
 * @property {number} fixed
 * @property {{ income: number, spending: number }} uncategorised
 * @property {Map<string, number>} byCategory
 * @property {Map<string, number>} held how many counted movements each
 *   category holds itself, and each Uncategorised line, by line id
 * @property {number} flows
 */

/**
 * The totals of a set of months -- they need not follow each other -- each
 * movement by its parts in them (countedFlow, ADR 0052): a movement counted
 * over several months adds only what falls in these, and counts once in
 * `flows` when any of it does. Every reading by months -- a month, a year,
 * the twelve months, the trend -- adds up through here. Empty totals for no
 * months.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string[]} months YYYY-MM
 * @param {RefundPairs} refunds
 * @returns {FlowTotals}
 */
function totalsOver(transactions, categories, months, refunds) {
  const inPeriod = new Set(months);
  const totals = emptyTotals();
  for (const transaction of transactions) {
    const flow = countedFlow(transaction, categories, refunds);
    if (flow === null) continue;
    const value = valueIn(flow, inPeriod);
    if (value !== null) addFlow(totals, flow, value);
  }
  return totals;
}

/**
 * What a counted movement adds to a period of months: the sum of its parts
 * in them, or null when none falls in them.
 *
 * @param {CountedFlow} flow
 * @param {Set<string>} months YYYY-MM
 * @returns {number | null}
 */
function valueIn(flow, months) {
  let value = null;
  for (const part of flow.parts) {
    if (months.has(part.month)) value = (value ?? 0) + part.value;
  }
  return value;
}

/** @returns {FlowTotals} */
function emptyTotals() {
  return { income: 0, spending: 0, fixed: 0, uncategorised: { income: 0, spending: 0 }, byCategory: new Map(), held: new Map(), flows: 0 };
}

/**
 * Adds a counted movement's value to totals: under its category, or as
 * uncategorised money in its direction. The one accumulation every total
 * shares, by months or by days.
 *
 * @param {FlowTotals} totals changed in place
 * @param {CountedFlow} flow
 * @param {number} value what it adds: the whole, or its part in a period
 * @returns {void}
 */
function addFlow(totals, { category, direction }, value) {
  totals.flows += 1;
  totals[direction] += value;
  const line = category?.id ?? (direction === 'spending' ? UNCATEGORISED_SPENDING : UNCATEGORISED_INCOME);
  totals.held.set(line, (totals.held.get(line) ?? 0) + 1);
  if (category === null) {
    totals.uncategorised[direction] += value;
    return;
  }
  totals.byCategory.set(category.id, (totals.byCategory.get(category.id) ?? 0) + value);
  if (direction === 'spending' && category.fixedCost) totals.fixed += value;
}

/**
 * The same totals over any run of days, by the month's own rules: transfers
 * and not-counted rows left out, a refund reducing what it refunds. The week
 * review and the import scripts' checks read this. **By the day the money
 * moved**: a movement counted over several months (ADR 0052) counts whole,
 * on its day -- a part of a month is not a part of a week, and an import's
 * check compares with the bank's days. So a week and a month disagree about
 * such a movement only, and on purpose.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {import('../types.js').FinanceCategory[]} categories
 * @param {string} from day key, inclusive
 * @param {string} to day key, inclusive
 * @param {RefundPairs} [refunds] the pairs (ADR 0055)
 * @returns {FlowTotals}
 */
export function totalsBetween(transactions, categories, from, to, refunds = NO_REFUNDS) {
  const totals = emptyTotals();
  for (const transaction of flowsBetween(transactions, from, to)) {
    // A paired refund of a purchase not counted is in no flow (ADR 0055).
    const flow = countedFlow(transaction, categories, refunds);
    if (flow !== null) addFlow(totals, flow, flow.value);
  }
  return totals;
}
