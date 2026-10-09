import { formatMoney, formatMoneyChange } from '@/components/format.js';

/**
 * The Finances screen's History card (#118): one row per month, month-end
 * net worth and its change from the month before, newest first -- from
 * financeOverview's history, derived from the balances, trades and prices
 * rather than stored (ADR 0022). No period selector. It says it is empty
 * until there is something to show, so it is never mistaken for broken.
 *
 * @param {{ history: import('@/lib/domain/derive/finance.js').HistoryRow[] }} props
 */
export default function FinanceHistory({ history }) {
  return (
    <article id="card-finance-history" className="card">
      <div className="card-head">
        <span className="eyebrow">History</span>
      </div>
      <div className="card-body">
        {history.length === 0 ? (
          <p className="caption">Nothing to show yet. The history starts with the first balance or trade.</p>
        ) : (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Net worth</th>
                <th className="num">Change</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.month}>
                  <td>{monthLabel(row.month)}</td>
                  <td className="num">{formatMoney(row.netWorth)}</td>
                  <td className={'num ' + changeClass(row.change)}>
                    {row.change === null ? '' : formatMoneyChange(row.change)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </article>
  );
}

/**
 * Up, down or flat for a change in what you are worth. For a debt the
 * caller flips it: owing more is down.
 *
 * @param {number | null} change
 * @returns {string}
 */
export function changeClass(change) {
  if (change === null || change === 0) return 'flat';
  return change > 0 ? 'up' : 'down';
}

/** @param {string} month YYYY-MM, as "Jan 2026" */
function monthLabel(month) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
