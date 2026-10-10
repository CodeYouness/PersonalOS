import Link from 'next/link';

import { financesHref, transferEnds } from '@/components/finance.js';
import { formatMoney, monthLabel, shortDate } from '@/components/format.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */
/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceCategory} FinanceCategory */

/**
 * The month's transactions on the Finances screen (#134), newest first --
 * the month picked in the Income & spending section above, and with a line
 * selected there (#137), only the transactions in it, with a way back to
 * all of them. Each row opens its panel by id (`?transaction=<id>`).
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
 *   lineName: string | null,
 *   month: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTransactions({ transactions, accounts, categories, lineName, month, todayKey, place }) {
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? 'an account that no longer exists';
  /** @param {string | null} id */
  const categoryName = (id) => categories.find((category) => category.id === id)?.name ?? null;

  return (
    <article id="card-finance-transactions" className="card">
      <div className="card-head">
        <span className="eyebrow">
          Transactions{lineName === null ? '' : ' · ' + lineName}
        </span>
        {lineName !== null && (
          <Link className="btn-ghost" scroll={false} href={financesHref({ ...place, category: null, transaction: null })}>
            Show all
          </Link>
        )}
      </div>
      <div className="card-body">
        {transactions.length === 0 ? (
          <p className="caption">
            Nothing recorded {lineName === null ? '' : 'in ' + lineName + ' '}in {monthLabel(month)}.
          </p>
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
