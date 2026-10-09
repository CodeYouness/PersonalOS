import { formatEuro, formatMoney, shortDate } from '@/components/format.js';
import { allocation } from '@/lib/domain/derive/finance.js';

/** @typedef {import('@/lib/domain/derive/finance.js').AccountRow} AccountRow */

/** How the table names a kind, as the mockup does: "invested", "debt". */
/** @type {Record<import('@/lib/domain/types.js').FinanceAccount['kind'], string>} */
export const KIND_LABELS = { cash: 'cash', investment: 'invested', asset: 'asset', liability: 'debt' };

/** The allocation bar's parts, in order, with the mockup's colours. */
const ALLOCATION_PARTS = {
  cash: { label: 'Cash', color: 'var(--success)' },
  invested: { label: 'Invested', color: 'var(--info)' },
  otherAssets: { label: 'Other assets', color: 'var(--primary)' },
  debt: { label: 'Debt', color: 'var(--danger)' },
};

/**
 * The Finances screen's breakdown (#113), from lib/domain/derive/finance.js's
 * financeOverview: net worth, the allocation bar, and one row per active
 * account with its value and the date that value comes from -- so a pension
 * typed four months ago shows its age. An account with no value reads
 * "unknown", never 0. No period selector and no Refresh: values change about
 * once a month, and nothing here is live.
 *
 * @param {{
 *   overview: ReturnType<typeof import('@/lib/domain/derive/finance.js').financeOverview>,
 *   todayKey: string,
 * }} props
 */
export default function FinanceBreakdown({ overview, todayKey }) {
  const parts = allocation(overview).filter((part) => part.amount !== 0);

  return (
    <article id="card-finance-breakdown" className="card span-7">
      <div className="card-head">
        <span className="eyebrow">Net worth</span>
      </div>
      <div className="card-body">
        <div className="display num finance-total">{formatEuro(overview.netWorth, { cents: true })}</div>
        {overview.unmeasuredAccounts > 0 && (
          <p className="caption">
            {overview.unmeasuredAccounts === 1
              ? '1 account has no value yet and is not counted.'
              : overview.unmeasuredAccounts + ' accounts have no value yet and are not counted.'}
          </p>
        )}

        {parts.length > 0 && (
          <>
            <div className="alloc">
              {parts.map((part) => (
                <i
                  key={part.key}
                  style={{ width: part.share * 100 + '%', background: ALLOCATION_PARTS[part.key].color }}
                />
              ))}
            </div>
            <div className="legend">
              {parts.map((part) => (
                <span key={part.key}>
                  <i className="dot" style={{ color: ALLOCATION_PARTS[part.key].color }} />
                  {ALLOCATION_PARTS[part.key].label} <span className="num">{formatEuro(part.amount)}</span>
                </span>
              ))}
            </div>
          </>
        )}

        <div className="divider" />
        {overview.accounts.length === 0 ? (
          <p className="caption">No accounts yet.</p>
        ) : (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th className="num">Value</th>
                <th className="num">As of</th>
              </tr>
            </thead>
            <tbody>
              {overview.accounts.map((row) => (
                <tr key={row.account.id}>
                  <td>{row.account.name}</td>
                  <td className="caption">{KIND_LABELS[row.account.kind]}</td>
                  {row.value === null ? (
                    <td className="num caption">unknown</td>
                  ) : (
                    <td className="num">{formatMoney(row.value)}</td>
                  )}
                  <td className="num caption">{row.valueDate === null ? '' : shortDate(row.valueDate, todayKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </article>
  );
}
