/**
 * Money, computed.
 *
 * Two things live here and they answer different questions:
 *
 *   net worth      a STOCK, from the latest observation of each account
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

/**
 * The most recent observation per account, at or before a date.
 *
 * @param {import('../types.js').FinanceObservation[]} observations
 * @param {string} onOrBefore day key
 * @returns {Map<string, import('../types.js').FinanceObservation>}
 */
export function latestObservationByAccount(observations, onOrBefore) {
  /** @type {Map<string, import('../types.js').FinanceObservation>} */
  const latest = new Map();

  for (const observation of observations) {
    if (observation.date > onOrBefore) continue;
    const current = latest.get(observation.accountId);
    if (current === undefined || observation.date > current.date) {
      latest.set(observation.accountId, observation);
    }
  }

  return latest;
}

/**
 * Net worth from the latest observation of each account.
 *
 * Accounts with no observation are simply absent -- never treated as zero. An
 * account nobody has measured is unknown, and pretending it is empty would
 * quietly understate your position.
 *
 * @param {import('../types.js').FinanceAccount[]} accounts
 * @param {import('../types.js').FinanceObservation[]} observations
 * @param {string} onOrBefore day key
 * @returns {{ netWorth: number, cash: number, invested: number, otherAssets: number, liabilities: number, measuredAccounts: number, unmeasuredAccounts: number }}
 */
export function netWorthAt(accounts, observations, onOrBefore) {
  const latest = latestObservationByAccount(observations, onOrBefore);
  let cash = 0;
  let invested = 0;
  let otherAssets = 0;
  let liabilities = 0;
  let measured = 0;

  for (const account of accounts) {
    if (account.archived) continue;
    const observation = latest.get(account.id);
    if (observation === undefined) continue;
    measured += 1;

    const magnitude = Math.abs(observation.amount);
    if (account.kind === 'cash') cash += magnitude;
    else if (account.kind === 'investment') invested += magnitude;
    else if (account.kind === 'asset') otherAssets += magnitude;
    else liabilities += magnitude;
  }

  const active = accounts.filter((account) => !account.archived).length;

  return {
    netWorth: cash + invested + otherAssets - liabilities,
    cash,
    invested,
    otherAssets,
    liabilities,
    measuredAccounts: measured,
    unmeasuredAccounts: active - measured,
  };
}

/**
 * Transactions in a period, transfers excluded.
 *
 * Moving money between two accounts you own is neither income nor spending.
 * Counting it would double your monthly total, and the error looks plausible
 * enough that you would believe it.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {string} from day key
 * @param {string} to day key
 * @returns {import('../types.js').Transaction[]}
 */
export function flowsBetween(transactions, from, to) {
  return transactions.filter(
    (transaction) =>
      transaction.kind !== 'transfer' && transaction.date >= from && transaction.date <= to
  );
}

/**
 * Totals for a period: what came in, what went out, and the difference.
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
    if (transaction.kind === 'income') income += transaction.amount;
    else expense += transaction.amount;
  }

  return { income, expense, net: income - expense, count: flows.length };
}

/**
 * Totals per category for a period, one direction at a time.
 *
 * Uncategorised transactions are grouped under the empty string rather than
 * dropped: a total that silently omits what you have not filed yet is worse
 * than one that shows you the gap.
 *
 * @param {import('../types.js').Transaction[]} transactions
 * @param {'income'|'expense'} kind
 * @param {string} from day key
 * @param {string} to day key
 * @returns {Record<string, number>} category id to minor units
 */
export function totalsByCategory(transactions, kind, from, to) {
  /** @type {Record<string, number>} */
  const totals = {};

  for (const transaction of flowsBetween(transactions, from, to)) {
    if (transaction.kind !== kind) continue;
    const key = transaction.categoryId ?? '';
    totals[key] = (totals[key] ?? 0) + transaction.amount;
  }

  return totals;
}
