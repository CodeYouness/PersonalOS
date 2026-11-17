import Link from 'next/link';

import { financesHref } from '@/components/finance.js';
import { formatMoney, formatMoneyChange, formatReturn, formatUnits, shortDate } from '@/components/format.js';
import { monthOf, yearOf } from '@/lib/domain/dates.js';

/** @typedef {import('@/lib/domain/derive/investments.js').InvestmentReturns} InvestmentReturns */
/** @typedef {import('@/lib/domain/derive/investments.js').HoldingReturn} HoldingReturn */

/**
 * What the holdings earned, on the Finances screen (ADR 0051), from
 * lib/domain/derive/investments.js's investmentReturns -- nothing is
 * computed here. Four pieces, each where its reader already looks:
 *
 * - `InvestedNote`, one line under the Invested section's head in the Net
 *   worth card's table: the cost, the profit or loss and its share, and the
 *   change since the price day before the newest;
 * - `GainMark`, a holding row's signed share after its name;
 * - `FinanceInvestments`, the fold under the accounts table that lists every
 *   holding with its cost, value and profit or loss, and the totals;
 * - `HoldingPosition`, the top of a holding's panel: all of it, for one.
 *
 * A profit takes the up tone and a loss the down tone, and the sign is
 * always printed: the colour is never the only mark. An unknown is said,
 * never written as 0.
 */

/**
 * The up or down tone of a signed amount; none for nothing.
 *
 * @param {number} amount
 * @returns {string}
 */
function tone(amount) {
  return amount > 0 ? ' up' : amount < 0 ? ' down' : '';
}

/**
 * A signed amount, toned.
 *
 * @param {{ amount: number, cents?: boolean }} props
 */
function Signed({ amount, cents = false }) {
  return <span className={'num' + tone(amount)}>{formatMoneyChange(amount, { cents })}</span>;
}

/**
 * A signed share, toned.
 *
 * @param {{ ratio: number }} props
 */
function Share({ ratio }) {
  return <span className={'num' + tone(ratio)}>{formatReturn(ratio)}</span>;
}

/**
 * The Invested section's line (ADR 0051): "Cost 2,652 · P/L + 169 (+6.4%) ·
 * − 55 since 10 Apr". Nothing when no holding's gain is known: the section's
 * subtotal is all there is to say. Holdings only: an investment valued by
 * balance has no trades to cost, and with one in the section the line says
 * "Holdings cost".
 *
 * @param {{ returns: InvestmentReturns, todayKey: string }} props
 */
export function InvestedNote({ returns, todayKey }) {
  const { totals, since } = returns;
  if (totals.cost === null || totals.gain === null) return null;
  return (
    <span className="finance-invested-note">
      <span>
        {/* With an investment valued by balance in the section, the cost is not the subtotal's. */}
        {returns.byBalance > 0 ? 'Holdings cost ' : 'Cost '}
        <span className="num">{formatMoney(totals.cost)}</span>
      </span>
      <span>
        P/L <Signed amount={totals.gain} />
        {totals.gainRatio !== null && (
          <>
            {' ('}
            <Share ratio={totals.gainRatio} />)
          </>
        )}
      </span>
      {totals.change !== null && since !== null && (
        <span>
          <Signed amount={totals.change} /> since {shortDate(since, todayKey)}
        </span>
      )}
    </span>
  );
}

/**
 * A holding row's mark after its name: its profit or loss as a share of
 * its cost, "+16.3%". Nothing when unknown.
 *
 * @param {{ row: HoldingReturn | undefined }} props
 */
export function GainMark({ row }) {
  if (row === undefined || row.gainRatio === null) return null;
  return (
    <span className={'caption num finance-gain' + tone(row.gainRatio)} title="Profit or loss on its cost">
      {formatReturn(row.gainRatio)}
    </span>
  );
}

