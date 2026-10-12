/**
 * What to do when the context is too large to ask over whole (#175, ADR
 * 0028). One move, and then an honest refusal -- never a silent cut:
 *
 * 1. Transactions go first, because their monthly figures (income, spending,
 *    what is left, the category lines) already say what a month came to.
 *    A month's transactions are replaced by those figures, OLDEST month first,
 *    re-measuring after each, and it stops the moment the context fits.
 * 2. The newest `recentMonths` months holding transactions, up to today, are
 *    never touched: recent detail is what "this month" needs. A month after
 *    today is not recent: it cannot be summarised anyway (no figure), so it
 *    must not use up a slot a real recent month needs.
 * 3. A month with no monthly figure (before "tracked since", or after today)
 *    is never summarised: nothing would stand in for it, and a transaction
 *    that vanished with no figure behind it is the silent loss the whole
 *    design exists to prevent.
 * 4. Still over after every month that may be summarised is summarised: the
 *    context says `tooLarge` and nothing else is cut -- no trimming of
 *    memories, journal, events or figures.
 *
 * Pure: the measure is `serializeContext`, the same string the model is sent.
 */

import { flowMonths } from '../../domain/derive/finance.js';
import { monthOf, shiftMonth } from '../../domain/dates.js';
import { serializeContext } from './serialize.js';

/**
 * @param {Omit<import('./index.js').QuestionContext, 'summarised' | 'tooLarge'>} context everything the question may be asked over
 * @param {object} rules
 * @param {import('../../domain/types.js').Transaction[]} rules.transactions the archive's, to say which month an item belongs to
 * @param {string} rules.today day key
 * @param {number} rules.maxChars the budget, on `serializeContext(context).length`
 * @param {number} rules.recentMonths how many of the newest months with transactions stay whole
 * @returns {import('./index.js').QuestionContext}
 */
export function fitToBudget(context, { transactions, today, maxChars, recentMonths }) {
  /** @type {import('./index.js').QuestionContext} */
  const whole = { ...context, summarised: null, tooLarge: false };
  if (serializeContext(whole).length <= maxChars) return whole;

  const monthOfId = new Map(transactions.map((transaction) => [transaction.id, monthOf(transaction.date)]));
  /** @type {Map<string, Set<string>>} month -> the transaction items of that month */
  const itemsByMonth = new Map();
  for (const item of context.items) {
    const month = item.type === 'transaction' ? monthOfId.get(item.id) : undefined;
    if (month === undefined) continue;
    itemsByMonth.set(month, (itemsByMonth.get(month) ?? new Set()).add(item.id));
  }

  const held = [...itemsByMonth.keys()].sort();
  const thisMonth = monthOf(today);
  const upToToday = held.filter((month) => month <= thisMonth);
  const newest = new Set(upToToday.slice(Math.max(upToToday.length - recentMonths, 0)));
  // Only a month that has monthly figures: the months the screens offer.
  const offered = new Set(flowMonths(transactions, today, context.trackedSince));
  const candidates = held.filter((month) => offered.has(month) && !newest.has(month));

  /** @type {Set<string>} */
  const dropped = new Set();
  /** @type {import('./index.js').QuestionContext} */
  let result = whole;
  for (const month of candidates) {
    for (const id of itemsByMonth.get(month) ?? []) dropped.add(id);
    result = {
      ...whole,
      items: context.items.filter((item) => !dropped.has(item.id)),
      summarised: describeSummarised(candidates[0], month, held),
    };
    if (serializeContext(result).length <= maxChars) return result;
  }
  return { ...result, tooLarge: true };
}

/**
 * What was summarised, said so it is true. `before` is the first month still
 * listed in full after the summarised ones. Only the months the screens offer
 * are ever summarised, so a month before "tracked since" stays whole even
 * though it is older: then "everything before `before`" would be false, and
 * `since` says where the summarised months start.
 *
 * @param {string} oldest the oldest month summarised, YYYY-MM
 * @param {string} newest the newest month summarised so far, YYYY-MM
 * @param {string[]} held months holding transactions, oldest first
 * @returns {{ since?: string, before: string }}
 */
function describeSummarised(oldest, newest, held) {
  const before = held.find((month) => month > newest) ?? shiftMonth(newest, 1);
  return held.some((month) => month < oldest) ? { since: oldest, before } : { before };
}
