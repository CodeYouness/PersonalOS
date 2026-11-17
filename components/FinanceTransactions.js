import Link from 'next/link';

import { financesHref, transferEnds } from '@/components/finance.js';
import { formatMoney, formatMoneyChange, shortDate } from '@/components/format.js';

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
 * (`?span=all`), whatever the period -- a trip rarely fits one month. With
 * nothing selected, the page hands only the newest movements of the month or
 * the year and `more`, how many it left out; the card says so, offers them
 * all (`?span=all`, ADR 0048) and says how to narrow it -- and once they are
 * all shown, offers the newest only again.
 *
 * Money in and money out are unmistakable (ADR 0048): a movement's amount is
 * signed from its account's side -- "+" for money in, in the up tone, "−"
 * for money out, in the ink -- and the sign is always printed, so colour is
 * never alone. A movement not counted keeps its sign and is quieter. A
 * transfer between your own accounts is neither: it shows the amount moved,
 * quieter, and names both ends, "from → to". Dates never wrap.
 *
 * A row is one line (ADR 0049): a long description, category or account
 * name is cut with an ellipsis, the whole of it in its `title` and in the
 * movement's panel, one click away. The description takes the room the
 * other columns leave (fixed columns, app/globals.css).
 *
 * @param {{
 *   transactions: Transaction[],
 *   accounts: FinanceAccount[],
 *   categories: FinanceCategory[],
 *   lineName: string | null,
 *   tag: string | null,
 *   more: number,
 *   max: number,
 *   periodLabel: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTransactions({ transactions, accounts, categories, lineName, tag, more, max, periodLabel, todayKey, place }) {
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? 'an account that no longer exists';
  /** @param {string | null} id */
  const categoryName = (id) => categories.find((category) => category.id === id)?.name ?? null;
  const selection = tag !== null ? 'tagged ' + tag : lineName;
  const allTime = tag !== null && place.span === 'all';
  const wholePeriod = selection === null && place.span === 'all' && transactions.length > max;
  const narrowing = place.period === 'year' ? 'pick a month, a category or a tag to narrow it' : 'pick a category or a tag to narrow it';

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
          <div className="finance-table-scroll">
            <table className="finance-table finance-transactions-table">
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
                  const description = transaction.description === '' ? '(no description)' : transaction.description;
                  const filedUnder = transfer ? 'Transfer' : category ?? 'Uncategorised';
                  const where = transfer
                    ? accountName(transferEnds(transaction).from) + ' → ' + accountName(transferEnds(transaction).to)
                    : accountName(transaction.accountId);
                  return (
                    <tr key={transaction.id} className={selected ? 'is-selected' : undefined}>
                      <td className="num finance-date">{shortDate(transaction.date, todayKey)}</td>
                      <td>
                        <span className="finance-cut">
                          <Link
                            href={financesHref({ ...place, transaction: transaction.id })}
                            scroll={false}
                            className="finance-account-link finance-cut-text"
                            title={description}
                            aria-current={selected ? 'true' : undefined}
                          >
                            {description}
                          </Link>
                          {transaction.notCounted && <span className="caption">· not counted</span>}
                        </span>
                      </td>
                      <td className={transfer || category === null ? 'caption' : undefined}>
                        <span className="finance-cut-text" title={filedUnder}>
                          {filedUnder}
                        </span>
                      </td>
                      <td className="caption">
                        <span className="finance-cut-text" title={where}>
                          {where}
                        </span>
                      </td>
                      <Amount transaction={transaction} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {more > 0 && (
          <p className="caption finance-list-more">
            The newest {transactions.length} of {transactions.length + more} in {periodLabel}.{' '}
            <Link href={financesHref({ ...place, span: 'all' })} scroll={false} className="finance-account-link">
              Show all {transactions.length + more}
            </Link>
            , or {narrowing}.
          </p>
        )}
        {wholePeriod && (
          <p className="caption finance-list-more">
            All {transactions.length} in {periodLabel}.{' '}
            <Link href={financesHref({ ...place, span: null })} scroll={false} className="finance-account-link">
              Show the newest {max}
            </Link>
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * A movement's amount, money in or out (ADR 0048): "+ 12.40" in the up tone
 * for money in, "− 12.40" in the ink for money out, the sign always printed.
 * Not counted: the same sign, quieter. A transfer: the amount moved, quieter,
 * since the money stayed yours.
 *
 * @param {{ transaction: Transaction }} props
 */
function Amount({ transaction }) {
  if (transaction.counterAccountId !== null) {
    return <td className="num finance-amount is-quiet">{formatMoney(Math.abs(transaction.amount), { cents: true })}</td>;
  }
  const shown = formatMoneyChange(transaction.amount, { cents: true });
  if (transaction.notCounted) return <td className="num finance-amount is-quiet">{shown}</td>;
  return <td className={'num finance-amount' + (transaction.amount > 0 ? ' up' : '')}>{shown}</td>;
}