/**
 * The Investments fold (ADR 0051): under the accounts table of the Net worth
 * card, folded to one line until opened, every open holding with its cost,
 * value and profit or loss, and the totals; then what the totals do not
 * show -- after tax, realised by sells, the change since the price day
 * before the newest, the year to date -- and what was left out. The table
 * scrolls inside its box on a phone. A holding's name opens its panel.
 *
 * @param {{
 *   returns: InvestmentReturns,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   selectedId: string | null,
 * }} props
 */
export default function FinanceInvestments({ returns, todayKey, place, selectedId }) {
  const { holdings, totals, unknown, archived, since } = returns;
  if (holdings.length === 0 && archived.length === 0) return null;
  const count = holdings.length === 1 ? '1 holding' : holdings.length + ' holdings';
  const soldWith = archived.filter((row) => row.realised !== null && row.realised !== 0).length;
  const year = totals.ytdFrom === null ? null : yearOf(monthOf(totals.ytdFrom));

  return (
    <details className="finance-fold finance-investments">
      <summary>
        <span className="finance-fold-name">Investments</span>
        <span className="caption"> cost, value and profit of {count}</span>
      </summary>
      {holdings.length > 0 && (
        <div className="finance-table-scroll">
          <table className="finance-table finance-investments-table">
            <thead>
              <tr>
                <th>Holding</th>
                <th className="num">Cost</th>
                <th className="num">Value</th>
                <th className="num">P/L</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((row) => (
                <tr key={row.account.id} className={row.account.id === selectedId ? 'is-selected' : undefined}>
                  <td>
                    <span className="finance-cut">
                      <Link
                        href={financesHref({ ...place, account: row.account.id })}
                        scroll={false}
                        className="finance-account-link finance-cut-text"
                        title={row.account.name}
                      >
                        {row.account.name}
                      </Link>
                    </span>
                  </td>
                  {row.gain === null ? (
                    <td className="num caption" colSpan={4}>
                      unknown
                    </td>
                  ) : (
                    <>
                      <td className="num">{formatMoney(/** @type {number} */ (row.cost))}</td>
                      <td className="num">{formatMoney(/** @type {number} */ (row.value))}</td>
                      <td className="num">
                        <Signed amount={row.gain} />
                      </td>
                      <td className="num">{row.gainRatio === null ? '' : <Share ratio={row.gainRatio} />}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            {totals.cost !== null && totals.value !== null && totals.gain !== null && (
              <tfoot>
                <tr className="finance-investments-total">
                  <th scope="row">Total</th>
                  <td className="num">{formatMoney(totals.cost)}</td>
                  <td className="num">{formatMoney(totals.value)}</td>
                  <td className="num">
                    <Signed amount={totals.gain} />
                  </td>
                  <td className="num">{totals.gainRatio === null ? '' : <Share ratio={totals.gainRatio} />}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      <ul className="finance-investments-lines">
        {totals.afterTax !== null && (
          <li>
            After {returns.taxPercent}% tax <Signed amount={totals.afterTax} />
            {totals.afterTaxRatio !== null && (
              <>
                {' ('}
                <Share ratio={totals.afterTaxRatio} />)
              </>
            )}
            <span className="caption"> each gain taxed on its own; a loss is not reduced</span>
          </li>
        )}
        {totals.realised !== null && (
          <li>
            Realised by sells <Signed amount={totals.realised} />
            <span className="caption">
              {' '}
              not in the P/L above{soldWith > 0 && ', ' + soldWith + (soldWith === 1 ? ' holding sold completely included' : ' holdings sold completely included')}
            </span>
          </li>
        )}
        {totals.change !== null && since !== null && (
          <li>
            Since {shortDate(since, todayKey)} <Signed amount={totals.change} />
            {totals.changeRatio !== null && (
              <>
                {' ('}
                <Share ratio={totals.changeRatio} />)
              </>
            )}
            <span className="caption">
              {' '}
              the last price day before {shortDate(/** @type {string} */ (returns.latest), todayKey)}
              {returns.changeLeftOut > 0 && ', ' + returns.changeLeftOut + ' bought since left out'}
            </span>
          </li>
        )}
        {totals.ytd !== null && year !== null && (
          <li>
            {year} to date <Signed amount={totals.ytd} />
            {totals.ytdRatio !== null && (
              <>
                {' ('}
                <Share ratio={totals.ytdRatio} />)
              </>
            )}
            <span className="caption">
              {' '}
              since {shortDate(/** @type {string} */ (totals.ytdFrom), todayKey)}, money put in or taken out not counted
            </span>
          </li>
        )}
        {unknown.length > 0 && (
          <li className="caption">
            Left out, value or cost unknown: {unknown.map((row) => row.account.name).join(', ')}.
          </li>
        )}
        {returns.byBalance > 0 && (
          <li className="caption">
            {returns.byBalance === 1
              ? '1 investment valued by its balance has no trades to cost and is not in these figures.'
              : returns.byBalance + ' investments valued by their balance have no trades to cost and are not in these figures.'}
          </li>
        )}
      </ul>
    </details>
  );
}

/**
 * The top of a holding's panel (ADR 0051): what its units cost and are
 * worth, its profit or loss gross and after tax, what its sells realised,
 * its change since the price day before the newest and its year to date --
 * to the cent. A holding archived keeps only what its sells realised. Each
 * unknown says so.
 *
 * @param {{
 *   row: HoldingReturn,
 *   since: string | null,
 *   taxPercent: number,
 *   todayKey: string,
 * }} props
 */
export function HoldingPosition({ row, since, taxPercent, todayKey }) {
  const open = row.account.archivedOn === null;
  /** @param {number} amount @param {number | null} ratio */
  const signed = (amount, ratio) => (
    <>
      <Signed amount={amount} cents />
      {ratio !== null && (
        <>
          {' · '}
          <Share ratio={ratio} />
        </>
      )}
    </>
  );

  return (
    <table className="finance-table finance-position">
      <tbody>
        {open && (
          <>
            <tr>
              <th scope="row">Units held</th>
              <td className="num">{formatUnits(row.units)}</td>
            </tr>
            <tr>
              <th scope="row">Cost</th>
              <td className="num">
                {row.cost === null ? (
                  <span className="caption">unknown</span>
                ) : (
                  <>
                    {formatMoney(row.cost, { cents: true })}
                    {row.averagePrice !== null && (
                      <span className="caption"> {formatMoney(row.averagePrice, { cents: true })} a unit</span>
                    )}
                  </>
                )}
              </td>
            </tr>
            <tr>
              <th scope="row">Value</th>
              <td className="num">
                {row.value === null ? <span className="caption">unknown</span> : formatMoney(row.value, { cents: true })}
              </td>
            </tr>
            <tr>
              <th scope="row">Profit or loss</th>
              <td className="num">{row.gain === null ? <span className="caption">unknown</span> : signed(row.gain, row.gainRatio)}</td>
            </tr>
            {row.afterTax !== null && (
              <tr>
                <th scope="row">After {taxPercent}% tax</th>
                <td className="num">{signed(row.afterTax, row.afterTaxRatio)}</td>
              </tr>
            )}
          </>
        )}
        <tr>
          <th scope="row">Realised by sells</th>
          <td className="num">{row.realised === null ? <span className="caption">unknown</span> : <Signed amount={row.realised} cents />}</td>
        </tr>
        {open && row.change !== null && since !== null && (
          <tr>
            <th scope="row">Since {shortDate(since, todayKey)}</th>
            <td className="num">{signed(row.change, row.changeRatio)}</td>
          </tr>
        )}
        {open && row.ytd !== null && row.ytdFrom !== null && (
          <tr>
            <th scope="row">
              {yearOf(monthOf(row.ytdFrom))} to date
              {row.ytdFrom !== yearOf(monthOf(row.ytdFrom)) + '-01-01' && (
                <span className="caption"> from {shortDate(row.ytdFrom, todayKey)}</span>
              )}
            </th>
            <td className="num">{signed(row.ytd, row.ytdRatio)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
