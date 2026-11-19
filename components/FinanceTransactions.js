import Link from 'next/link';

import {
  countedOverNote,
  financesHref,
  InterestLine,
  interestRunLabel,
  listedAmount,
  MovementAmount,
  refundNote,
  RefundedLine,
  transferEnds,
} from '@/components/finance.js';
import { shortDate } from '@/components/format.js';
import Segmented from '@/components/Segmented.js';

/** @typedef {import('@/lib/domain/types.js').Transaction} Transaction */
/** @typedef {import('@/lib/domain/types.js').FinanceAccount} FinanceAccount */
/** @typedef {import('@/lib/domain/types.js').FinanceCategory} FinanceCategory */
/** @typedef {import('@/lib/domain/derive/interest.js').InterestRun} InterestRun */

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
 * quieter, and names both ends, "from → to". Dates never wrap. A movement
 * counted over several months (ADR 0052) stays on the day it was paid, with
 * a quiet note of its months, "counted over Sep–Nov".
 *
 * A row is one line (ADR 0049): a long description, category or account
 * name is cut with an ellipsis, the whole of it in its `title` and in the
 * movement's panel, one click away. The card never scrolls sideways (ADR
 * 0053): the date and the amount are as wide as their text, the others share
 * the rest, and a narrow card drops the account, then the category
 * (app/globals.css) -- so the description's title names them too:
 * "Lunch — Restaurants · Current".
 *
 * A refund paired with its purchase (ADR 0055) is noise beside it: the page
 * hands the list without a paired refund and a purchase all of which came
 * back, and `refunded`, how many it left out; a last quiet line says so and
 * offers them (`?refunded=show`), then offers to hide them again. A purchase
 * partly refunded shows what is left of it and "of 41.97, 2.62 refunded";
 * shown, each end says what it is ("refund of Jacket", "refunded"). Each
 * end's `standing` comes from the page (listedTransactions).
 *
 * A deposit's interest (ADR 0056) -- a few cents a day, and the tax withheld
 * on it -- is one row per account and month: the page hands an InterestRun
 * in its place, on its newest day, at the net of what it folds. Its name,
 * "Interest · 31 days", lists the month's movements one by one
 * (`?interest=show`), each opening its own panel as any row does; the
 * category column names each category it holds, the account its account. It
 * is selected while it holds the selected movement. A last quiet line, the
 * refunded line's sibling, says how many movements were folded and offers
 * them, then offers to fold them again.
 *
 * @param {{
 *   transactions: (Transaction | InterestRun)[],
 *   accounts: FinanceAccount[],
 *   categories: FinanceCategory[],
 *   lineName: string | null,
 *   tag: string | null,
 *   more: number,
 *   standings?: Map<string, import('@/lib/domain/derive/refunds.js').RefundStanding>,
 *   refunded?: number,
 *   interest?: number,
 *   max: number,
 *   periodLabel: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTransactions({ transactions, accounts, categories, lineName, tag, more, standings = new Map(), refunded = 0, interest = 0, max, periodLabel, todayKey, place }) {
  const shown = place.refunded === 'show';
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
              <Segmented
                label="Span"
                className="finance-span-switch"
                options={/** @type {const} */ ([
                  [null, periodLabel],
                  ['all', 'All time'],
                ]).map(([span, name]) => ({
                  key: name,
                  href: financesHref({ ...place, span, transaction: null }),
                  on: allTime === (span === 'all'),
                  children: name,
                }))}
              />
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
              ? 'Nothing ' + (refunded > 0 ? 'else ' : '') + 'tagged ' + tag + (allTime ? '' : ' in ' + periodLabel) + '.'
              : 'Nothing ' + (refunded > 0 ? 'else ' : '') + 'recorded ' + (lineName === null ? '' : 'in ' + lineName + ' ') + 'in ' + periodLabel + '.'}
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
                  if ('kind' in transaction) {
                    const run = transaction;
                    const label = interestRunLabel(run);
                    const filedUnder = run.categoryIds.map((id) => (id === null ? null : categoryName(id)) ?? 'Uncategorised').join(', ');
                    const where = accountName(run.accountId);
                    const holdsSelected = place.transaction !== null && place.transaction !== undefined && run.ids.includes(place.transaction);
                    return (
                      <tr key={run.id} className={holdsSelected ? 'is-selected' : undefined}>
                        <td className="num finance-date">{shortDate(run.date, todayKey)}</td>
                        <td>
                          <span className="finance-cut">
                            <Link
                              href={financesHref({ ...place, interest: 'show' })}
                              scroll={false}
                              className="finance-account-link finance-cut-text"
                              title={label + ' — ' + filedUnder + ' · ' + where}
                            >
                              {label}
                            </Link>
                            {run.count !== run.days && <span className="caption">· {run.count} movements</span>}
                          </span>
                        </td>
                        <td className={run.categoryIds.length > 1 || run.categoryIds[0] === null ? 'caption' : undefined}>
                          <span className="finance-cut-text" title={filedUnder}>
                            {filedUnder}
                          </span>
                        </td>
                        <td className="caption">
                          <span className="finance-cut-text" title={where}>
                            {where}
                          </span>
                        </td>
                        <MovementAmount amount={run.amount} />
                      </tr>
                    );
                  }
                  const selected = transaction.id === place.transaction;
                  const transfer = transaction.counterAccountId !== null;
                  const category = categoryName(transaction.categoryId);
                  const description = transaction.description === '' ? '(no description)' : transaction.description;
                  const filedUnder = transfer ? 'Transfer' : category ?? 'Uncategorised';
                  const countedOver = countedOverNote(transaction);
                  const standing = standings.get(transaction.id);
                  const refund = refundNote(standing, shown);
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
                            title={description + ' — ' + filedUnder + ' · ' + where}
                            aria-current={selected ? 'true' : undefined}
                          >
                            {description}
                          </Link>
                          {transaction.notCounted && <span className="caption">· not counted</span>}
                          {countedOver !== null && <span className="caption">· {countedOver}</span>}
                          {refund !== null && <span className="caption">· {refund}</span>}
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
                      <MovementAmount amount={listedAmount(transaction.amount, standing, shown)} transfer={transfer} notCounted={transaction.notCounted} />
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
        <RefundedLine count={refunded} place={place} />
        <InterestLine count={interest} place={place} />
      </div>
    </article>
  );
}
