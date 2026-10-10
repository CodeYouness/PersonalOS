import Link from 'next/link';

import { financesHref } from '@/components/finance.js';
import { changeClass } from '@/components/FinanceHistory.js';
import { formatEuro, formatMoneyChange, shortDate } from '@/components/format.js';
import { today } from '@/lib/domain/dates.js';
import { financeOverview, sparkBars } from '@/lib/domain/derive/finance.js';
import { getAccounts, getObservations, getPrices, getTrades } from '@/lib/store.js';

/**
 * The Pulse card on Home (#119), in the slot the mockup reserves for Finance
 * pulse: net worth, the last twelve month-ends, and the change over 30 days
 * and over a year -- each hidden when there was no value that far back.
 * "As of" the newest balance or price it counts, never a clock time: a
 * number updated last week must not look live. No Refresh -- there is
 * nothing to refresh from (rule 3). Read-only; Open goes to Finances.
 *
 * The same derivation as the Finances screen, so both say the same thing.
 */
export default async function PulseCard() {
  const todayKey = today();
  const [accounts, observations, trades, prices] = await Promise.all([
    getAccounts(),
    getObservations({}),
    getTrades(),
    getPrices(),
  ]);
  const overview = financeOverview({ accounts, observations, trades, prices }, todayKey);
  const deltas = /** @type {const} */ ([
    ['30 days', overview.changes.days30],
    ['1 year', overview.changes.year],
  ]);

  return (
    <article id="card-finance-pulse" className="card span-4">
      <div className="card-head">
        <span className="eyebrow">Pulse</span>
        <Link className="btn-ghost" href={financesHref()}>
          Open
        </Link>
      </div>
      <div className="card-body">
        <div className="caption">Net worth</div>
        {overview.asOf === null ? (
          <p className="caption pulse-empty">Nothing recorded yet. Add an account on the Finances screen.</p>
        ) : (
          <>
            <div className="net-worth">{formatEuro(overview.netWorth)}</div>
            <div className="spark" aria-hidden="true">
              {sparkBars(overview.sparkline).map((bar, index) =>
                bar === null ? (
                  <i key={index} />
                ) : (
                  <i key={index} className={bar.fell ? 'neg' : 'pos'} style={{ height: bar.height * 100 + '%' }} />
                )
              )}
            </div>
            {deltas.map(([label, change]) =>
              change === null ? null : (
                <div key={label} className="delta-row">
                  <span className="k">{label}</span>
                  <span className={'num ' + changeClass(change)}>{formatMoneyChange(change)}</span>
                </div>
              )
            )}
            <div className="divider" />
            <p className="caption">As of {shortDate(overview.asOf, todayKey)}</p>
          </>
        )}
      </div>
    </article>
  );
}
