'use client';

import { useState } from 'react';

import { formatMoney, parseMoney, shortDate } from '@/components/format.js';

/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceObservation} FinanceObservation */

/**
 * @typedef {object} PanelWrites what the account panel hands a section
 * @property {(url: string, init: RequestInit) => Promise<boolean>} write one
 *   write, then a re-read of the screen; whether it was saved
 * @property {(message: string) => void} refuse shows why nothing was sent
 * @property {boolean} isSaving
 * @property {string} todayKey
 */

/**
 * An account valued by balance, in its panel (#114, #115): a form to record
 * a balance -- an amount and a day, today unless you pick another; a debt as
 * the amount owed -- and its balances, newest first, each corrected or
 * deleted on its row.
 *
 * @param {PanelWrites & { account: FinanceAccount, balances: FinanceObservation[] }} props
 */
export default function FinanceBalances({ account, balances, write, refuse, isSaving, todayKey }) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayKey);
  const [editingId, setEditingId] = useState(/** @type {string | null} */ (null));

  /** @param {import('react').FormEvent} event */
  async function recordBalance(event) {
    event.preventDefault();
    const minor = parseMoney(amount);
    if (minor === null) {
      refuse('Enter an amount like 1,234.56');
      return;
    }
    const saved = await write(accountUrl(account.id) + '/observations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: minor, date }),
    });
    if (saved) setAmount('');
  }

  /** @param {FinanceObservation} balance */
  async function removeBalance(balance) {
    if (!window.confirm('Delete the balance of ' + shortDate(balance.date, todayKey) + '?')) return;
    await write(balanceUrl(balance.id), { method: 'DELETE' });
  }

  /** @param {FinanceObservation} balance @param {{ amount: number, date: string }} body */
  async function correctBalance(balance, body) {
    const saved = await write(balanceUrl(balance.id), {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (saved) setEditingId(null);
  }

  return (
    <>
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
              <th />
            </tr>
          </thead>
          <tbody>
            {balances.map((balance) =>
              balance.id === editingId ? (
                <BalanceEditor
                  key={balance.id}
                  balance={balance}
                  todayKey={todayKey}
                  isSaving={isSaving}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) => correctBalance(balance, body)}
                />
              ) : (
                <tr key={balance.id}>
                  <td className="num finance-date">{shortDate(balance.date, todayKey)}</td>
                  <td className="num">{formatMoney(balance.amount, { cents: true })}</td>
                  <td className="finance-row-actions">
                    <button type="button" className="btn-ghost" disabled={isSaving} onClick={() => setEditingId(balance.id)}>
                      Edit
                    </button>
                    <button type="button" className="btn-ghost" disabled={isSaving} onClick={() => removeBalance(balance)}>
                      Delete
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </>
  );
}

/**
 * A balance's row while it is being corrected: amount and date in place,
 * saved together.
 *
 * @param {{
 *   balance: FinanceObservation,
 *   todayKey: string,
 *   isSaving: boolean,
 *   onSave: (body: { amount: number, date: string }) => void,
 *   onCancel: () => void,
 * }} props
 */
function BalanceEditor({ balance, todayKey, isSaving, onSave, onCancel }) {
  const [amount, setAmount] = useState(formatMoney(balance.amount, { cents: true }));
  const [date, setDate] = useState(balance.date);
  const parsed = parseMoney(amount);

  return (
    <tr className="finance-editing">
      <td>
        <input
          aria-label="Date"
          type="date"
          className="input"
          value={date}
          max={todayKey}
          onChange={(event) => setDate(event.target.value)}
        />
      </td>
      <td>
        <input
          aria-label="Amount"
          className="input num"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onCancel();
          }}
        />
      </td>
      <td className="finance-row-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={isSaving || parsed === null}
          onClick={() => parsed !== null && onSave({ amount: parsed, date })}
        >
          Save
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

/** @param {string} id */
function balanceUrl(id) {
  return '/api/observations/' + encodeURIComponent(id);
}

/** @param {string} id */
export function accountUrl(id) {
  return '/api/accounts/' + encodeURIComponent(id);
}
