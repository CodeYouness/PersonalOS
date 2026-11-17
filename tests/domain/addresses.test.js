import { describe, expect, it } from 'vitest';

import {
  crmAddress,
  financesAddress,
  financesChart,
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

  it('writes the bars chart of Income & spending, never the net worth line, its default', () => {
    expect(financesAddress({ month: '2026-01', chart: 'flows' })).toBe('/finances?month=2026-01&chart=flows');
    expect(financesAddress({ month: '2026-01', chart: 'worth' })).toBe('/finances?month=2026-01');
    expect(financesAddress({ month: '2026-01', chart: null })).toBe('/finances?month=2026-01');
    expect(financesAddress({ account: 'account_a', month: '2026-01', period: 'year', chart: 'flows', category: 'cat_1' })).toBe(
      '/finances?account=account_a&month=2026-01&period=year&chart=flows&category=cat_1'
    );
  });

  it('reads the chart back from the address, anything else being the line', () => {
    for (const chart of /** @type {const} */ (['worth', 'flows'])) {
      const written = new URL(financesAddress({ month: '2026-01', chart }), 'http://localhost').searchParams.get('chart');
      expect(financesChart(written ?? undefined)).toBe(chart);
    }
    expect(financesChart(undefined)).toBe('worth');
    expect(financesChart('bars')).toBe('worth');
    expect(financesChart(['flows', 'flows'])).toBe('worth');
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
