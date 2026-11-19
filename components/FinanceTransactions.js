import Link from 'next/link';
import { Fragment } from 'react';

import {
  countedOverNote,
  financesHref,
  interestRunLabel,
  listedAmount,
  MovementAmount,
  refundNote,
  transferEnds,
} from '@/components/finance.js';
import { shortDate } from '@/components/format.js';
import Segmented from '@/components/Segmented.js';
import { financesParams } from '@/lib/domain/addresses.js';
import { hiddenAsRefunded } from '@/lib/domain/derive/refunds.js';
import { limits } from '@/personalos.config.js';

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
 * the year and `more`, how many it left out; the card says so and offers
 * them all (`?span=all`, ADR 0048) -- and once they are all shown, offers
 * the newest only again.
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
 * back, and `refunded`, how many it left out; the service line says so and
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
 * is selected while it holds the selected movement.
 *
 * A movement not counted (ADR 0058) is in no total: with nothing selected the
 * page hands the list without it and `uncounted`, how many it left out
 * (`?uncounted=show` lists them). The movement open in the panel is never
 * left out: a refunded one listed so reads as it does shown, at its own
 * amount and with its note.
 *
 * **One service line** under the list (ADR 0058, ServiceLine) says what it
 * leaves out -- the newest of how many, the refunded and not-counted
 * movements hidden or shown, the interest folded or one by one -- and offers
 * each toggle as a link inside it; nothing when nothing applies.
 *
 * **A search** (`?q=`, ADR 0058): the head holds a plain GET form carrying
 * the place but not the selection, line, tag, span or open movement. With a
 * query the page hands every matching movement of all time, newest first,
 * capped as a period is; nothing is hidden or folded, and a refunded or
 * not-counted row keeps its mark and its own amount. The head says how many
 * match and links back to the period; a result opens its panel with the
 * search kept.
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
 *   uncounted?: number,
 *   interest?: number,
 *   max: number,
 *   periodLabel: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTransactions({
  transactions,
  accounts,
  categories,
  lineName,
  tag,
  more,
  standings = new Map(),
  refunded = 0,
  uncounted = 0,
  interest = 0,
  max,
  periodLabel,
  todayKey,
  place,
}) {
  const query = place.q ?? null;
  const searching = query !== null;
  // Shown, or searching: nothing is hidden, so each end of a pair is itself.
  const shown = searching || place.refunded === 'show';
  /** @param {string} id */
  const accountName = (id) => accounts.find((account) => account.id === id)?.name ?? 'an account that no longer exists';
  /** @param {string | null} id */
  const categoryName = (id) => categories.find((category) => category.id === id)?.name ?? null;
  const selection = searching ? null : tag !== null ? 'tagged ' + tag : lineName;
  const allTime = tag !== null && place.span === 'all';
  const matching = searching ? 'matching “' + query + '”' : null;
  const found = transactions.length + more;
  const hiddenAny = (refunded > 0 && place.refunded !== 'show') || (uncounted > 0 && place.uncounted !== 'show');

  return (
    <article id="card-finance-transactions" className="card">
      <div className="card-head">
        <span className="eyebrow">
          Transactions{selection === null ? '' : ' · ' + selection}
        </span>
        <form className="finance-search" action="/finances" method="get" role="search">
          {financesParams({
            account: place.account,
            month: place.month,
            period: place.period,
            view: place.view,
            refunded: place.refunded,
            interest: place.interest,
            uncounted: place.uncounted,
          }).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <input
            className="input finance-search-input"
            type="search"
            name="q"
            defaultValue={query ?? ''}
            placeholder="Search all movements"
            aria-label="Search all movements"
            maxLength={limits.financeSearchMaxLength}
          />
          <button type="submit" className="visually-hidden">
            Search
          </button>
        </form>
        {matching !== null && (
          <p className="caption finance-search-what">
            {(found === 0 ? 'No movements ' : found === 1 ? '1 movement ' : found + ' movements ') + matching + ' — '}
            <Link
              className="finance-account-link"
              scroll={false}
              href={financesHref({ ...place, q: null, span: null, transaction: null })}
            >
              back to {periodLabel}
            </Link>
          </p>
        )}
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
          searching ? null : (
            <p className="caption">
              {tag !== null
                ? 'Nothing ' + (hiddenAny ? 'else ' : '') + 'tagged ' + tag + (allTime ? '' : ' in ' + periodLabel) + '.'
                : 'Nothing ' + (hiddenAny ? 'else ' : '') + 'recorded ' + (lineName === null ? '' : 'in ' + lineName + ' ') + 'in ' + periodLabel + '.'}
            </p>
          )
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
                  // Listed though the refunded are hidden: the open movement, read as itself.
                  const itself = shown || (standing !== undefined && hiddenAsRefunded(standing));
                  const refund = refundNote(standing, itself);
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
                      <MovementAmount amount={listedAmount(transaction.amount, standing, itself)} transfer={transfer} notCounted={transaction.notCounted} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <ServiceLine
          listed={transactions.length}
          more={more}
          whole={selection === null && place.span === 'all' && transactions.length > max}
          max={max}
          within={matching ?? 'in ' + periodLabel}
          refunded={refunded}
          uncounted={uncounted}
          interest={interest}
          place={place}
        />
      </div>
    </article>
  );
}

/**
 * One toggle the service line offers: the word, and where it leads.
 *
 * @typedef {{ word: string, href: string, label: string }} Toggle
 */

/**
 * The one quiet line under the list (ADR 0058, amending 0055 and 0056): what
 * it leaves out, then each way to undo it as a link, grouped by what the
 * link does. "The newest 100 of 140 in March 2026 · 5 refunded and 12
 * not-counted movements hidden · 60 interest movements folded by month —
 * show: all 140, refunded, not counted, interest". What is shown already is
 * offered back: "5 refunded movements shown — hide: refunded", "… shown one
 * by one — fold: interest", "All 140 in March 2026 — show: newest 100".
 * Nothing when nothing applies.
 *
 * @param {{
 *   listed: number,
 *   more: number,
 *   whole: boolean,
 *   max: number,
 *   within: string,
 *   refunded: number,
 *   uncounted: number,
 *   interest: number,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 *   `listed` the rows listed, `more` how many the cap left out, `whole` the
 *   whole span shown though it is over the cap, `within` what the list is
 *   of ("in March 2026", "matching “x”")
 */
function ServiceLine({ listed, more, whole, max, within, refunded, uncounted, interest, place }) {
  /** @type {string[]} */
  const said = [];
  /** @type {Record<'show' | 'hide' | 'fold', Toggle[]>} */
  const offers = { show: [], hide: [], fold: [] };

  if (more > 0) {
    said.push('The newest ' + listed + ' of ' + (listed + more) + ' ' + within);
    offers.show.push({ word: 'all ' + (listed + more), href: financesHref({ ...place, span: 'all' }), label: 'Show all ' + (listed + more) + ' movements' });
  } else if (whole) {
    said.push('All ' + listed + ' ' + within);
    offers.show.push({ word: 'newest ' + max, href: financesHref({ ...place, span: null }), label: 'Show the newest ' + max + ' only' });
  }

  const kinds = [
    { count: refunded, key: /** @type {const} */ ('refunded'), name: 'refunded', word: 'refunded' },
    { count: uncounted, key: /** @type {const} */ ('uncounted'), name: 'not-counted', word: 'not counted' },
  ].filter((kind) => kind.count > 0);
  for (const state of ['hidden', 'shown']) {
    const these = kinds.filter((kind) => (place[kind.key] === 'show') === (state === 'shown'));
    if (these.length === 0) continue;
    const total = these.reduce((sum, kind) => sum + kind.count, 0);
    said.push(these.map((kind) => kind.count + ' ' + kind.name).join(' and ') + (total === 1 ? ' movement ' : ' movements ') + state);
    for (const kind of these) {
      const what = kind.count === 1 ? 'the 1 ' + kind.name + ' movement' : 'the ' + kind.count + ' ' + kind.name + ' movements';
      const toggle = state === 'shown'
        ? { word: kind.word, href: financesHref({ ...place, [kind.key]: null }), label: 'Hide ' + what }
        : { word: kind.word, href: financesHref({ ...place, [kind.key]: 'show' }), label: 'Show ' + what };
      offers[state === 'shown' ? 'hide' : 'show'].push(toggle);
    }
  }

  if (interest > 0) {
    const what = interest === 1 ? '1 interest movement' : interest + ' interest movements';
    if (place.interest === 'show') {
      said.push(what + ' shown one by one');
      offers.fold.push({ word: 'interest', href: financesHref({ ...place, interest: null }), label: 'Fold the ' + what + ' by month' });
    } else {
      said.push(what + ' folded by month');
      offers.show.push({ word: 'interest', href: financesHref({ ...place, interest: 'show' }), label: 'Show the ' + what + ' one by one' });
    }
  }

  if (said.length === 0) return null;
  const groups = /** @type {const} */ (['show', 'hide', 'fold']).filter((verb) => offers[verb].length > 0);
  return (
    <p className="caption finance-list-more finance-list-line">
      {said.join(' · ') + ' — '}
      {groups.map((verb, at) => (
        <Fragment key={verb}>
          {(at === 0 ? '' : ' · ') + verb + ': '}
          {offers[verb].map((toggle, index) => (
            <Fragment key={toggle.word}>
              {index > 0 && ', '}
              <Link href={toggle.href} scroll={false} className="finance-account-link" aria-label={toggle.label}>
                {toggle.word}
              </Link>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </p>
  );
}
