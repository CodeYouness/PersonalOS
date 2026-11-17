import Link from 'next/link';

import { financesHref, transferEnds } from '@/components/finance.js';
import { formatMoney, shortDate } from '@/components/format.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */
/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceCategory} FinanceCategory */

/**
 * The period's transactions on the Finances screen (#134), newest first --
 * the month, or the year, the Income & spending section above reads, and
 * with a line selected there (#137), only the transactions in it, with a
 * way back to all of them. `periodLabel` names the period when the list is
 * empty: "March 2026", "2026". Each row opens its panel by id (`?transaction=<id>`).
 *
 * With a tag selected in the By tag card (ADR 0046), only its counted
 * movements, and a switch between the period's and all of them
 * (`?span=all`), whatever the period -- a trip rarely fits one month. In a
 * year with nothing selected, the page hands only the newest movements and
 * `more`, how many it left out; the card says so and how to narrow it.
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
 *   tag: string | null,
 *   more: number,
 *   periodLabel: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTransactions({ transactions, accounts, categories, lineName, tag, more, periodLabel, todayKey, place }) {
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? 'an account that no longer exists';
  /** @param {string | null} id */
  const categoryName = (id) => categories.find((category) => category.id === id)?.name ?? null;
  const selection = tag !== null ? 'tagged ' + tag : lineName;
  const allTime = tag !== null && place.span === 'all';

  return (
    <article id="card-finance-transactions" className="card">
      <div className="card-head">
        <span className="eyebrow">
          Transactions{selection === null ? '' : ' · ' + selection}
        </span>
        {selection !== null && (
          <div className="finance-flow-controls">
            {tag !== null && (
              <div className="segmented finance-span-switch" role="group" aria-label="Span">
                {/** @type {const} */ ([
                  [null, periodLabel],
                  ['all', 'All time'],
                ]).map(([span, name]) => (
                  <Link
                    key={name}
                    href={financesHref({ ...place, span, transaction: null })}
                    scroll={false}
                    className={'seg' + (allTime === (span === 'all') ? ' is-on' : '')}
                    aria-current={allTime === (span === 'all') ? 'true' : undefined}
                  >
                    {name}
                  </Link>
                ))}
              </div>
            )}
            <Link
              className="btn-ghost"
              scroll={false}
              href={financesHref({ ...place, category: null, tag: null, span: null, transaction: null })}
            >
              Show all
            </Link>
          </div>
        )}
      </div>
      <div className="card-body">
        {transactions.length === 0 ? (
          <p className="caption">
            {tag !== null
              ? 'Nothing tagged ' + tag + (allTime ? '' : ' in ' + periodLabel) + '.'
              : 'Nothing recorded ' + (lineName === null ? '' : 'in ' + lineName + ' ') + 'in ' + periodLabel + '.'}
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
        {more > 0 && (
          <p className="caption finance-list-more">
            The newest {transactions.length} of {transactions.length + more} in {periodLabel}. Pick a month, a category or a tag to
            narrow it.
          </p>
        )}
      </div>
    </article>
  );
}
