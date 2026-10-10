import Link from 'next/link';

import { financesHref, transferEnds } from '@/components/finance.js';
import { formatMoney, monthLabel, shortDate } from '@/components/format.js';
import { monthOf, shiftMonth } from '@/lib/domain/dates.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */
/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceCategory} FinanceCategory */

/**
 * The month's transactions on the Finances screen (#134), newest first. The
 * month is in the address, `?month=YYYY-MM`, so a reload keeps it; the
 * arrows step one month back or forward, never past today's. Each row opens
 * its panel by id (`?transaction=<id>`).
 *
 * A transfer reads "from → to" and has no category; a not-counted movement
 * says so. A movement's amount is signed from its account's side, the way
 * it is stored -- negative when money left; a transfer shows the amount
 * moved.
 *
 * @param {{
 *   transactions: Transaction[],
 *   accounts: FinanceAccount[],
 *   categories: FinanceCategory[],
 *   month: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTransactions({ transactions, accounts, categories, month, todayKey, place }) {
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? 'an account that no longer exists';
  /** @param {string | null} id */
  const categoryName = (id) => categories.find((category) => category.id === id)?.name ?? null;

  return (
    <article id="card-finance-transactions" className="card span-7">
      <div className="card-head">
        <span className="eyebrow">Transactions</span>
        <nav className="finance-month" aria-label="Month">
          <Link
            className="btn-ghost"
            scroll={false}
            aria-label="Previous month"
            href={financesHref({ ...place, month: shiftMonth(month, -1), transaction: null })}
          >
            ‹
          </Link>
          <span className="finance-month-label">{monthLabel(month)}</span>
          {month < monthOf(todayKey) && (
            <Link
              className="btn-ghost"
              scroll={false}
              aria-label="Next month"
              href={financesHref({ ...place, month: shiftMonth(month, 1), transaction: null })}
            >
              ›
            </Link>
          )}
        </nav>
      </div>
      <div className="card-body">
        {transactions.length === 0 ? (
          <p className="caption">Nothing recorded in {monthLabel(month)}.</p>
        ) : (
          <table className="finance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Account</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const selected = transaction.id === place.transaction;
                const transfer = transaction.counterAccountId !== null;
                const category = categoryName(transaction.categoryId);
                return (
                  <tr key={transaction.id} className={selected ? 'is-selected' : undefined}>
                    <td className="num finance-date">{shortDate(transaction.date, todayKey)}</td>
                    <td>
                      <Link
                        href={financesHref({ ...place, transaction: transaction.id })}
                        scroll={false}
                        className="finance-account-link"
                        aria-current={selected ? 'true' : undefined}
                      >
                        {transaction.description === '' ? '(no description)' : transaction.description}
                      </Link>
                      {transaction.notCounted && <span className="caption"> · not counted</span>}
                    </td>
                    <td className={transfer || category === null ? 'caption' : undefined}>
                      {transfer ? 'Transfer' : category ?? 'Uncategorised'}
                    </td>
                    <td className="caption">
                      {transfer
                        ? accountName(transferEnds(transaction).from) + ' → ' + accountName(transferEnds(transaction).to)
                        : accountName(transaction.accountId)}
                    </td>
                    <td className="num">{formatMoney(transfer ? Math.abs(transaction.amount) : transaction.amount, { cents: true })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </article>
  );
}
