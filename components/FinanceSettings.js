'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { monthLabel } from '@/components/format.js';
import { monthOf } from '@/lib/domain/dates.js';
import { messageOf, request } from '@/components/request.js';
import { isMovableAccount } from '@/lib/domain/derive/finance.js';
import { limits } from '@/personalos.config.js';

/**
 * The Finances screen's settings. "Tracked since" (#138), the day your
 * tracking started: the history, the 1-year change and the months Income &
 * spending offers start there (ADR 0025); trades before it still count
 * toward a holding's units. Saved when you leave the field (also on Enter);
 * Clear goes back to starting at the first value. The default account
 * (#141): where a spending sentence that names no account is filed (ADR
 * 0026), chosen among your open accounts valued by balance; saved when
 * chosen. The target savings rate (ADR 0045), a whole percent from 1 to 99:
 * each savings rate on Income & spending says whether it meets it; saved
 * when you leave the field (also on Enter), Clear target removes it. A
 * refused write shows why and re-reads.
 *
 * @param {{
 *   trackedSince: string | null,
 *   defaultAccountId: string | null,
 *   savingsTarget: number | null,
 *   accounts: import('@/lib/domain/types.js').FinanceAccount[],
 *   todayKey: string,
 * }} props
 */
export default function FinanceSettings({ trackedSince, defaultAccountId, savingsTarget, accounts, todayKey }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [day, setDay] = useState(trackedSince ?? '');
  const [target, setTarget] = useState(savingsTarget === null ? '' : String(savingsTarget));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);

  /** @param {{ financeTrackedSince?: string | null, defaultAccountId?: string | null, financeSavingsTarget?: number | null }} body */
  async function save(body) {
    setIsSaving(true);
    setError(null);
    try {
      await request('/api/finance-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if ('financeTrackedSince' in body) setDay(body.financeTrackedSince ?? '');
      if ('financeSavingsTarget' in body) setTarget(String(body.financeSavingsTarget ?? ''));
    } catch (caught) {
      setError(messageOf(caught));
      setDay(trackedSince ?? '');
      setTarget(savingsTarget === null ? '' : String(savingsTarget));
    }
    setIsSaving(false);
    startTransition(() => router.refresh());
  }

  return (
    <article id="card-finance-settings" className="card">
      <div className="card-head">
        <span className="eyebrow">Settings</span>
      </div>
      <div className="card-body">
        {error !== null && (
          <p className="caption is-error" role="alert">
            {error}
          </p>
        )}
        <div className="finance-entry">
          <div className="field">
            <label className="caption" htmlFor="s-tracked-since">Tracked since</label>
            <input
              id="s-tracked-since"
              type="date"
              className="input"
              value={day}
              max={todayKey}
              disabled={isSaving}
              onChange={(event) => setDay(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              onBlur={() => {
                if (day !== '' && day !== trackedSince) save({ financeTrackedSince: day });
              }}
            />
          </div>
          <button type="button" className="btn-ghost" disabled={isSaving || trackedSince === null} onClick={() => save({ financeTrackedSince: null })}>
            Clear
          </button>
        </div>
        <p className="caption finance-hint">
          {trackedSince === null
            ? 'The history starts at your first balance or trade.'
            : 'The history starts with ' + monthLabel(monthOf(trackedSince)) + '; earlier trades still count toward what you hold.'}
        </p>
        <div className="field">
          <label className="caption" htmlFor="s-default-account">Default account</label>
          <select
            id="s-default-account"
            className="input"
            value={defaultAccountId ?? ''}
            disabled={isSaving}
            onChange={(event) => save({ defaultAccountId: event.target.value === '' ? null : event.target.value })}
          >
            <option value="">None</option>
            {accounts
              .filter(isMovableAccount)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
        <p className="caption finance-hint">
          {defaultAccountId === null
            ? 'A spending sentence that names no account stays a capture until you choose one.'
            : 'A spending sentence that names no account is filed here.'}
        </p>
        <div className="finance-entry">
          <div className="field">
            <label className="caption" htmlFor="s-savings-target">Target savings rate (%)</label>
            <input
              id="s-savings-target"
              type="number"
              inputMode="numeric"
              className="input"
              min={limits.savingsTargetMin}
              max={limits.savingsTargetMax}
              step={1}
              value={target}
              disabled={isSaving}
              onChange={(event) => setTarget(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              onBlur={() => {
                // The store decides what a target may be; a refusal says why.
                if (target !== '' && Number(target) !== savingsTarget) save({ financeSavingsTarget: Number(target) });
              }}
            />
          </div>
          <button type="button" className="btn-ghost" disabled={isSaving || savingsTarget === null} onClick={() => save({ financeSavingsTarget: null })}>
            Clear target
          </button>
        </div>
        <p className="caption finance-hint">
          {savingsTarget === null
            ? 'No target: each savings rate is shown alone.'
            : 'Each savings rate says whether it meets ' + savingsTarget + '%.'}
        </p>
      </div>
    </article>
  );
}
