/**
 * What the sheet import would create, from the rows and the mapping (#139):
 * a pure function, so the dry run and the write (#140) cannot disagree.
 *
 * The row rules, in order:
 *
 *   1. A per-row override in the mapping, keyed by Timestamp, applies first.
 *   2. "Da" and "A" both set: a transfer from "Da" to "A".
 *   3. "A" only, not tracked, tagged with the opening-balance tag: a balance
 *      on "A", dated the day before that account's first movement; several
 *      on one account are summed.
 *   4. "Da" only, the pair mapped as an investment purchase: a transfer to
 *      the holding whose trade has the same total within 3 days. Exactly one
 *      match, or the row is reported and must be resolved by an override.
 *   5. The pair mapped as a refund: +Importo in the override's category,
 *      else in the mapping's spending fallback. Never income.
 *   6. Any other row not tracked: a transaction that is not counted.
 *   7. Otherwise a flow: -Importo on "Da", or +Importo on "A", in the
 *      pair's category.
 *   8. Skipped and listed: a zero amount, a row with neither account.
 *
 * Every row is either planned or reported; nothing is dropped in silence.
 */

import { shiftDayKey } from '../../lib/domain/dates.js';
import { PAIR_INVESTMENT, PAIR_REFUND } from './mapping.js';

/** How far apart a purchase and its trade may be dated. */
const MATCH_DAYS = 3;

/**
 * @typedef {object} PlannedTransaction
 * @property {number} line
 * @property {string} externalId the Timestamp as ISO, the import's key
 * @property {string} date
 * @property {number} amount minor units, signed from `account`'s side
 * @property {string} account a sheet account name
 * @property {string | null} counter a sheet account name, for a transfer
 * @property {string | null} category a category path
 * @property {boolean} notCounted
 * @property {string[]} tags
 * @property {string} description
 * @property {'flow' | 'transfer' | 'investment' | 'refund' | 'not counted'} rule
 */

/**
 * @typedef {object} PlannedTrade
 * @property {number} line
 * @property {string} account a sheet account name, valued by units
 * @property {string} date
 * @property {'buy' | 'sell'} direction
 * @property {number} units 10^-8 units
 * @property {number} price minor units per unit
 * @property {number} fee minor units
 */

/**
 * @typedef {object} ImportPlan
 * @property {string[]} accounts the mapped accounts to create or reuse:
 *   every one the sheet names, the holdings traded, the default account
 * @property {{ account: string, date: string, amount: number, lines: number[] }[]} balances
 * @property {PlannedTransaction[]} transactions
 * @property {PlannedTrade[]} trades
 * @property {string | null} trackedSince the earliest movement's day
 * @property {{
 *   skipped: { line: number, reason: string }[],
 *   refunds: { line: number, date: string, amount: number, description: string, category: string }[],
 *   unmatched: { line: number, date: string, amount: number, matches: number }[],
 *   unmappedPairs: { pair: string, lines: number[] }[],
 *   unmappedAccounts: { name: string, lines: number[] }[],
 *   unmappedTickers: { ticker: string, lines: number[] }[],
 *   rounding: { tab: string, line: number, field: string, value: number }[],
 * }} report
 */

/**
 * @param {{
 *   movements: import('./read.js').MovementRow[],
 *   trades: import('./read.js').TradeRow[],
 *   mapping: import('./mapping.js').Mapping,
 * }} input
 * @returns {ImportPlan}
 */
