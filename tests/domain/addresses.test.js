import { describe, expect, it } from 'vitest';

import {
  crmAddress,
  financesAddress,
  financesInterest,
  financesParams,
  financesQuery,
  financesRefunded,
  financesSpan,
  financesUncounted,
  financesView,
  goalsAddress,
  journalAddress,
  habitsAddress,
  nutritionAddress,
} from '@/lib/domain/addresses.js';
import { financesHref, lineName } from '@/components/finance.js';
import { journalHref } from '@/components/journal.js';
import { limits } from '@/personalos.config.js';

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

  it('writes the refunded movements shown beside the other parameters, and reads them back (ADR 0055)', () => {
    expect(financesAddress({ month: '2026-03', category: 'cat_1', span: 'all', refunded: 'show', transaction: 'tx_1' })).toBe(
      '/finances?month=2026-03&category=cat_1&span=all&refunded=show&transaction=tx_1'
    );
    expect(financesAddress({ month: '2026-03', refunded: null })).toBe('/finances?month=2026-03');
    expect(financesRefunded('show')).toBe('show');
    expect(financesRefunded(undefined)).toBeNull();
    expect(financesRefunded('hide')).toBeNull();
    expect(financesRefunded(['show', 'show'])).toBeNull();
  });

  it('writes the interest shown movement by movement after the refunded, and reads it back (ADR 0056)', () => {
    expect(financesAddress({ month: '2026-03', category: 'cat_1', refunded: 'show', interest: 'show', transaction: 'tx_1' })).toBe(
      '/finances?month=2026-03&category=cat_1&refunded=show&interest=show&transaction=tx_1'
    );
    expect(financesAddress({ month: '2026-03', interest: null })).toBe('/finances?month=2026-03');
    expect(financesInterest('show')).toBe('show');
    expect(financesInterest(undefined)).toBeNull();
    expect(financesInterest('fold')).toBeNull();
    expect(financesInterest(['show', 'show'])).toBeNull();
  });

  it('writes the not-counted movements shown after the interest, and reads them back (ADR 0058)', () => {
    expect(financesAddress({ month: '2026-03', refunded: 'show', interest: 'show', uncounted: 'show', transaction: 'tx_1' })).toBe(
      '/finances?month=2026-03&refunded=show&interest=show&uncounted=show&transaction=tx_1'
    );
    expect(financesAddress({ month: '2026-03', uncounted: null })).toBe('/finances?month=2026-03');
    expect(financesUncounted('show')).toBe('show');
    expect(financesUncounted(undefined)).toBeNull();
    expect(financesUncounted('hide')).toBeNull();
    expect(financesUncounted(['show', 'show'])).toBeNull();
  });

  it('writes a search after the toggles and before the selected movement, so opening a result keeps it (ADR 0058)', () => {
    expect(financesAddress({ month: '2026-03', uncounted: 'show', q: 'café 12,50', transaction: 'tx_1' })).toBe(
      '/finances?month=2026-03&uncounted=show&q=caf%C3%A9+12%2C50&transaction=tx_1'
    );
    const written = financesAddress({ month: '2026-03', q: 'a&b=c #1' });
    expect(new URL(written, 'http://localhost').searchParams.get('q')).toBe('a&b=c #1');
  });

  it('reads a search from the address: trimmed, spaces collapsed, capped, and none when empty (ADR 0058)', () => {
    expect(financesQuery('  lunch   at  noon ')).toBe('lunch at noon');
    expect(financesQuery('')).toBeNull();
    expect(financesQuery('   ')).toBeNull();
    expect(financesQuery(undefined)).toBeNull();
    expect(financesQuery(['lunch', 'dinner'])).toBeNull();
    const long = financesQuery('x'.repeat(500));
    expect(long?.length).toBe(limits.financeSearchMaxLength);
    expect(financesQuery('a' + ' '.repeat(limits.financeSearchMaxLength) + 'b')).toBe('a b');
  });

  it('lists a place as the parameters it writes, for a form to carry as hidden fields (ADR 0058)', () => {
    expect(financesParams({ account: 'account_a', month: '2026-03', period: 'month', view: 'columns', uncounted: 'show', q: null })).toEqual([
      ['account', 'account_a'],
      ['month', '2026-03'],
      ['view', 'columns'],
      ['uncounted', 'show'],
    ]);
  });

  it('writes the columns of Income & spending, never the circle, its default (ADR 0053)', () => {
    expect(financesAddress({ month: '2026-03', period: 'year', view: 'columns', category: 'cat_1' })).toBe(
      '/finances?month=2026-03&period=year&view=columns&category=cat_1'
    );
    expect(financesAddress({ month: '2026-03', view: 'circle' })).toBe('/finances?month=2026-03');
    expect(financesAddress({ month: '2026-03', view: null })).toBe('/finances?month=2026-03');
  });

  it('reads the view back from the address: the columns, or else the circle -- an old table view too', () => {
    expect(financesView('columns')).toBe('columns');
    expect(financesView(undefined)).toBe('circle');
    expect(financesView('table')).toBe('circle');
    expect(financesView('pie')).toBe('circle');
    expect(financesView(['columns', 'columns'])).toBe('circle');
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

  it('selects a parent\'s own line by an id of its own, and names it (ADR 0057)', () => {
    /** @type {any[]} */
    const categories = [
      { id: 'cat_home', name: 'Home', kind: 'expense', parentId: null, fixedCost: false, archived: false },
      { id: 'cat_rent', name: 'Rent', kind: null, parentId: 'cat_home', fixedCost: false, archived: false },
    ];

    expect(financesAddress({ month: '2026-03', category: 'own:cat_home' })).toBe('/finances?month=2026-03&category=own%3Acat_home');
    expect(lineName('own:cat_home', categories)).toBe('Home with no subcategory');
    expect(lineName('own:cat_rent', categories)).toBeNull();
    expect(lineName('own:cat_gone', categories)).toBeNull();
  });
});
