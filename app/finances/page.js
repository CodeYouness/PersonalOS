import FinanceAccountDetail, { FinanceAccountEmpty } from '@/components/FinanceAccountDetail.js';
import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import { today } from '@/lib/domain/dates.js';
import { financeOverview } from '@/lib/domain/derive/finance.js';
import { getAccount, getAccounts, getObservations, getTrades } from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Finances screen: "where is the money" (#111). Reads the saved accounts
 * and balances once per request and renders them through the finance
 * overview -- the same derivation the Pulse card will read. Loading it never
 * calls the model or an integration (rule 3).
 *
 * `?account=<id>` selects an account and opens its panel (#114), by id so a
 * capture landing never moves the selection. An id that no longer exists
 * selects nothing; with nothing selected, the panel adds an account.
 *
 * @param {{ searchParams: Promise<{ account?: string | string[] }> }} props
 */
export default async function FinancesScreen({ searchParams }) {
  const { account: accountParam } = await searchParams;
  const todayKey = today();
  const [accounts, observations, trades, selected] = await Promise.all([
    getAccounts(),
    getObservations({}),
    getTrades(),
    typeof accountParam === 'string' ? getAccount(accountParam) : null,
  ]);
  const overview = financeOverview({ accounts, observations, trades }, todayKey);
  /** @type {<T extends { accountId: string, date: string }>(rows: T[]) => T[]} */
  const ofSelected = (rows) =>
    selected === null
      ? []
      : rows.filter((row) => row.accountId === selected.id).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section id="screen-finances" className="screen is-active">
      <div className="screen-grid">
        <FinanceBreakdown
          overview={overview}
          archived={accounts.filter((account) => account.archivedOn !== null)}
          todayKey={todayKey}
          selectedId={selected?.id ?? null}
        />
        {selected === null ? (
          <FinanceAccountEmpty />
        ) : (
          <FinanceAccountDetail
            key={selected.id}
            account={selected}
            balances={ofSelected(observations)}
            trades={ofSelected(trades)}
            todayKey={todayKey}
          />
        )}
      </div>
    </section>
  );
}
