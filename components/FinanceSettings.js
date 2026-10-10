'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { shortDate } from '@/components/format.js';
import { messageOf, request } from '@/components/request.js';

/**
 * The Finances screen's settings (#138): "tracked since", the day your
 * tracking started. The history, the 1-year change and the months Income &
 * spending offers start there (ADR 0025); trades before it still count
 * toward a holding's units. Saved when the day is chosen; Clear goes back
 * to starting at the first value. A refused write shows why and re-reads.
 *
 * @param {{ trackedSince: string | null, todayKey: string }} props
 */
export default function FinanceSettings({ trackedSince, todayKey }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [day, setDay] = useState(trackedSince ?? '');
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [isSaving, setIsSaving] = useState(false);

  /** @param {string | null} value */
  async function save(value) {
    setIsSaving(true);
    setError(null);
    try {
      await request('/api/finance-settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ financeTrackedSince: value }),
      });
      setDay(value ?? '');
    } catch (caught) {
      setError(messageOf(caught));
      setDay(trackedSince ?? '');
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
              onBlur={() => {
                if (day !== '' && day !== trackedSince) save(day);
              }}
            />
          </div>
          <button type="button" className="btn-ghost" disabled={isSaving || trackedSince === null} onClick={() => save(null)}>
            Clear
          </button>
        </div>
        <p className="caption finance-hint">
          {trackedSince === null
            ? 'The history starts at your first balance or trade.'
            : 'The history starts at the end of ' + shortDate(trackedSince, todayKey) + "'s month; earlier trades still count toward what you hold."}
        </p>
      </div>
    </article>
  );
}
