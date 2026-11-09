/**
 * The cash part of the Scalable sync (ticket #217, ADR 0031): the cash
 * sitting at the broker is one `cash` account, "Scalable cash", found by
 * origin { source: 'scalable', externalId: <portfolio id> } and never adopted.
 * Each run records `cash_balance` from `sc broker cash-breakdown` as that
 * day's balance -- one per day, a zero included (a known zero is not unknown).
 * Cash movements (deposits, interest, withdrawals) are out of scope: that row
 * group stays unclaimed and is warned about.
 */

import { ORIGIN_SOURCES } from '../../../personalos.config.js';
import { syncedOrigin } from '../../domain/origin.js';
import { today } from '../../domain/dates.js';
import { callScResult } from './client.js';
import { BASE_CURRENCY, toCents } from './map.js';

export const CASH_ACCOUNT_NAME = 'Scalable cash';

/**
 * What the fetch stage read, per run. Kept here so the shared context stays
 * the core's.
 *
 * @type {WeakMap<import('./sync.js').SyncContext, { portfolioId: string, amount: number, accountId: string | null, day: string, unchanged: boolean }>}
 */
const states = new WeakMap();

/** @type {import('./sync.js').SyncPart} */
export const cashPart = {
  name: 'cash',

  async fetch(ctx) {
    const result = await callScResult(ctx.run, ['broker', 'cash-breakdown']);
    const balance = result.cash_balance;
    if (typeof balance !== 'number' || !Number.isFinite(balance)) {
      throw new Error('sc broker cash-breakdown answered without a cash balance');
    }
    const portfolioId = result.portfolio_id;
    if (typeof portfolioId !== 'string' || portfolioId === '') {
      throw new Error('sc broker cash-breakdown answered without a portfolio id');
    }
    states.set(ctx, { portfolioId, amount: toCents(balance), accountId: null, day: today(), unchanged: false });
  },

  async plan(ctx) {
    const state = states.get(ctx);
    if (state === undefined) return;
    const accounts = await ctx.store.getAccounts();
    const account = accounts.find(
      (a) => a.origin?.source === ORIGIN_SOURCES.scalable && a.origin.externalId === state.portfolioId && a.kind === 'cash'
    );
    state.accountId = account?.id ?? null;
    if (account === undefined) {
      ctx.createsAccounts += 1;
      ctx.report.push('create cash account "' + CASH_ACCOUNT_NAME + '" (' + state.portfolioId + '): balance ' + state.amount + ' cents on ' + state.day);
      return;
    }
    const todays = (await ctx.store.getObservations({ accountId: account.id })).find((o) => o.kind === 'balance' && o.date === state.day);
    state.unchanged = todays !== undefined && todays.amount === state.amount;
    ctx.report.push(
      '"' + account.name + '": ' + (state.unchanged ? 'balance already recorded for ' + state.day : 'balance ' + state.amount + ' cents on ' + state.day)
    );
  },

  async apply(ctx) {
    const state = states.get(ctx);
    if (state === undefined) return 0;
    let written = 0;
    let accountId = state.accountId;
    if (accountId === null) {
      const account = await ctx.store.createAccount({
        name: CASH_ACCOUNT_NAME,
        kind: 'cash',
        valuation: 'balance',
        currency: BASE_CURRENCY,
        source: 'integration',
        origin: syncedOrigin(ORIGIN_SOURCES.scalable, state.portfolioId),
      });
      accountId = account.id;
      written += 1;
    } else if (state.unchanged) {
      return 0;
    }
    await ctx.store.upsertSyncedBalance({ accountId, date: state.day, amount: state.amount, currency: BASE_CURRENCY });
    return written + 1;
  },
};
