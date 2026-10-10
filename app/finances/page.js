import FinanceAccountDetail, { FinanceAccountEmpty } from '@/components/FinanceAccountDetail.js';
import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import FinanceHistory from '@/components/FinanceHistory.js';
import FinanceTransactionDetail, { FinanceMovementForm } from '@/components/FinanceTransactionPanel.js';
import FinanceTransactions from '@/components/FinanceTransactions.js';
import { isMonthKey, monthRange, today } from '@/lib/domain/dates.js';
import { financeOverview } from '@/lib/domain/derive/finance.js';
import {
  getAccount,
  getAccounts,
  getObservations,
  getPrices,
  getProfile,
  getTrades,
  getTransaction,
  getTransactions,
} from '@/lib/store.js';

export const dynamic = 'force-dynamic';

/**
 * The Finances screen: "where is the money" (#111), and since #134 how it
 * moved. Reads the saved accounts, balances and the month's transactions
 * once per request and renders them through the finance overview -- the
 * same derivation the Pulse card reads. Loading it never calls the model or
 * an integration (rule 3).
 *
 * The address holds where you are, each by id or key so a capture landing
 * never moves it: `?account=<id>` opens an account's panel (#114);
 * `?month=YYYY-MM` is the month whose transactions are listed, today's when
 * absent or not a month; `?transaction=<id>` opens a transaction's panel
 * (#134). An id that no longer exists selects nothing. With no account
 * selected, the panel adds one; with no transaction selected, the panel
 * beside the list records a movement. The History card sits under the
 * account panel (#118).
 *
 * @param {{ searchParams: Promise<{ account?: string | string[], month?: string | string[], transaction?: string | string[] }> }} props
 */
export default async function FinancesScreen({ searchParams }) {
  const { account: accountParam, month: monthParam, transaction: transactionParam } = await searchParams;
  const todayKey = today();
  const month = isMonthKey(monthParam) ? /** @type {string} */ (monthParam) : todayKey.slice(0, 7);
  const [accounts, observations, trades, prices, selected, profile, monthTransactions, selectedTransaction] = await Promise.all([
    getAccounts(),
    getObservations({}),
    getTrades(),
    getPrices(),
    typeof accountParam === 'string' ? getAccount(accountParam) : null,
    getProfile(),
    getTransactions(monthRange(month)),
    typeof transactionParam === 'string' ? getTransaction(transactionParam) : null,
  ]);
  const overview = financeOverview({ accounts, observations, trades, prices }, todayKey);
  /** @type {<T extends { accountId: string, date: string }>(rows: T[]) => T[]} */
  const ofSelected = (rows) =>
    selected === null
      ? []
      : rows.filter((row) => row.accountId === selected.id).sort((a, b) => b.date.localeCompare(a.date));
  /** @type {import('@/components/finance.js').FinancesPlace} */
  const place = { account: selected?.id ?? null, month, transaction: selectedTransaction?.id ?? null };
  const categories = profile.financeCategories;

  return (
    <section id="screen-finances" className="screen is-active">
      <div className="screen-grid">
        <FinanceBreakdown
          overview={overview}
          archived={accounts.filter((account) => account.archivedOn !== null)}
          todayKey={todayKey}
          place={place}
        />
        <div className="finance-side span-5">
          {selected === null ? (
            <FinanceAccountEmpty place={place} />
          ) : (
            <FinanceAccountDetail
              key={selected.id}
              account={selected}
              balances={ofSelected(observations)}
              trades={ofSelected(trades)}
              prices={ofSelected(prices)}
              todayKey={todayKey}
              place={place}
            />
          )}
          <FinanceHistory history={overview.history} />
        </div>
        <FinanceTransactions
          transactions={monthTransactions.sort((a, b) => b.date.localeCompare(a.date))}
          accounts={accounts}
          categories={categories}
          month={month}
          todayKey={todayKey}
          place={place}
        />
        <div className="finance-side span-5">
          {selectedTransaction === null ? (
            <FinanceMovementForm accounts={accounts} categories={categories} todayKey={todayKey} place={place} />
          ) : (
            <FinanceTransactionDetail
              key={selectedTransaction.id}
              transaction={selectedTransaction}
              accounts={accounts}
              categories={categories}
              todayKey={todayKey}
              place={place}
            />
          )}
        </div>
      </div>
    </section>
  );
}