export function planImport({ movements, trades, mapping }) {
  /** @type {ImportPlan['report']} */
  const report = { skipped: [], refunds: [], unmatched: [], unmappedPairs: [], unmappedAccounts: [], unmappedTickers: [], rounding: [] };
  /** @type {Map<string, number[]>} */
  const unmappedPairs = new Map();
  /** @type {Map<string, number[]>} */
  const unmappedAccounts = new Map();
  /** @type {Map<string, number[]>} */
  const unmappedTickers = new Map();
  /** @param {Map<string, number[]>} map @param {string} key @param {number} line */
  const note = (map, key, line) => map.set(key, [...(map.get(key) ?? []), line]);

  const plannedTrades = planTrades(trades, mapping, report, (ticker, line) => note(unmappedTickers, ticker, line));

  /** @type {PlannedTransaction[]} */
  const transactions = [];
  /** @type {Map<string, { amount: number, date: string, lines: number[] }>} */
  const openings = new Map();
  /** @type {Map<string, number>} */
  const seenIds = new Map();

  for (const row of movements) {
    const amount = scaled(row.amount, 2);
    if (amount.rounded) report.rounding.push({ tab: 'movements', line: row.line, field: 'Importo', value: row.amount });
    const cents = amount.value;
    if (cents === 0) {
      report.skipped.push({ line: row.line, reason: 'zero amount' });
      continue;
    }
    if (row.from === '' && row.to === '') {
      report.skipped.push({ line: row.line, reason: 'no account' });
      continue;
    }
    const missing = [row.from, row.to].filter((name) => name !== '' && mapping.accounts[name] === undefined);
    if (missing.length > 0) {
      for (const name of missing) note(unmappedAccounts, name, row.line);
      continue;
    }

    // 1. A per-row override.
    const override = (row.timestamp === null ? undefined : mapping.rows[row.timestamp]) ?? {};
    if (override.skip) {
      report.skipped.push({ line: row.line, reason: 'skipped by the mapping' });
      continue;
    }

    const pair = row.category + '|' + row.subcategory;
    const mapped = mapping.pairs[pair];
    const base = {
      line: row.line,
      externalId: uniqueId(row, seenIds),
      date: row.date,
      tags: renameTags(row.tags, mapping),
      description: row.note === '' ? row.subcategory : row.note,
    };

    // 2. A transfer between two accounts.
    if (row.from !== '' && row.to !== '') {
      transactions.push({ ...base, amount: -cents, account: row.from, counter: row.to, category: null, notCounted: false, rule: 'transfer' });
      continue;
    }

    // 3. An opening balance.
    if (row.from === '' && !row.counted && row.tags.includes(mapping.openingBalanceTag)) {
      const opening = openings.get(row.to);
      openings.set(row.to, {
        amount: (opening?.amount ?? 0) + cents,
        date: opening === undefined || row.date < opening.date ? row.date : opening.date,
        lines: [...(opening?.lines ?? []), row.line],
      });
      continue;
    }

    // 4. An investment purchase: the cash that paid for a trade.
    if (row.to === '' && (override.holding !== undefined || mapped === PAIR_INVESTMENT)) {
      const holding = override.holding !== undefined ? mapping.holdings[override.holding] : matchTrade(row, cents, plannedTrades);
      if (holding === null || typeof holding === 'number') {
        report.unmatched.push({ line: row.line, date: row.date, amount: cents, matches: holding ?? 0 });
        continue;
      }
      transactions.push({ ...base, amount: -cents, account: row.from, counter: holding, category: null, notCounted: false, rule: 'investment' });
      continue;
    }

    const account = row.from !== '' ? row.from : row.to;
    const signed = row.from !== '' ? -cents : cents;

    // 5. A refund: money back into a spending category, never income.
    if (mapped === PAIR_REFUND) {
      const category = override.category ?? mapping.refundFallback;
      transactions.push({ ...base, amount: cents, account, counter: null, category, notCounted: false, rule: 'refund' });
      report.refunds.push({ line: row.line, date: row.date, amount: cents, description: base.description, category });
      continue;
    }

    const category = override.category ?? (mapped === undefined || mapped === PAIR_INVESTMENT ? null : mapped);
    if (category === null && override.category === undefined) {
      note(unmappedPairs, pair, row.line);
      continue;
    }

    // 6. Not tracked, and 7. a flow.
    const notCounted = override.notCounted ?? !row.counted;
    transactions.push({ ...base, amount: signed, account, counter: null, category, notCounted, rule: notCounted ? 'not counted' : 'flow' });
  }

  const balances = [...openings].map(([account, opening]) => {
    const first = transactions
      .filter((transaction) => transaction.account === account || transaction.counter === account)
      .reduce((earliest, transaction) => (earliest === null || transaction.date < earliest ? transaction.date : earliest), /** @type {string | null} */ (null));
    // The day before the first movement, so no early movement is left out
    // of the derived value (ADR 0024).
    return { account, date: shiftDayKey(first ?? opening.date, -1), amount: opening.amount, lines: opening.lines };
  });

  // Every account the sheet names, even on a row it skips, and every
  // holding a trade is on.
  const used = new Set([
    ...movements.flatMap((row) => [row.from, row.to]).filter((name) => name !== ''),
    ...plannedTrades.map((trade) => trade.account),
    ...(mapping.defaultAccount === null ? [] : [mapping.defaultAccount]),
  ]);

  report.unmappedPairs = [...unmappedPairs].map(([key, lines]) => ({ pair: key, lines }));
  report.unmappedAccounts = [...unmappedAccounts].map(([name, lines]) => ({ name, lines }));
  report.unmappedTickers = [...unmappedTickers].map(([ticker, lines]) => ({ ticker, lines }));

  const dates = movements.map((row) => row.date).sort();
  return {
    accounts: Object.keys(mapping.accounts).filter((name) => used.has(name)),
    balances,
    transactions,
    trades: plannedTrades,
    trackedSince: dates[0] ?? null,
    report,
  };
}

/**
 * Whether anything in the plan stops the write: an unmapped pair, account or
 * ticker, or a purchase with no single trade.
 *
 * @param {ImportPlan} plan
 * @returns {string[]} the reasons, empty when the plan can be written
 */
