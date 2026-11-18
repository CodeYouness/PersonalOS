import Link from 'next/link';

import { financesHref } from '@/components/finance.js';
import FinanceInvestments, { GainMark, InvestedNote } from '@/components/FinanceInvestments.js';
import FinanceSyncLine from '@/components/FinanceSyncLine.js';
import FinanceWorthChart from '@/components/FinanceWorthChart.js';
import { formatEuro, formatMoney, formatMoneyChange, shortDate } from '@/components/format.js';
import Tip, { TipFigures } from '@/components/Tip.js';
import { accountSections, accountStaleSince, allocation } from '@/lib/domain/derive/finance.js';
import { limits } from '@/personalos.config.js';

/** @typedef {import('@/lib/domain/derive/finance.js').AccountRow} AccountRow */
/** @typedef {import('@/lib/domain/derive/finance.js').AccountSection} AccountSection */
/** @typedef {import('@/lib/domain/derive/investments.js').InvestmentReturns} InvestmentReturns */
/** @typedef {import('@/lib/domain/derive/finance.js').AllocationAccounts} AllocationAccounts */

/**
 * The allocation bar's parts, in order. The assets are a neutral ramp of the
 * ink (docs/design/ui-rules.md: state colours are for state); a debt is
 * money owed, so it takes the danger colour. The accounts table's sections
 * are named and marked the same (ADR 0049): a section is a part of the bar.
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
 * change over that span and over 30 days and a year -- each month's point
 * showing its net worth on hover, focus and a tap (ADR 0053); the allocation
 * bar, each part and its legend showing the accounts it is made of, largest
 * first (allocationAccounts, ADR 0053); and the accounts by kind
 * (accountSections, ADR 0049) -- cash, invested, other assets, debt -- each
 * section with its name and subtotal, the same
 * amount and mark as its part of the bar, a debt as what is owed. A row is
 * an account's name and value, the value always last. The table says once
 * when its newest value is from ("Last updated 17 Nov"); a row says its own
 * date only when it is stale (accountStaleSince) -- "since 2 Jan" after the
 * name -- so a pension typed four months ago still shows its age. An account
 * with no value reads "unknown", never 0. No period selector and no Refresh:
 * values change about once a month, and nothing here is live. Each account's
 * name opens its panel (#114), beside this card.
 *
 * Accounts worth zero or unknown with nothing recorded on them lately fold
 * under "N more accounts" (quietAccounts, ADR 0048), once, at the end of the
 * table, in the same sections without subtotals: they add nothing to one.
 * The selected one never folds. Archived accounts are listed by name under
 * the table, so one can be opened again to restore it (#115).
 *
 * What the holdings earned (investmentReturns, ADR 0051) stays out of the
 * table's columns: the Invested section says it in one line under its head
 * -- cost, profit or loss, the change since the last price day -- a
 * holding's row adds its signed share after its name, and the Investments
 * fold under the table lists every holding with its cost, value and profit,
 * and the totals.
 *
 * @param {{
 *   overview: ReturnType<typeof import('@/lib/domain/derive/finance.js').financeOverview>,
 *   chart: ReturnType<typeof import('@/lib/domain/derive/finance.js').worthChart>,
 *   parts?: AllocationAccounts[],
 *   accounts: { shown: AccountRow[], quiet: AccountRow[] },
 *   archived: import('@/lib/domain/types.js').FinanceAccount[],
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   staleness?: import('@/lib/domain/derive/sync-staleness.js').BrokerStaleness | null,
 *   investments?: InvestmentReturns | null,
 *   wide?: boolean,
 * }} props `wide`: the whole row, when no account's panel sits beside it
 */
