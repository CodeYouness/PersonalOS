/**
 * A fake `sc` for the Scalable sync's tests: a command runner that answers
 * each command from an invented scenario, in the real envelope shape (see
 * ADR 0031). Every value is invented -- the repository is public.
 *
 * Shared by the sync's tests (and by the tickets that extend the sync), so
 * a new part adds a field to the scenario rather than a second fake.
 */

import { ScCommandError } from '../../lib/integrations/scalable/client.js';

/**
 * @typedef {object} Scenario
 * @property {object[]} [holdings] security holdings items
 * @property {object[]} [cryptoItems] holdings crypto items
 * @property {object[]} [transactions] list rows, newest first like sc
 * @property {Record<string, object>} [details] `security_trade` objects by transaction id
 * @property {number} [pageSize] rows per page the fake serves (default 100)
 * @property {Record<string, object>} [charts] chart `data_points` payloads by ISIN
 * @property {Record<string, object>} [quotes] quote results by ISIN
 * @property {number} [cashBalance]
 * @property {(args: string[]) => void} [onCall] may throw to fail a command
 */

/**
 * @param {string} command dotted, as sc names it in its envelope
 * @param {object} data
 */
const envelope = (command, data) => ({ ok: true, command, data });

const ACCOUNT = { account_id: 'acc-0001', portfolio_id: 'pf-0001', resolution: { account: 'selected_context', portfolio: 'selected_context' } };

/**
 * @param {Scenario} scenario
 * @returns {{ run: (args: string[]) => Promise<unknown>, calls: string[][] }}
 */
export function fakeSc(scenario) {
  /** @type {string[][]} */
  const calls = [];
  const pageSize = scenario.pageSize ?? 100;

  /** @param {string[]} args */
  const run = async (args) => {
    calls.push(args);
    scenario.onCall?.(args);
    const [group, command, sub] = args;
    const flag = (/** @type {string} */ name) => {
      const at = args.indexOf(name);
      return at === -1 ? null : args[at + 1];
    };

    if (group === 'broker' && command === 'holdings') {
      const items = scenario.holdings ?? [];
      const crypto = scenario.cryptoItems ?? [];
      return envelope('broker.holdings', {
        ...ACCOUNT,
        result: { ...ACCOUNT, count: items.length, security_count: items.length, crypto_count: crypto.length, items, crypto_items: crypto },
      });
    }
    if (group === 'broker' && command === 'transactions') {
      const rows = scenario.transactions ?? [];
      const start = Number(flag('--cursor') ?? 0);
      const page = rows.slice(start, start + pageSize);
      const next = start + pageSize < rows.length ? String(start + pageSize) : null;
      return envelope('broker.transactions', {
        ...ACCOUNT,
        result: { ...ACCOUNT, count: page.length, total: page.length, cursor: next, items: page, crypto: { count: 0, total: 0, cursor: null, items: [] } },
      });
    }
    if (group === 'broker' && command === 'transaction' && sub === 'details') {
      const id = flag('--transaction-id') ?? '';
      const trade = scenario.details?.[id];
      if (trade === undefined) throw new ScCommandError(10, 'broker_transaction_not_found');
      return envelope('broker.transaction.details', {
        ...ACCOUNT,
        result: { id, detail_type: 'security_trade', currency: 'EUR', security_trade: trade },
      });
    }
    if (group === 'broker' && command === 'quote') {
      const isin = flag('--isin') ?? '';
      // A scenario with no `quotes` at all quotes every ISIN at 100.
      const quote = scenario.quotes === undefined ? { quote_mid_price: 100, quote_timestamp_utc: new Date().toISOString() } : scenario.quotes[isin];
      if (quote === undefined) throw new ScCommandError(10, 'broker_input_invalid');
      return envelope('broker.quote', { ...ACCOUNT, result: { isin, quote_currency: 'EUR', ...quote } });
    }
    if (group === 'broker' && command === 'chart') {
      const isin = flag('--isin') ?? '';
      // A scenario with no `charts` at all charts every ISIN as flat at 100 since 2000.
      const chart = scenario.charts === undefined ? { point_count: 1, data_points: [{ mid_price: 100, timestamp_utc: '2000-01-31T20:00:00.000Z' }] } : scenario.charts[isin];
      if (chart === undefined) throw new ScCommandError(10, 'broker_input_invalid');
      return envelope('broker.chart', { isin, currency: 'EUR', source: 'CONSOLIDATED', timeframe: 'max', ...chart });
    }
    if (group === 'broker' && command === 'cash-breakdown') {
      return envelope('broker.cash-breakdown', { ...ACCOUNT, result: { ...ACCOUNT, cash_balance: scenario.cashBalance ?? 0 } });
    }
    throw new ScCommandError(10, 'unknown command in the fake: ' + args.join(' '));
  };
  return { run, calls };
}

/** @param {Record<string, unknown>} extra */
export function singleBuy(extra) {
  return {
    type: 'SECURITY_TRANSACTION', summary_type: 'BrokerSecurityTransactionSummary', status: 'SETTLED', is_cancellation: false,
    custodian: 'SCALABLE', related_isin: null, currency: 'EUR', side: 'BUY', security_transaction_type: 'SINGLE',
    non_trade_security_transaction_type: null, cash_transaction_type: null, limit_price: 100, stop_price: null,
    ...extra,
  };
}

/** @param {Record<string, unknown>} extra */
export function savingsPlanBuy(extra) {
  return singleBuy({ security_transaction_type: 'SAVINGS_PLAN', limit_price: null, ...extra });
}

/** @param {Record<string, unknown>} extra */
export function nonTrade(extra) {
  return {
    type: 'NON_TRADE_SECURITY_TRANSACTION', summary_type: 'BrokerNonTradeSecurityTransactionSummary', status: 'SETTLED',
    is_cancellation: false, custodian: 'BAADER', related_isin: null, currency: 'EUR', side: null, security_transaction_type: null,
    cash_transaction_type: null, limit_price: null, stop_price: null,
    ...extra,
  };
}

/** @param {Record<string, unknown>} extra */
export function cashRow(extra) {
  return {
    type: 'CASH_TRANSACTION', summary_type: 'BrokerCashTransactionSummary', status: 'SETTLED', is_cancellation: false,
    custodian: 'SCALABLE', isin: null, related_isin: null, currency: 'EUR', quantity: null, side: null, security_transaction_type: null,
    non_trade_security_transaction_type: null, limit_price: null, stop_price: null,
    ...extra,
  };
}

/**
 * The details of a single order: fee and market valuation as sc reports
 * them, `total_amount` including the fee.
 * @param {number} marketValuation
 * @param {number | null} fee
 */
export function singleDetails(marketValuation, fee) {
  return {
    average_price: null, fee: null, transactional_fee: null, taxes: null, finalisation_reason: 'FILLED', order_kind: 'SINGLE',
    side: 'BUY', status: 'FINAL_FILL', total_amount: -(marketValuation + (fee ?? 0)),
    trade_transaction_amounts: { market_valuation: marketValuation, transaction_fee: fee, venue_fee: null, tax_amount: null, crypto_spread_fee: null },
  };
}
