/**
 * The parts of the question context (ADR 0070): which part an item belongs
 * to, which month, and what a choice of parts and months leaves. Pure.
 */

import { describe, expect, it } from 'vitest';

import { monthOfItem, narrowItems, partOf, resolveRead } from '@/lib/ai/context/parts.js';
import { CONTEXT_PARTS } from '@/personalos.config.js';

/** @param {string} id @param {string} type */
const item = (id, type) => /** @type {any} */ ({ id, type, label: id, content: id, labels: [], opens: null });

const TASK = item('task_1', 'task');
const JOURNAL = item('journal_1', 'journal');
const ACCOUNT = item('account_1', 'account');
const OBSERVATION = item('observation_1', 'observation');
const SEPTEMBER = item('transaction_sep', 'transaction');
const OCTOBER = item('transaction_oct', 'transaction');
const TRADE = item('trade_1', 'trade');
const PRICE = item('price_1', 'price');
const SPENDING_OCT = item('figure:spending:2026-10', 'figure');
const NET_WORTH = item('figure:net-worth:now', 'figure');
const CATEGORY_SEP = item('figure:category:2026-09:cat_food', 'figure');
const CATEGORY_OCT = item('figure:category:2026-10:cat_food', 'figure');
const TAG_OCT = item('figure:tag:2026-10:holiday', 'figure');
const INVESTMENTS = item('figure:investments:now', 'figure');
const HABITS = item('figure:habit-streak:now', 'figure');
const EVERYTHING = [TASK, JOURNAL, ACCOUNT, OBSERVATION, SEPTEMBER, OCTOBER, TRADE, PRICE, SPENDING_OCT, NET_WORTH, CATEGORY_SEP, CATEGORY_OCT, TAG_OCT, INVESTMENTS, HABITS];

const MONTHS = new Map([['transaction_sep', '2026-09'], ['transaction_oct', '2026-10']]);

describe('partOf', () => {
  it('puts every item in one of the closed parts', () => {
    for (const each of EVERYTHING) expect(CONTEXT_PARTS, each.id).toContain(partOf(each));
  });

  it('keeps single movements, their totals by category and the money totals apart', () => {
    expect(partOf(OCTOBER)).toBe('transactions');
    expect(partOf(CATEGORY_OCT)).toBe('categories');
    expect(partOf(TAG_OCT)).toBe('categories');
    expect(partOf(SPENDING_OCT)).toBe('money');
    expect(partOf(NET_WORTH)).toBe('money');
    expect(partOf(ACCOUNT)).toBe('money');
    expect(partOf(OBSERVATION)).toBe('money');
  });

  it('puts trades, prices and the investment figures together', () => {
    expect([TRADE, PRICE, INVESTMENTS].map(partOf)).toEqual(['investments', 'investments', 'investments']);
  });

  it('calls everything else life, the figures about days included', () => {
    expect([TASK, JOURNAL, HABITS].map(partOf)).toEqual(['life', 'life', 'life']);
    // A kind nobody listed is life, never dropped.
    expect(partOf(item('whatever_1', 'whatever'))).toBe('life');
  });
});

describe('monthOfItem', () => {
  it('is the month a transaction moved in', () => {
    expect(monthOfItem(OCTOBER, MONTHS)).toBe('2026-10');
  });

  it('is the month a monthly figure is about', () => {
    expect(monthOfItem(CATEGORY_SEP, MONTHS)).toBe('2026-09');
    expect(monthOfItem(SPENDING_OCT, MONTHS)).toBe('2026-10');
  });

  it('is null for what belongs to no month', () => {
    expect(monthOfItem(TASK, MONTHS)).toBeNull();
    expect(monthOfItem(NET_WORTH, MONTHS)).toBeNull();
    expect(monthOfItem(item('figure:investments:2026-ytd', 'figure'), MONTHS)).toBeNull();
  });
});

describe('narrowItems', () => {
  const october = { from: '2026-10', to: '2026-10' };

  it('keeps the chosen parts and nothing else, in the order they came', () => {
    expect(narrowItems(EVERYTHING, { parts: ['life'], months: october }, MONTHS)).toEqual([TASK, JOURNAL, HABITS]);
  });

  it('keeps of a month only what is inside the months read', () => {
    const kept = narrowItems(EVERYTHING, { parts: ['transactions', 'categories', 'money'], months: october }, MONTHS);
    expect(kept).toEqual([ACCOUNT, OBSERVATION, OCTOBER, SPENDING_OCT, NET_WORTH, CATEGORY_OCT, TAG_OCT]);
  });

  it('reads a span of months from its first to its last', () => {
    const kept = narrowItems(EVERYTHING, { parts: ['transactions'], months: { from: '2026-09', to: '2026-10' } }, MONTHS);
    expect(kept).toEqual([SEPTEMBER, OCTOBER]);
  });
});

describe('resolveRead', () => {
  const TODAY = '2026-11-27';

  it('takes the parts and the months it was given', () => {
    expect(resolveRead({ parts: ['money', 'life'], from: '2026-01', to: '2026-06' }, TODAY, 3)).toEqual({
      // In the closed list's order, whatever order they were said in.
      parts: ['life', 'money'],
      months: { from: '2026-01', to: '2026-06' },
    });
  });

  it('reads the newest months, up to this one, when none were given', () => {
    expect(resolveRead({ parts: ['life'] }, TODAY, 3)).toEqual({ parts: ['life'], months: { from: '2026-09', to: '2026-11' } });
  });

  it.each([
    ['a month that is not one', { parts: ['life'], from: '2026-13', to: '2026-14' }],
    ['a span that runs backwards', { parts: ['life'], from: '2026-06', to: '2026-01' }],
    ['one end only', { parts: ['life'], from: '2026-06' }],
  ])('falls back to the newest months for %s', (_what, raw) => {
    expect(resolveRead(raw, TODAY, 3)?.months).toEqual({ from: '2026-09', to: '2026-11' });
  });

  it('drops a part that is not one, and keeps each once', () => {
    expect(resolveRead({ parts: ['life', 'everything', 'life', 7] }, TODAY, 3)?.parts).toEqual(['life']);
  });

  it.each([
    ['no parts', { parts: [] }],
    ['no part that is one', { parts: ['everything'] }],
    ['parts that are not a list', { parts: 'life' }],
    ['nothing', null],
  ])('is null for %s: nothing was chosen', (_what, raw) => {
    expect(resolveRead(raw, TODAY, 3)).toBeNull();
  });
});