export function blockingReasons(plan) {
  const { report } = plan;
  return [
    ...report.unmappedPairs.map((entry) => 'the pair "' + entry.pair + '" is not mapped'),
    ...report.unmappedAccounts.map((entry) => 'the account "' + entry.name + '" is not mapped'),
    ...report.unmappedTickers.map((entry) => 'the ticker "' + entry.ticker + '" is not mapped'),
    ...report.unmatched.map((entry) => 'the purchase on line ' + entry.line + ' matches ' + entry.matches + ' trades'),
  ];
}

/**
 * @param {import('./read.js').TradeRow[]} rows
 * @param {import('./mapping.js').Mapping} mapping
 * @param {ImportPlan['report']} report
 * @param {(ticker: string, line: number) => void} unmapped
 * @returns {PlannedTrade[]}
 */
function planTrades(rows, mapping, report, unmapped) {
  /** @type {PlannedTrade[]} */
  const planned = [];
  for (const row of rows) {
    const account = mapping.holdings[row.ticker];
    if (account === undefined) {
      unmapped(row.ticker, row.line);
      continue;
    }
    const units = scaled(Math.abs(row.quantity), 8);
    const price = scaled(row.price, 2);
    const fee = scaled(row.fee, 2);
    if (units.rounded) report.rounding.push({ tab: 'trades', line: row.line, field: 'Quantità', value: row.quantity });
    if (price.rounded) report.rounding.push({ tab: 'trades', line: row.line, field: "Prezzo d'acquisto", value: row.price });
    if (fee.rounded) report.rounding.push({ tab: 'trades', line: row.line, field: 'Commissioni', value: row.fee });
    planned.push({
      line: row.line,
      account,
      date: row.date,
      direction: row.quantity < 0 ? 'sell' : 'buy',
      units: units.value,
      price: price.value,
      fee: fee.value,
    });
  }
  return planned;
}

/**
 * The holding a purchase paid for: the one buy whose total -- its value,
 * with or without its fee, to the cent -- is the amount, dated within
 * MATCH_DAYS of it. The number of matches when there is not exactly one.
 *
 * @param {import('./read.js').MovementRow} row
 * @param {number} cents
 * @param {PlannedTrade[]} trades
 * @returns {string | number}
 */
function matchTrade(row, cents, trades) {
  const from = shiftDayKey(row.date, -MATCH_DAYS);
  const to = shiftDayKey(row.date, MATCH_DAYS);
  const matches = trades.filter((trade) => {
    if (trade.direction !== 'buy' || trade.date < from || trade.date > to) return false;
    const value = Number((BigInt(trade.units) * BigInt(trade.price) + 50_000_000n) / 100_000_000n);
    return Math.abs(value - cents) <= 1 || Math.abs(value + trade.fee - cents) <= 1;
  });
  return matches.length === 1 ? matches[0].account : matches.length;
}

/**
 * The Timestamp as the import's key; a row with none is keyed by its line,
 * and a Timestamp seen twice gets its occurrence after it.
 *
 * @param {import('./read.js').MovementRow} row
 * @param {Map<string, number>} seen
 * @returns {string}
 */
function uniqueId(row, seen) {
  const id = row.timestamp ?? 'line-' + row.line;
  const count = (seen.get(id) ?? 0) + 1;
  seen.set(id, count);
  return count === 1 ? id : id + '#' + count;
}

/**
 * A row's tags after the mapping's renames: renamed, or dropped when mapped
 * to null; the opening-balance tag never travels.
 *
 * @param {string[]} tags
 * @param {import('./mapping.js').Mapping} mapping
 * @returns {string[]}
 */
function renameTags(tags, mapping) {
  /** @type {string[]} */
  const renamed = [];
  for (const tag of tags) {
    if (tag === mapping.openingBalanceTag) continue;
    const next = Object.hasOwn(mapping.tags, tag) ? mapping.tags[tag] : tag;
    if (next !== null) renamed.push(next.trim().toLowerCase());
  }
  return [...new Set(renamed)];
}

/**
 * A decimal number of euros or units as an integer count of 10^-digits,
 * rounded half up on its decimal digits -- never on its binary float, so
 * 18.405 euros is 1841 cents -- and whether anything was rounded away.
 *
 * @param {number} value
 * @param {number} digits
 * @returns {{ value: number, rounded: boolean }}
 */
export function scaled(value, digits) {
  const negative = value < 0;
  const [whole, fraction = ''] = Math.abs(value).toFixed(12).split('.');
  const kept = fraction.slice(0, digits);
  const rest = fraction.slice(digits);
  let integer = BigInt(whole + kept.padEnd(digits, '0'));
  if (rest !== '' && rest[0] >= '5') integer += 1n;
  const result = Number(integer);
  return { value: negative ? -result : result, rounded: /[1-9]/.test(rest) };
}
