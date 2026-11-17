import Link from 'next/link';

import { changeClass, financesHref, KIND_LABELS } from '@/components/finance.js';
import FinanceSyncLine from '@/components/FinanceSyncLine.js';
import FinanceWorthChart from '@/components/FinanceWorthChart.js';
import { formatEuro, formatMoney, formatMoneyChange, shortDate } from '@/components/format.js';
import { allocation } from '@/lib/domain/derive/finance.js';
import { limits } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/derive/finance.js').AccountRow} AccountRow */

/**
 * The allocation bar's parts, in order. The assets are a neutral ramp of the
 * ink (docs/design/ui-rules.md: state colours are for state); a debt is
 * money owed, so it takes the danger colour.
 */
const ALLOCATION_PARTS = {
  cash: { label: 'Cash', color: 'var(--series-1)' },
  invested: { label: 'Invested', color: 'var(--series-2)' },
  otherAssets: { label: 'Other assets', color: 'var(--series-3)' },
  debt: { label: 'Debt', color: 'var(--danger)' },
};

/**
 * The Net worth card of the Finances screen (#113), from
 * lib/domain/derive/finance.js's financeOverview, top to bottom: net worth;
 * the net worth line over all tracked time (worthChart, ADR 0048) with the
 * change over that span and over 30 days and a year; the allocation bar;
 * and one row per active account with its value and the date that value
 * comes from -- so a pension typed four months ago shows its age. An account
 * with no value reads "unknown", never 0. No period selector and no Refresh:
 * values change about once a month, and nothing here is live. Each account's
 * name opens its panel (#114), beside this card. The 30-day column (#118) is
 * blank when there was no value that far back; a debt that grew is coloured
 * down.
 *
 * Accounts worth zero or unknown with nothing recorded on them lately fold
 * under "N more accounts" (quietAccounts, ADR 0048); the selected one never
 * does. Archived accounts are listed by name under the table, so one can be
 * opened again to restore it (#115).
 *
 * @param {{
 *   overview: ReturnType<typeof import('@/lib/domain/derive/finance.js').financeOverview>,
 *   chart: ReturnType<typeof import('@/lib/domain/derive/finance.js').worthChart>,
 *   accounts: { shown: AccountRow[], quiet: AccountRow[] },
 *   archived: import('@/lib/domain/types.js').FinanceAccount[],
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   staleness?: import('@/lib/domain/derive/sync-staleness.js').BrokerStaleness | null,
 *   wide?: boolean,
 * }} props `wide`: the whole row, when no account's panel sits beside it
 */
export default function FinanceBreakdown({ overview, chart, accounts, archived, todayKey, place, staleness = null, wide = false }) {
  const selectedId = place.account ?? null;
  const parts = allocation(overview).filter((part) => part.amount !== 0);
  const { line } = chart;
  const total = accounts.shown.length + accounts.quiet.length;

  return (
    <article id="card-finance-breakdown" className={'card ' + (wide ? 'span-12' : 'span-7')}>
      <div className="card-head">
        <span className="eyebrow">Net worth</span>
      </div>
      <div className="card-body">
        <div className="display num finance-total">{formatEuro(overview.netWorth, { cents: true })}</div>
        <FinanceSyncLine staleness={staleness} />
        {overview.unmeasuredAccounts > 0 && (
          <p className="caption">
            {overview.unmeasuredAccounts === 1
              ? '1 account has no value yet and is not counted.'
              : overview.unmeasuredAccounts + ' accounts have no value yet and are not counted.'}
          </p>
        )}

        {line.newest === null ? (
          total > 0 && <p className="caption finance-worth-empty">No net worth to draw yet. It starts with the first balance or trade.</p>
        ) : (
          <>
            <FinanceWorthChart chart={chart} todayKey={todayKey} />
            <p className="legend finance-worth-changes">
              {line.change !== null && line.first !== null && line.first.asOf !== null && (
                <span>
                  <span className="num">{formatMoneyChange(line.change)}</span> since {shortDate(line.first.asOf, todayKey)}
                </span>
              )}
              {overview.changes.days30 !== null && (
                <span>
                  <span className="num">{formatMoneyChange(overview.changes.days30)}</span> in 30 days
                </span>
              )}
              {overview.changes.year !== null && (
                <span>
                  <span className="num">{formatMoneyChange(overview.changes.year)}</span> in a year
                </span>
              )}
            </p>
          </>
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
        {total === 0 ? (
          <p className="caption">No accounts yet. Add one under Manage, at the bottom of the screen.</p>
        ) : (
          <>
            {accounts.shown.length > 0 && <AccountTable rows={accounts.shown} selectedId={selectedId} todayKey={todayKey} place={place} />}
            {accounts.quiet.length > 0 && (
              <details className="finance-fold finance-more-accounts">
                <summary>
                  <span className="finance-fold-name">
                    {accounts.quiet.length === 1 ? '1 more account' : accounts.quiet.length + ' more accounts'}
                  </span>
                  <span className="caption"> worth zero or unknown, nothing recorded in {limits.financeQuietAccountDays} days</span>
                </summary>
                <AccountTable rows={accounts.quiet} selectedId={selectedId} todayKey={todayKey} place={place} />
              </details>
            )}
          </>
        )}
        {archived.length > 0 && (
          <p className="caption finance-archived">
            Archived:{' '}
            {archived.map((account, index) => (
              <span key={account.id}>
                {index > 0 && ', '}
                <Link href={financesHref({ ...place, account: account.id })} scroll={false} className="finance-account-link">
                  {account.name}
                </Link>
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * The accounts' table. The folded accounts are a second one with the same
 * fixed columns, so the two line up.
 *
 * @param {{
 *   rows: AccountRow[],
 *   selectedId: string | null,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function AccountTable({ rows, selectedId, todayKey, place }) {
  return (
    <div className="finance-table-scroll">
      <table className="finance-table finance-accounts-table">
        <thead>
          <tr>
            <th>Account</th>
            <th>Type</th>
            <th className="num">Value</th>
            <th className="num">30d</th>
            <th className="num">As of</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.account.id} className={row.account.id === selectedId ? 'is-selected' : undefined}>
              <td>
                <Link
                  href={financesHref({ ...place, account: row.account.id })}
                  scroll={false}
                  className="finance-account-link"
                  aria-current={row.account.id === selectedId ? 'true' : undefined}
                >
                  {row.account.name}
                </Link>
              </td>
              <td className="caption">{KIND_LABELS[row.account.kind]}</td>
              {row.value === null ? (
                <td className="num caption">unknown</td>
              ) : (
                <td className="num">{formatMoney(row.value)}</td>
              )}
              <td className={'num ' + changeClass(row.account.kind === 'liability' && row.change30d !== null ? -row.change30d : row.change30d)}>
                {row.change30d === null ? '' : formatMoneyChange(row.change30d)}
              </td>
              <td className="num caption finance-date-cell">{row.valueDate === null ? '' : shortDate(row.valueDate, todayKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
