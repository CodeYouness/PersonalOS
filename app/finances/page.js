import FinanceAccountDetail, { FinanceAccountEmpty } from '@/components/FinanceAccountDetail.js';
import FinanceBreakdown from '@/components/FinanceBreakdown.js';
import FinanceCategories from '@/components/FinanceCategories.js';
import FinanceFlows from '@/components/FinanceFlows.js';
import { inLine, UNCATEGORISED } from '@/components/finance.js';
import FinanceHistory from '@/components/FinanceHistory.js';
import FinanceTransactionDetail, { FinanceMovementForm } from '@/components/FinanceTransactionDetail.js';
import FinanceTransactions from '@/components/FinanceTransactions.js';
import { isMonthKey, monthOf, monthRange, today } from '@/lib/domain/dates.js';
import { financeOverview, flowMonths, monthFlows, savingsRate, yearFlows } from '@/lib/domain/derive/finance.js';
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
 * moved. Reads the saved accounts, balances, trades, prices and transactions
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
 * account panel (#118), the Categories card (#136) under the movement one.
 *
 * `?category=<id>` (or `uncategorised`) selects a line of the Income &
 * spending section (#137) and lists that month's transactions in it; one
 * that no longer exists selects nothing. The month is one the section
 * offers -- from the first transaction to today's -- and today's otherwise.
 *
 * @param {{ searchParams: Promise<{ account?: string | string[], month?: string | string[], transaction?: string | string[], category?: string | string[] }> }} props
 */
export default async function FinancesScreen({ searchParams }) {
  const { account: accountParam, month: monthParam, transaction: transactionParam, category: categoryParam } = await searchParams;
  const todayKey = today();
  const [accounts, observations, trades, prices, selected, profile, transactions, selectedTransaction] = await Promise.all([
    getAccounts(),
    getObservations({}),
    getTrades(),
    getPrices(),
    typeof accountParam === 'string' ? getAccount(accountParam) : null,
    getProfile(),
    getTransactions(),
    typeof transactionParam === 'string' ? getTransaction(transactionParam) : null,
  ]);
  const overview = financeOverview({ accounts, observations, trades, prices, transactions }, todayKey);
  const categories = profile.financeCategories;
  const months = flowMonths(transactions, todayKey);
  const month = isMonthKey(monthParam) && months.includes(/** @type {string} */ (monthParam)) ? /** @type {string} */ (monthParam) : monthOf(todayKey);
  const category =
    categoryParam === UNCATEGORISED || categories.some((row) => row.id === categoryParam) ? /** @type {string} */ (categoryParam) : null;
  const { from, to } = monthRange(month);
  const monthTransactions = transactions.filter(
    (transaction) => transaction.date >= from && transaction.date <= to && (category === null || inLine(transaction, category, categories))
  );
  const flows = monthFlows(transactions, categories, month);
  const lineName = category === null ? null : category === UNCATEGORISED ? 'Uncategorised' : (categories.find((row) => row.id === category)?.name ?? null);
  /** @type {<T extends { accountId: string, date: string }>(rows: T[]) => T[]} */
  const ofSelected = (rows) =>
    selected === null
      ? []
      : rows.filter((row) => row.accountId === selected.id).sort((a, b) => b.date.localeCompare(a.date));
  /** @type {import('@/components/finance.js').FinancesPlace} */
  const place = { account: selected?.id ?? null, month, category, transaction: selectedTransaction?.id ?? null };

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
        <div className="finance-side span-7">
          <FinanceFlows
            key={month}
            flows={flows}
            monthRate={savingsRate(flows)}
            yearRate={savingsRate(yearFlows(transactions, categories, month))}
            months={months}
            place={place}
          />
          <FinanceTransactions
            transactions={monthTransactions}
            accounts={accounts}
            categories={categories}
            lineName={lineName}
            todayKey={todayKey}
            place={place}
          />
        </div>
        <div className="finance-side span-5">
          {selectedTransaction === null ? (
            <FinanceMovementForm accounts={accounts} categories={categories} todayKey={todayKey} place={place} />
          ) : (
            <FinanceTransactionDetail
              key={selectedTransaction.id}
              transaction={selectedTransaction}
              accounts={accounts}
              categories={categories}
              place={place}
            />
          )}
          <FinanceCategories categories={categories} />
        </div>
      </div>
    </section>
  );
}
