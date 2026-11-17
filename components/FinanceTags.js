import Link from 'next/link';

import { financesHref } from '@/components/finance.js';
import { formatMoney, shortDate } from '@/components/format.js';

/** @typedef {import('@/lib/domain/derive/finance.js').TagFlow} TagFlow */

/**
 * The By tag card of the Finances screen (ADR 0046): spending by the user's
 * own tags -- a trip, a project, "work expenses 2026" -- over the period
 * Income & spending reads, the month or its calendar year to date
 * (tagFlows). Each tag with a counted movement in the period, largest
 * spending first: its movements, what it spent in the period and over all
 * time, and its first and last day, since a trip rarely fits one month.
 *
 * A card of its own, not a table of Income & spending: the category tables
 * there add up to the period's spending, and a movement with several tags
 * counts under each, so the tags do not -- set beside them they would read
 * as parts of the whole. The caption says so.
 *
 * Selecting a tag (`?tag=<tag>`) lists its movements in the Transactions
 * card. One selection at a time: it clears a selected line, as selecting a
 * line clears the tag. Nothing is rendered when no movement has a tag.
 *
 * @param {{
 *   tags: TagFlow[],
 *   tagged: boolean,
 *   periodLabel: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceTags({ tags, tagged, periodLabel, todayKey, place }) {
  if (!tagged) return null;
  return (
    <article id="card-finance-tags" className="card">
      <div className="card-head">
        <span className="eyebrow">By tag</span>
        <span className="caption">{periodLabel}</span>
      </div>
      <div className="card-body">
        {tags.length === 0 ? (
          <p className="caption">No tagged movement counted in {periodLabel}.</p>
        ) : (
          <>
            <table className="finance-table finance-flow-table finance-tag-table">
              <thead>
                <tr>
                  <th>Tag</th>
                  <th className="num">Movements</th>
                  <th className="num">Spent, {periodLabel}</th>
                  <th className="num">Spent, all time</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((row) => {
                  const selected = place.tag === row.tag;
                  return (
                    <tr key={row.tag} className={selected ? 'is-selected' : undefined}>
                      <td>
                        <Link
                          href={financesHref({ ...place, tag: row.tag, category: null, span: null, transaction: null })}
                          scroll={false}
                          className="finance-account-link"
                          aria-current={selected ? 'true' : undefined}
                        >
                          {row.tag}
                        </Link>
                        <span className="caption finance-tag-days">
                          {row.first === row.last
                            ? shortDate(row.first, todayKey)
                            : shortDate(row.first, todayKey) + ' – ' + shortDate(row.last, todayKey)}
                        </span>
                      </td>
                      <td className="num">{row.movements}</td>
                      <td className="num">{formatMoney(row.spending, { cents: true })}</td>
                      <td className="num">{formatMoney(row.allSpending, { cents: true })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="caption finance-tag-note">
              A movement with several tags counts under each, so these do not add up to the period’s spending. A refund
              reduces what a tag spent; transfers and movements not counted are left out.
            </p>
          </>
        )}
      </div>
    </article>
  );
}
