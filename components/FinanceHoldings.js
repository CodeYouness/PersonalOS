'use client';

import { useState } from 'react';

import { accountUrl } from '@/components/FinanceBalances.js';
import { formatMoney, formatUnits, parseMoney, parseUnits, shortDate } from '@/components/format.js';
import { TRADE_DIRECTIONS } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').Trade} Trade */
/** @typedef {import('@/lib/domain/types.js').Price} Price */

const JSON_HEADERS = { 'content-type': 'application/json' };

/**
 * A holding -- an account valued by units -- in its panel: a form to record
 * a buy or a sell, with its units, price per unit and fee (#116), and one to
 * record a price for a month with no trade (#117); then the trades and the
 * prices, newest first, each corrected or deleted on its row. Its value is
 * the units held times the latest price; a fee is what it cost, never what
 * it is worth.
 *
 * @param {import('@/components/FinanceBalances.js').PanelWrites & {
 *   account: FinanceAccount,
 *   trades: Trade[],
 *   prices: Price[],
 * }} props
 */
export default function FinanceHoldings({ account, trades, prices, write, refuse, isSaving, todayKey }) {
  const [direction, setDirection] = useState(/** @type {Trade['direction']} */ ('buy'));
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(todayKey);
  const [quote, setQuote] = useState('');
  const [quoteDate, setQuoteDate] = useState(todayKey);
  const [editingId, setEditingId] = useState(/** @type {string | null} */ (null));

  /** @param {import('react').FormEvent} event */
  async function recordTrade(event) {
    event.preventDefault();
    const fields = readTrade({ units, price, fee });
    if (typeof fields === 'string') return refuse(fields);
    const saved = await write(accountUrl(account.id) + '/trades', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ ...fields, direction, date }),
    });
    if (saved) {
      setUnits('');
      setPrice('');
      setFee('');
    }
  }

  /** @param {import('react').FormEvent} event */
  async function recordPrice(event) {
    event.preventDefault();
    const parsed = parseMoney(quote);
    if (parsed === null) return refuse('Enter the price per unit like 104.50');
    const saved = await write(accountUrl(account.id) + '/prices', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ price: parsed, date: quoteDate }),
    });
    if (saved) setQuote('');
  }

  /** @param {string} url @param {Record<string, unknown>} body */
  async function correct(url, body) {
    if (await write(url, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(body) })) setEditingId(null);
  }

  /** @param {string} url @param {string} what */
  async function remove(url, what) {
    if (!window.confirm('Delete ' + what + '?')) return;
    await write(url, { method: 'DELETE' });
  }

  /**
   * Edit and Delete on a trade's or a price's row.
   *
   * @param {string} id @param {string} url @param {string} what as the confirmation names it
   */
  const rowActions = (id, url, what) => (
    <td className="finance-row-actions">
      <button type="button" className="btn-ghost" disabled={isSaving} onClick={() => setEditingId(id)}>
        Edit
      </button>
      <button type="button" className="btn-ghost" disabled={isSaving} onClick={() => remove(url, what)}>
        Delete
      </button>
    </td>
  );

  return (
    <>
      <form onSubmit={recordTrade}>
        <div className="segmented finance-direction" role="group" aria-label="Direction">
          {TRADE_DIRECTIONS.map((choice) => (
            <button
              key={choice}
              type="button"
              className={'seg' + (direction === choice ? ' is-on' : '')}
              aria-pressed={direction === choice}
              onClick={() => setDirection(/** @type {Trade['direction']} */ (choice))}
            >
              {choice === 'buy' ? 'Buy' : 'Sell'}
            </button>
          ))}
        </div>
        <div className="finance-entry">
          <div className="field">
            <label className="caption" htmlFor="f-units">Units</label>
            <input id="f-units" className="input num" inputMode="decimal" placeholder="0" value={units} onChange={(event) => setUnits(event.target.value)} />
          </div>
          <div className="field">
            <label className="caption" htmlFor="f-price">Price per unit</label>
            <input id="f-price" className="input num" inputMode="decimal" placeholder="0.00" value={price} onChange={(event) => setPrice(event.target.value)} />
          </div>
          <div className="field">
            <label className="caption" htmlFor="f-fee">Fee</label>
            <input id="f-fee" className="input num" inputMode="decimal" placeholder="0.00" value={fee} onChange={(event) => setFee(event.target.value)} />
          </div>
        </div>
        <div className="finance-entry">
          <div className="field">
            <label className="caption" htmlFor="f-trade-date">On</label>
            <input id="f-trade-date" type="date" className="input" value={date} max={todayKey} onChange={(event) => setDate(event.target.value)} />
          </div>
          <button type="submit" className="btn-primary" disabled={isSaving || units.trim() === '' || price.trim() === ''}>
            Record {direction}
          </button>
        </div>
      </form>

      <div className="divider" />
      <form className="finance-entry" onSubmit={recordPrice}>
        <div className="field">
          <label className="caption" htmlFor="f-quote">Price without a trade</label>
          <input id="f-quote" className="input num" inputMode="decimal" placeholder="0.00" value={quote} onChange={(event) => setQuote(event.target.value)} />
        </div>
        <div className="field">
          <label className="caption" htmlFor="f-quote-date">On</label>
          <input id="f-quote-date" type="date" className="input" value={quoteDate} max={todayKey} onChange={(event) => setQuoteDate(event.target.value)} />
        </div>
        <button type="submit" className="btn-ghost" disabled={isSaving || quote.trim() === ''}>
          Record price
        </button>
      </form>

      <div className="divider" />
      {trades.length === 0 ? (
        <p className="caption">No trade recorded yet, so its value is unknown.</p>
      ) : (
        <table className="finance-table">
          <thead>
            <tr>
              <th>Trade</th>
              <th />
              <th className="num">Units</th>
              <th className="num">Price</th>
              <th className="num">Fee</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) =>
              trade.id === editingId ? (
                <TradeEditor
                  key={trade.id}
                  trade={trade}
                  todayKey={todayKey}
                  isSaving={isSaving}
                  onCancel={() => setEditingId(null)}
                  onRefuse={refuse}
                  onSave={(body) => correct(tradeUrl(trade.id), body)}
                />
              ) : (
                <tr key={trade.id}>
                  <td className="num finance-date">{shortDate(trade.date, todayKey)}</td>
                  <td className="caption">{trade.direction}</td>
                  <td className="num">{formatUnits(trade.units)}</td>
                  <td className="num">{formatMoney(trade.price, { cents: true })}</td>
                  <td className="num">{trade.fee === 0 ? '' : formatMoney(trade.fee, { cents: true })}</td>
                  {rowActions(trade.id, tradeUrl(trade.id), 'the ' + trade.direction + ' of ' + shortDate(trade.date, todayKey))}
                </tr>
              )
            )}
          </tbody>
        </table>
      )}

      {prices.length > 0 && (
        <table className="finance-table finance-prices">
          <thead>
            <tr>
              <th>Price</th>
              <th className="num">Per unit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prices.map((row) =>
              row.id === editingId ? (
                <PriceEditor
                  key={row.id}
                  price={row}
                  todayKey={todayKey}
                  isSaving={isSaving}
                  onCancel={() => setEditingId(null)}
                  onSave={(body) => correct(priceUrl(row.id), body)}
                />
              ) : (
                <tr key={row.id}>
                  <td className="num finance-date">{shortDate(row.date, todayKey)}</td>
                  <td className="num">{formatMoney(row.price, { cents: true })}</td>
                  {rowActions(row.id, priceUrl(row.id), 'the price of ' + shortDate(row.date, todayKey))}
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
 * The typed units, price and fee of a trade in the units the store takes,
 * or why they are not.
 *
 * @param {{ units: string, price: string, fee: string }} typed
 * @returns {{ units: number, price: number, fee: number } | string}
 */
function readTrade(typed) {
  const units = parseUnits(typed.units);
  const price = parseMoney(typed.price);
  const fee = typed.fee.trim() === '' ? 0 : parseMoney(typed.fee);
  if (units === null) return 'Enter the units like 10.5, to at most eight decimals';
  if (price === null) return 'Enter the price per unit like 104.50';
  if (fee === null) return 'Enter the fee like 1.50, or leave it empty';
  return { units, price, fee };
}

/**
 * A trade's row while it is being corrected: every field in place, saved
 * together.
 *
 * @param {{
 *   trade: Trade,
 *   todayKey: string,
 *   isSaving: boolean,
 *   onSave: (body: Record<string, unknown>) => void,
 *   onRefuse: (message: string) => void,
 *   onCancel: () => void,
 * }} props
 */
function TradeEditor({ trade, todayKey, isSaving, onSave, onRefuse, onCancel }) {
  const [date, setDate] = useState(trade.date);
  const [direction, setDirection] = useState(trade.direction);
  const [units, setUnits] = useState(formatUnits(trade.units));
  const [price, setPrice] = useState(formatMoney(trade.price, { cents: true }));
  const [fee, setFee] = useState(trade.fee === 0 ? '' : formatMoney(trade.fee, { cents: true }));

  function save() {
    const fields = readTrade({ units, price, fee });
    if (typeof fields === 'string') return onRefuse(fields);
    onSave({ ...fields, date, direction });
  }

  return (
    <tr className="finance-editing">
      <td>
        <input aria-label="Date" type="date" className="input" value={date} max={todayKey} onChange={(event) => setDate(event.target.value)} />
      </td>
      <td>
        <select aria-label="Direction" className="input" value={direction} onChange={(event) => setDirection(/** @type {Trade['direction']} */ (event.target.value))}>
          {TRADE_DIRECTIONS.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input aria-label="Units" className="input num" inputMode="decimal" value={units} onChange={(event) => setUnits(event.target.value)} />
      </td>
      <td>
        <input aria-label="Price per unit" className="input num" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
      </td>
      <td>
        <input aria-label="Fee" className="input num" inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} />
      </td>
      <td className="finance-row-actions">
        <button type="button" className="btn-primary" disabled={isSaving} onClick={save}>
          Save
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

/**
 * A price's row while it is being corrected.
 *
 * @param {{
 *   price: Price,
 *   todayKey: string,
 *   isSaving: boolean,
 *   onSave: (body: { price: number, date: string }) => void,
 *   onCancel: () => void,
 * }} props
 */
function PriceEditor({ price, todayKey, isSaving, onSave, onCancel }) {
  const [date, setDate] = useState(price.date);
  const [amount, setAmount] = useState(formatMoney(price.price, { cents: true }));
  const parsed = parseMoney(amount);

  return (
    <tr className="finance-editing">
      <td>
        <input aria-label="Date" type="date" className="input" value={date} max={todayKey} onChange={(event) => setDate(event.target.value)} />
      </td>
      <td>
        <input aria-label="Price per unit" className="input num" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </td>
      <td className="finance-row-actions">
        <button
          type="button"
          className="btn-primary"
          disabled={isSaving || parsed === null}
          onClick={() => parsed !== null && onSave({ price: parsed, date })}
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
function tradeUrl(id) {
  return '/api/trades/' + encodeURIComponent(id);
}

/** @param {string} id */
function priceUrl(id) {
  return '/api/prices/' + encodeURIComponent(id);
}
