'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { financesHref, KIND_LABELS } from '@/components/FinanceBreakdown.js';
import { formatMoney, parseMoney, shortDate } from '@/components/format.js';
import { messageOf, request } from '@/components/request.js';
import { ACCOUNT_KINDS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceObservation} FinanceObservation */

/** The kind as the add form offers it. */
/** @type {Record<FinanceAccount['kind'], string>} */
const KIND_CHOICES = { cash: 'Cash', investment: 'Investment', asset: 'Asset', liability: 'Debt' };

/**
 * The Finances screen's account panel (#114), opened by `?account=<id>`:
 * the account's balances, newest first, and a form to record one -- an
 * amount and a day, today unless you pick another. A debt is typed as the
 * amount owed. Every write posts first and then re-reads the screen, win or
 * lose, so the table and net worth show what was really saved.
 *
 * Mounted with `key={account.id}`, so selecting another account starts clean.
 *
 * @param {{ account: FinanceAccount, balances: FinanceObservation[], todayKey: string }} props
 */
export default function FinanceAccountDetail({ account, balances, todayKey }) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    /** @param {KeyboardEvent} event */
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      const target = /** @type {HTMLElement | null} */ (event.target);
      if (target && target.tagName === 'INPUT') return;
      router.push(financesHref(), { scroll: false });
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [router]);

  /** @param {import('react').FormEvent} event */
  async function recordBalance(event) {
    event.preventDefault();
    const minor = parseMoney(amount);
    if (minor === null) {
      setError('Enter an amount like 1,234.56');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await request(accountUrl(account.id) + '/observations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: minor, date }),
      });
      setAmount('');
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsSaving(false);
    startTransition(() => router.refresh());
  }

  return (
    <aside id="card-finance-account" className="card span-5">
      <div className="card-head">
        <span className="eyebrow">{KIND_LABELS[account.kind]}</span>
        <button
          type="button"
          className="btn-ghost"
          aria-label="Esc: close the panel"
          onClick={() => router.push(financesHref(), { scroll: false })}
        >
          Esc
        </button>
      </div>
      <div className="card-body">
        <h2 className="subhead finance-account-name">{account.name}</h2>
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}

        <form className="finance-entry" onSubmit={recordBalance}>
          <div className="field">
            <label className="caption" htmlFor="f-amount">
              {account.kind === 'liability' ? 'Amount owed' : 'Balance'}
            </label>
            <input
              id="f-amount"
              className="input num"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="field">
            <label className="caption" htmlFor="f-date">On</label>
            <input
              id="f-date"
              type="date"
              className="input"
              value={date}
              max={todayKey}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isSaving || amount.trim() === ''}>
            Record
          </button>
        </form>

        <div className="divider" />
        {balances.length === 0 ? (
          <p className="caption">No balance recorded yet, so its value is unknown.</p>
        ) : (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">{account.kind === 'liability' ? 'Owed' : 'Balance'}</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((balance) => (
                <tr key={balance.id}>
                  <td className="num finance-date">{shortDate(balance.date, todayKey)}</td>
                  <td className="num">{formatMoney(balance.amount, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}

/**
 * Shown when no account is selected: how to add one. A name and a kind; the
 * new account opens at once, ready for its first balance.
 */
export function FinanceAccountEmpty() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState(/** @type {FinanceAccount['kind']} */ ('cash'));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);
  const [, startTransition] = useTransition();

  /** @param {import('react').FormEvent} event */
  async function addAccount(event) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const { account } = await request('/api/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, kind }),
      });
      router.push(financesHref(account.id), { scroll: false });
    } catch (caught) {
      setError(messageOf(caught));
    }
    setIsSaving(false);
    startTransition(() => router.refresh());
  }

  return (
    <aside id="card-finance-account" className="card span-5">
      <div className="card-head">
        <span className="eyebrow">Account</span>
      </div>
      <div className="card-body">
        <p className="caption finance-hint">Select an account to record its balance, or add one.</p>
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}
        <form onSubmit={addAccount}>
          <div className="field">
            <label className="caption" htmlFor="f-name">Name</label>
            <input id="f-name" className="input" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="field">
            <span className="caption">Kind</span>
            <div className="segmented" role="group" aria-label="Kind">
              {ACCOUNT_KINDS.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={'seg' + (kind === choice ? ' is-on' : '')}
                  aria-pressed={kind === choice}
                  onClick={() => setKind(/** @type {FinanceAccount['kind']} */ (choice))}
                >
                  {KIND_CHOICES[/** @type {FinanceAccount['kind']} */ (choice)]}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={isSaving || name.trim() === ''}>
            Add account
          </button>
        </form>
      </div>
    </aside>
  );
}

/** @param {string} id */
export function accountUrl(id) {
  return '/api/accounts/' + encodeURIComponent(id);
}
