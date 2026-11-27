/**
 * The parts of the question context (ADR 0070). An archive that fits the
 * budget is asked whole; one that does not is asked a part at a time: the
 * parts a question needs, and of what belongs to a month, the months it
 * needs. This module says which part an item is in and which month it
 * belongs to, and what a choice leaves. Pure: no store, no model.
 *
 * The parts are a closed list, `CONTEXT_PARTS` in `personalos.config.js`:
 *
 * - `life`: everything that is not money -- tasks, goals, habits, days,
 *   journal, memories, people, meals, and the figures about them. Also any
 *   kind of item nobody listed here: a new kind is read, never dropped.
 * - `money`: accounts and their balances, net worth, and a month's totals
 *   (income, spending, what is left, the savings rate, fixed and variable).
 * - `categories`: a month's totals by category and by tag.
 * - `transactions`: the single movements.
 * - `investments`: trades, prices over time, and the investment figures.
 */

import { CONTEXT_PARTS } from '../../../personalos.config.js';
import { monthOf, shiftMonth } from '../../domain/dates.js';
import { monthLabel } from '../../domain/format.js';

/**
 * @typedef {object} Read what of the archive a question was asked over
 * @property {string[]} parts some of CONTEXT_PARTS, in that list's order
 * @property {{ from: string, to: string }} months YYYY-MM, both ends read:
 *   of what belongs to a month, only these months were sent
 */

/** @type {Readonly<Record<string, string>>} the part of a record, by its type; any other type is `life` */
const PART_OF_TYPE = Object.freeze({
  transaction: 'transactions',
  account: 'money',
  observation: 'money',
  trade: 'investments',
  price: 'investments',
});

/** @type {Readonly<Record<string, string>>} the part of a figure, by what it is a figure of (`figure:<what>:...`); any other is `life` */
const PART_OF_FIGURE = Object.freeze({
  category: 'categories',
  tag: 'categories',
  investments: 'investments',
  income: 'money',
  spending: 'money',
  left: 'money',
  'savings-rate': 'money',
  'savings-rate-12m': 'money',
  fixed: 'money',
  variable: 'money',
  'net-worth': 'money',
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * @param {import('./build.js').ContextItem} item
 * @returns {string} one of CONTEXT_PARTS
 */
export function partOf(item) {
  if (item.type === 'figure') return PART_OF_FIGURE[item.id.split(':')[1]] ?? 'life';
  return PART_OF_TYPE[item.type] ?? 'life';
}

/**
 * The month an item belongs to: the month a transaction moved in, the month
 * a monthly figure is about (a part of its id that is a month and nothing
 * else). Null for everything that belongs to no month.
 *
 * @param {import('./build.js').ContextItem} item
 * @param {Map<string, string>} monthOfTransaction transaction id -> YYYY-MM
 * @returns {string | null}
 */
export function monthOfItem(item, monthOfTransaction) {
  if (item.type === 'transaction') return monthOfTransaction.get(item.id) ?? null;
  if (item.type !== 'figure') return null;
  return item.id.split(':').find((part) => MONTH.test(part)) ?? null;
}

/**
 * The items a choice leaves: those of the chosen parts and, of what belongs
 * to a month, those inside the months read. Order kept.
 *
 * @template {import('./build.js').ContextItem} T
 * @param {T[]} items
 * @param {Read} read
 * @param {Map<string, string>} monthOfTransaction
 * @returns {T[]}
 */
export function narrowItems(items, read, monthOfTransaction) {
  return items.filter((item) => {
    if (!read.parts.includes(partOf(item))) return false;
    const month = monthOfItem(item, monthOfTransaction);
    return month === null || (month >= read.months.from && month <= read.months.to);
  });
}

/**
 * A choice of parts and months, checked: it comes from a model. A part that
 * is not one is dropped; with none left nothing was chosen. Months that are
 * not two months in order give way to the newest `recentMonths`, up to this
 * one.
 *
 * @param {unknown} raw `{ parts, from?, to? }`
 * @param {string} today day key
 * @param {number} recentMonths
 * @returns {Read | null} null when no part was chosen
 */
export function resolveRead(raw, today, recentMonths) {
  if (raw === null || typeof raw !== 'object') return null;
  const { parts, from, to } = /** @type {Record<string, unknown>} */ (raw);
  if (!Array.isArray(parts)) return null;
  const chosen = CONTEXT_PARTS.filter((part) => parts.includes(part));
  if (chosen.length === 0) return null;

  const given = typeof from === 'string' && typeof to === 'string' && MONTH.test(from) && MONTH.test(to) && from <= to;
  const thisMonth = monthOf(today);
  return {
    parts: [...chosen],
    months: given ? { from, to } : { from: shiftMonth(thisMonth, 1 - recentMonths), to: thisMonth },
  };
}

/** How each part is named to the reader. */
const PART_NAMES = Object.freeze({
  life: 'tasks and days',
  money: 'accounts and monthly totals',
  categories: 'totals by category',
  transactions: 'single movements',
  investments: 'investments',
});

/**
 * What was read, as one line for the answer panel and for a reply in a
 * chat, so an answer over part of the archive never looks like one over all
 * of it: "Read only: tasks and days. Months: September to November 2026."
 *
 * @param {Read | null | undefined} read
 * @returns {string | null} null when the whole archive was read
 */
export function readNote(read) {
  if (!read) return null;
  const names = read.parts.map((part) => PART_NAMES[/** @type {keyof typeof PART_NAMES} */ (part)] ?? part).join(', ');
  const { from, to } = read.months;
  const months = from === to ? monthLabel(from) : monthLabel(from) + ' to ' + monthLabel(to);
  return 'Read only: ' + names + '. Months: ' + months + '.';
}
