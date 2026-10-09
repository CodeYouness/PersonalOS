'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import FinanceBalances, { accountUrl } from '@/components/FinanceBalances.js';
import { financesHref, KIND_LABELS } from '@/components/FinanceBreakdown.js';
import FinanceHoldings from '@/components/FinanceHoldings.js';
import { shortDate } from '@/components/format.js';
import { messageOf, request } from '@/components/request.js';
import { ACCOUNT_KINDS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceObservation} FinanceObservation */
/** @typedef {import('@/lib/domain/types.js').Trade} Trade */

/** The kind as the add form offers it. */
/** @type {Record<FinanceAccount['kind'], string>} */
const KIND_CHOICES = { cash: 'Cash', investment: 'Investment', asset: 'Asset', liability: 'Debt' };

/**
 * The Finances screen's account panel (#114), opened by `?account=<id>`:
 * what the account is worth, recorded the way it is valued -- balances
 * (FinanceBalances) or, for a holding, trades (FinanceHoldings, #116). Every
 * write posts first and then re-reads the screen, win or lose, so the table
 * and net worth show what was really saved.
 *
 * The rest of an account's life is here too (#115): the name saves when you
 * leave it; Archive takes a closed account out of the table, keeping its
 * data, and Restore puts it back; Delete asks first and removes the account
 * with everything recorded on it.
 *
 * Mounted with `key={account.id}`, so selecting another account starts clean.
 *
 * @param {{ account: FinanceAccount, balances: FinanceObservation[], trades: Trade[], todayKey: string }} props
 */
export default function FinanceAccountDetail({ account, balances, trades, todayKey }) {
  const router = useRouter();
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState(account.name);
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

  /**
   * One write, then a re-read of the screen whatever the answer: the panel
   * never keeps showing a story that was not saved.
   *
   * @param {string} url
   * @param {RequestInit} init
   * @returns {Promise<boolean>} whether it was saved
   */
  async function write(url, init) {
    setIsSaving(true);
    setError(null);
    let saved = true;
    try {
      await request(url, init);
    } catch (caught) {
      setError(messageOf(caught));
      saved = false;
    }
    setIsSaving(false);
    startTransition(() => router.refresh());
    return saved;
  }

  /** @param {string} url @param {Record<string, unknown>} body */
  const patch = (url, body) =>
    write(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  async function commitName() {
    const trimmed = name.trim();
    if (trimmed === '' || trimmed === account.name) {
      setName(account.name);
      return;
    }
    if (!(await patch(accountUrl(account.id), { name: trimmed }))) setName(account.name);
  }

  async function removeAccount() {
    const confirmed = window.confirm(
      'Delete ' + account.name + ' with everything recorded on it? This cannot be undone. To keep its past, archive it instead.'
    );
    if (!confirmed) return;
    if (await write(accountUrl(account.id), { method: 'DELETE' })) router.push(financesHref(), { scroll: false });
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
        <div className="field">
          <label className="caption" htmlFor="f-account-name">Name</label>
          <input
            id="f-account-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setName(account.name);
                event.currentTarget.blur();
              }
            }}
          />
        </div>
        {account.archivedOn !== null && (
          <p className="caption finance-hint">
            Archived on {shortDate(account.archivedOn, todayKey)}. It still counts in the history before that day.
          </p>
        )}
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}

        {account.valuation === 'units' ? (
          <FinanceHoldings
            account={account}
            trades={trades}
            write={write}
            refuse={setError}
            isSaving={isSaving}
            todayKey={todayKey}
          />
        ) : (
          <FinanceBalances
            account={account}
            balances={balances}
            write={write}
            refuse={setError}
            isSaving={isSaving}
            todayKey={todayKey}
          />
        )}

        <div className="detail-actions">
          {account.archivedOn === null ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={isSaving}
              onClick={() => patch(accountUrl(account.id), { archived: true })}
            >
              Archive
            </button>
          ) : (
            <button
              type="button"
              className="btn-ghost"
              disabled={isSaving}
              onClick={() => patch(accountUrl(account.id), { archived: false })}
            >
              Restore
            </button>
          )}
          <button type="button" className="btn-danger" disabled={isSaving} onClick={removeAccount}>
            Delete
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * Shown when no account is selected: how to add one. A name and a kind, and
 * for an investment whether it is valued by balance or by units (#116) --
 * the only kind for which the choice means something. The new account opens
 * at once, ready for its first balance or trade.
 */
export function FinanceAccountEmpty() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState(/** @type {FinanceAccount['kind']} */ ('cash'));
  const [valuation, setValuation] = useState(/** @type {FinanceAccount['valuation']} */ ('balance'));
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
        body: JSON.stringify(kind === 'investment' ? { name, kind, valuation } : { name, kind }),
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
        <p className="caption finance-hint">Select an account to keep it current, or add one.</p>
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
          {kind === 'investment' && (
            <div className="field">
              <span className="caption">Valued by</span>
              <div className="segmented" role="group" aria-label="Valued by">
                {/** @type {const} */ (['balance', 'units']).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className={'seg' + (valuation === choice ? ' is-on' : '')}
                    aria-pressed={valuation === choice}
                    onClick={() => setValuation(choice)}
                  >
                    {choice === 'balance' ? 'Balance' : 'Units and price'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="submit" className="btn-primary" disabled={isSaving || name.trim() === ''}>
            Add account
          </button>
        </form>
      </div>
    </aside>
  );
}
