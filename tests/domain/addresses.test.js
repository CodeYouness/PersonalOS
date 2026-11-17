import { describe, expect, it } from 'vitest';

import {
  crmAddress,
  financesAddress,
  financesSpan,
  goalsAddress,
  journalAddress,
  habitsAddress,
  nutritionAddress,
} from '@/lib/domain/addresses.js';
import { financesHref } from '@/components/finance.js';
import { journalHref } from '@/components/journal.js';

describe('addresses: one implementation of where a record opens', () => {
  it('addresses a CRM task, keeping the view', () => {
    expect(crmAddress('board', 'task_seed_1')).toBe('/crm?task=task_seed_1');
    expect(crmAddress('person', 'task_seed_1')).toBe('/crm?view=person&task=task_seed_1');
    expect(crmAddress('board')).toBe('/crm');
    expect(crmAddress('person')).toBe('/crm?view=person');
  });

  it('addresses a goal, encoding the id', () => {
    expect(goalsAddress('goal_seed_1')).toBe('/goals?goal=goal_seed_1');
    expect(goalsAddress()).toBe('/goals');
    expect(goalsAddress('goal_a&b')).toBe('/goals?goal=goal_a%26b');
  });

  it('addresses a journal day', () => {
    expect(journalAddress('2026-01-04')).toBe('/journal?date=2026-01-04');
  });

  it('addresses a place on Finances, in the screen\'s own parameter order', () => {
    expect(financesAddress({ account: 'account_seed_current' })).toBe('/finances?account=account_seed_current');
    expect(financesAddress({ transaction: 'transaction_seed_4', month: '2026-01' })).toBe(
      '/finances?month=2026-01&transaction=transaction_seed_4'
    );
    expect(financesAddress({ account: 'account_a', month: '2026-01', category: 'cat_1', transaction: 'tx_1' })).toBe(
      '/finances?account=account_a&month=2026-01&category=cat_1&transaction=tx_1'
    );
    expect(financesAddress({ account: null, month: '' })).toBe('/finances');
    expect(financesAddress({ account: 'account_a', month: '2026-01', period: 'year', category: 'cat_1' })).toBe(
      '/finances?account=account_a&month=2026-01&period=year&category=cat_1'
    );
    expect(financesAddress()).toBe('/finances');
  });

  it('writes the year reading of Income & spending, never the month one, its default', () => {
    expect(financesAddress({ month: '2026-01', period: 'year' })).toBe('/finances?month=2026-01&period=year');
    expect(financesAddress({ month: '2026-01', period: 'month' })).toBe('/finances?month=2026-01');
    expect(financesAddress({ month: '2026-01', period: null })).toBe('/finances?month=2026-01');
  });

  it('no longer writes a chart: the switch is gone, and an old one is never carried on (ADR 0048)', () => {
    const old = /** @type {any} */ ({ month: '2026-01', chart: 'flows' });
    expect(financesAddress(old)).toBe('/finances?month=2026-01');
  });

  it('addresses a tag of the period, encoding whatever the user typed, and reads it back unchanged', () => {
    expect(financesAddress({ month: '2026-03', tag: 'lisbon' })).toBe('/finances?month=2026-03&tag=lisbon');
    expect(financesAddress({ month: '2026-03', period: 'year', tag: 'lisbon', span: 'all', transaction: 'tx_1' })).toBe(
      '/finances?month=2026-03&period=year&tag=lisbon&span=all&transaction=tx_1'
    );
    for (const tag of ['work expenses 2026', 'a&b=c', 'été / 50%', 'x+y#z']) {
      const written = financesAddress({ month: '2026-03', tag });
      expect(written).not.toMatch(/[ #]/);
      expect(new URL(written, 'http://localhost').searchParams.get('tag')).toBe(tag);
    }
  });

  it('writes the whole list of the period, which reuses the span (ADR 0048)', () => {
    expect(financesAddress({ month: '2026-03', span: 'all' })).toBe('/finances?month=2026-03&span=all');
  });

  it('reads the span back from the address: all of a tag, or else the period', () => {
    expect(financesSpan('all')).toBe('all');
    expect(financesSpan(undefined)).toBeNull();
    expect(financesSpan('ever')).toBeNull();
    expect(financesSpan(['all', 'all'])).toBeNull();
  });

  it('addresses a Finances transaction by the month of its day', () => {
    expect(financesAddress({ month: '2026-01', transaction: 'tx 1/2' })).toBe('/finances?month=2026-01&transaction=tx+1%2F2');
  });

  it('addresses a day of Nutrition & Health', () => {
    expect(nutritionAddress('2026-09-20')).toBe('/nutrition?day=2026-09-20');
    expect(nutritionAddress()).toBe('/nutrition');
  });

  it('addresses the Habits screen, which selects nothing', () => {
    expect(habitsAddress()).toBe('/habits');
  });

  it('is what the plain-module builders delegate to (the JSX ones cannot load under Vitest)', () => {
    expect(journalHref('2026-01-04')).toBe(journalAddress('2026-01-04'));
    expect(financesHref({ month: '2026-01', transaction: 'transaction_seed_4' })).toBe(
      financesAddress({ month: '2026-01', transaction: 'transaction_seed_4' })
    );
  });
});
