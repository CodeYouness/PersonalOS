'use client';

import { useState } from 'react';

import { accountUrl } from '@/components/FinanceBalances.js';
import { formatMoney, formatUnits, parseMoney, parseUnits, shortDate } from '@/components/format.js';

/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').Trade} Trade */

/**
 * A holding -- an account valued by units -- in its panel (#116): a form to
 * record a buy or a sell, with its units, price per unit and fee, and the
 * trades newest first. Its value is the units held times the latest price;
 * a fee is what it cost, never what it is worth.
 *
 * @param {import('@/components/FinanceBalances.js').PanelWrites & { account: FinanceAccount, trades: Trade[] }} props
 */
export default function FinanceHoldings({ account, trades, write, refuse, isSaving, todayKey }) {
  const [direction, setDirection] = useState(/** @type {Trade['direction']} */ ('buy'));
  const [units, setUnits] = useState('');
  const [price, setPrice] = useState('');
  const [fee, setFee] = useState('');
  const [date, setDate] = useState(todayKey);

  /** @param {import('react').FormEvent} event */
  async function recordTrade(event) {
    event.preventDefault();
    const parsedUnits = parseUnits(units);
    const parsedPrice = parseMoney(price);
    const parsedFee = fee.trim() === '' ? 0 : parseMoney(fee);
    if (parsedUnits === null) return refuse('Enter the units like 10.5, to at most eight decimals');
    if (parsedPrice === null) return refuse('Enter the price per unit like 104.50');
    if (parsedFee === null) return refuse('Enter the fee like 1.50, or leave it empty');
    const saved = await write(accountUrl(account.id) + '/trades', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ direction, units: parsedUnits, price: parsedPrice, fee: parsedFee, date }),
    });
    if (saved) {
      setUnits('');
      setPrice('');
      setFee('');
    }
  }

  return (
    <>
      <form onSubmit={recordTrade}>
        <div className="segmented finance-direction" role="group" aria-label="Direction">
          {/** @type {const} */ (['buy', 'sell']).map((choice) => (
            <button
              key={choice}
              type="button"
              className={'seg' + (direction === choice ? ' is-on' : '')}
              aria-pressed={direction === choice}
              onClick={() => setDirection(choice)}
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
      {trades.length === 0 ? (
        <p className="caption">No trade recorded yet, so its value is unknown.</p>
      ) : (
        <table className="finance-table">
          <thead>
            <tr>
              <th>Date</th>
              <th />
              <th className="num">Units</th>
              <th className="num">Price</th>
              <th className="num">Fee</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td className="num finance-date">{shortDate(trade.date, todayKey)}</td>
                <td className="caption">{trade.direction}</td>
                <td className="num">{formatUnits(trade.units)}</td>
                <td className="num">{formatMoney(trade.price, { cents: true })}</td>
                <td className="num">{trade.fee === 0 ? '' : formatMoney(trade.fee, { cents: true })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