export default function FinanceBreakdown({ overview, chart, parts: made = [], accounts, archived, todayKey, place, staleness = null, investments = null, wide = false }) {
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
                <Tip
                  key={part.key}
                  as="i"
                  style={{ width: part.share * 100 + '%', background: ALLOCATION_PARTS[part.key].color }}
                  {...partTip(part, made.find((each) => each.part === part.key))}
                />
              ))}
            </div>
            <div className="legend">
              {parts.map((part) => (
                <Tip key={part.key} className="finance-alloc-key" {...partTip(part, made.find((each) => each.part === part.key))}>
                  <i className="dot" style={{ color: ALLOCATION_PARTS[part.key].color }} />
                  {ALLOCATION_PARTS[part.key].label} <span className="num">{formatEuro(part.amount)}</span>
                </Tip>
              ))}
            </div>
          </>
        )}

        <div className="divider" />
        {total === 0 ? (
          <p className="caption">No accounts yet. Add one under Manage, at the bottom of the screen.</p>
        ) : (
          <>
            {overview.asOf !== null && <p className="caption finance-accounts-updated">Last updated {shortDate(overview.asOf, todayKey)}</p>}
            {accounts.shown.length > 0 && (
              <AccountTable
                sections={accountSections(overview, accounts.shown)}
                selectedId={selectedId}
                todayKey={todayKey}
                place={place}
                investments={investments}
              />
            )}
            {accounts.quiet.length > 0 && (
              <details className="finance-fold finance-more-accounts">
                <summary>
                  <span className="finance-fold-name">
                    {accounts.quiet.length === 1 ? '1 more account' : accounts.quiet.length + ' more accounts'}
                  </span>
                  <span className="caption"> worth zero or unknown, nothing recorded in {limits.financeQuietAccountDays} days</span>
                </summary>
                <AccountTable
                  sections={accountSections(overview, accounts.quiet)}
                  selectedId={selectedId}
                  todayKey={todayKey}
                  place={place}
                  subtotals={false}
                  investments={investments}
                />
              </details>
            )}
            {investments !== null && (
              <FinanceInvestments returns={investments} todayKey={todayKey} place={place} selectedId={selectedId} />
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
 * What a part of the allocation bar, and its legend, say on hover, focus and
 * a tap (ADR 0053): the part and its amount, then its accounts, largest
 * first, each in whole euros as the table shows it; an account with no value
 * is left out and counted, since unknown is not zero.
 *
 * @param {{ key: keyof typeof ALLOCATION_PARTS, amount: number }} part the bar's part
 * @param {AllocationAccounts | undefined} made what it is made of
 * @returns {{ label: string, tip: import('react').ReactNode }}
 */
function partTip(part, made) {
  const head = ALLOCATION_PARTS[part.key].label + ' ' + formatEuro(part.amount);
  const accounts = made?.accounts ?? [];
  const unknown = made?.unknown ?? 0;
  const note = unknown === 0 ? null : unknown === 1 ? '1 account with no value, not counted' : unknown + ' accounts with no value, not counted';
  const label =
    head +
    (accounts.length === 0 ? '' : ': ' + accounts.map((row) => row.name + ' ' + formatMoney(row.value)).join(', ')) +
    (note === null ? '' : '. ' + note);
  return {
    label,
    tip: <TipFigures head={head} rows={accounts.map((row) => ({ label: row.name, value: formatMoney(row.value) }))} note={note} />,
  };
}

/**
 * The accounts' table, by kind: a section's head row names it, with the
 * allocation bar's mark, and gives its subtotal in the value column; then its
 * accounts. Two columns, the value last. The folded accounts are a second
 * table with the same fixed columns, so the two line up, and no subtotals.
 * The Invested section's head is followed by its one line of what the
 * holdings earned, where there are subtotals; a holding's row carries its
 * share after its name.
 *
 * @param {{
 *   sections: AccountSection[],
 *   selectedId: string | null,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   subtotals?: boolean,
 *   investments?: InvestmentReturns | null,
 * }} props
 */
function AccountTable({ sections, selectedId, todayKey, place, subtotals = true, investments = null }) {
  const earned = new Map((investments?.holdings ?? []).map((row) => [row.account.id, row]));
  return (
    <div className="finance-table-scroll">
      <table className="finance-table finance-accounts-table">
        <thead>
          <tr>
            <th>Account</th>
            <th className="num">Value</th>
          </tr>
        </thead>
        {sections.map((section) => {
          const part = ALLOCATION_PARTS[section.part];
          return (
            <tbody key={section.kind}>
              <tr className="finance-section-head">
                <th scope="rowgroup">
                  <span className="finance-section-name">
                    <i className="dot" style={{ color: part.color }} />
                    {part.label}
                    {section.kind === 'liability' && <span className="caption">what you owe</span>}
                  </span>
                </th>
                {!subtotals ? (
                  <td />
                ) : section.subtotal === null ? (
                  <td className="num caption">unknown</td>
                ) : (
                  <td className="num">{formatMoney(section.subtotal)}</td>
                )}
              </tr>
              {subtotals && section.kind === 'investment' && investments !== null && investments.totals.gain !== null && (
                <tr className="finance-section-note">
                  <td colSpan={2}>
                    <InvestedNote returns={investments} todayKey={todayKey} />
                  </td>
                </tr>
              )}
              {section.rows.map((row) => {
                const staleSince = accountStaleSince(row, todayKey);
                return (
                  <tr key={row.account.id} className={row.account.id === selectedId ? 'is-selected' : undefined}>
                    <td>
                      <span className="finance-cut">
                        <Link
                          href={financesHref({ ...place, account: row.account.id })}
                          scroll={false}
                          className="finance-account-link finance-cut-text"
                          title={row.account.name}
                          aria-current={row.account.id === selectedId ? 'true' : undefined}
                        >
                          {row.account.name}
                        </Link>
                        {staleSince !== null && <span className="caption finance-stale">since {shortDate(staleSince, todayKey)}</span>}
                        <GainMark row={earned.get(row.account.id)} />
                      </span>
                    </td>
                    {row.value === null ? (
                      <td className="num caption">unknown</td>
                    ) : (
                      <td className="num">{formatMoney(row.value)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
