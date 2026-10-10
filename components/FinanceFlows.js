'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { financesHref, UNCATEGORISED } from '@/components/finance.js';
import { formatEuro, formatMoney, formatMoneyChange, formatPercentChange, formatRate, monthLabel, percent } from '@/components/format.js';

/** @typedef {import('@/lib/domain/derive/finance.js').CategoryFlow} CategoryFlow */
/** @typedef {ReturnType<typeof import('@/lib/domain/derive/finance.js').monthFlows>} MonthFlows */

/**
 * The Income & spending section of the Finances screen (#137), from
 * lib/domain/derive/finance.js's monthFlows: what came in, what went out and
 * what was left; the savings rate for the month and the twelve months ending
 * with it, blank without income; fixed vs variable spending; and a table per
 * kind of category, each with its share of the month and its change from
 * the month before. Parents open into their subcategories. Selecting a line
 * (`?category=<id>`, or `uncategorised`) lists that month's transactions in
 * it below. The month is picked here, `?month=YYYY-MM`.
 *
 * Read-only, and loading it calls neither the model nor an integration.
 *
 * @param {{
 *   flows: MonthFlows,
 *   monthRate: number | null,
 *   yearRate: number | null,
 *   months: string[],
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceFlows({ flows, monthRate, yearRate, months, place }) {
  const router = useRouter();
  const month = /** @type {string} */ (place.month);

  return (
    <article id="card-finance-flows" className="card">
      <div className="card-head">
        <span className="eyebrow">Income &amp; spending</span>
        <select
          aria-label="Month"
          className="input finance-month-picker"
          value={month}
          onChange={(event) =>
            router.push(financesHref({ ...place, month: event.target.value, transaction: null }), { scroll: false })
          }
        >
          {months.map((choice) => (
            <option key={choice} value={choice}>
              {monthLabel(choice)}
            </option>
          ))}
        </select>
      </div>
      <div className="card-body">
        <div className="finance-flow-totals">
          <Figure label="Income" value={formatEuro(flows.income, { cents: true })} />
          <Figure label="Spending" value={formatEuro(flows.spending, { cents: true })} />
          <Figure label="Left" value={formatEuro(flows.left, { cents: true })} />
          <Figure label="Saved this month" value={formatRate(monthRate)} />
          <Figure label="Saved over 12 months" value={formatRate(yearRate)} />
        </div>
        <p className="caption finance-fixed">
          Fixed <span className="num">{formatEuro(flows.fixed)}</span> · Variable{' '}
          <span className="num">{formatEuro(flows.variable)}</span>
        </p>

        <FlowTable
          title="Spending"
          lines={flows.spendingCategories}
          uncategorised={flows.uncategorised.spending}
          place={place}
        />
        <FlowTable title="Income" lines={flows.incomeCategories} uncategorised={flows.uncategorised.income} place={place} />
        {flows.spendingCategories.length === 0 && flows.incomeCategories.length === 0 && flows.income === 0 && flows.spending === 0 && (
          <p className="caption">Nothing came in or went out in {monthLabel(month)}.</p>
        )}
      </div>
    </article>
  );
}

/** @param {{ label: string, value: string }} props */
function Figure({ label, value }) {
  return (
    <div className="finance-figure">
      <span className="caption">{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}

/**
 * One kind's table. A parent with subcategories opens into them; one whose
 * subcategory is selected opens by itself.
 *
 * @param {{
 *   title: string,
 *   lines: CategoryFlow[],
 *   uncategorised: number,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function FlowTable({ title, lines, uncategorised, place }) {
  const [open, setOpen] = useState(
    () => new Set(lines.filter((line) => line.children.some((child) => child.id === place.category)).map((line) => line.id))
  );
  if (lines.length === 0 && uncategorised === 0) return null;

  /** @param {string} id */
  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <table className="finance-table finance-flow-table">
      <thead>
        <tr>
          <th>{title}</th>
          <th className="num">Total</th>
          <th className="num">Share</th>
          <th className="num">vs last month</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {lines.flatMap((line) => [
          <FlowRow
            key={line.id}
            line={line}
            place={place}
            open={open.has(line.id)}
            onToggle={line.children.length > 0 ? () => toggle(line.id) : null}
          />,
          ...(open.has(line.id)
            ? line.children.map((child) => <FlowRow key={child.id} line={child} place={place} child />)
            : []),
        ])}
        {uncategorised !== 0 && (
          <tr className={place.category === UNCATEGORISED ? 'is-selected' : undefined}>
            <td>
              <Link
                href={financesHref({ ...place, category: UNCATEGORISED, transaction: null })}
                scroll={false}
                className="finance-account-link caption"
              >
                Uncategorised
              </Link>
            </td>
            <td className="num">{formatMoney(uncategorised, { cents: true })}</td>
            <td />
            <td />
            <td />
          </tr>
        )}
      </tbody>
    </table>
  );
}

/**
 * @param {{
 *   line: CategoryFlow,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   child?: boolean,
 *   open?: boolean,
 *   onToggle?: (() => void) | null,
 * }} props
 */
function FlowRow({ line, place, child = false, open = false, onToggle = null }) {
  const selected = place.category === line.id;
  return (
    <tr className={(selected ? 'is-selected' : '') + (child ? ' is-child' : '') || undefined}>
      <td>
        {onToggle !== null && (
          <button
            type="button"
            className="finance-disclosure"
            aria-expanded={open}
            aria-label={(open ? 'Close ' : 'Open ') + line.name}
            onClick={onToggle}
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        <Link
          href={financesHref({ ...place, category: line.id, transaction: null })}
          scroll={false}
          className="finance-account-link"
          aria-current={selected ? 'true' : undefined}
        >
          {line.name}
        </Link>
      </td>
      <td className="num">{formatMoney(line.total, { cents: true })}</td>
      <td className="num caption">{percent(line.share)}</td>
      <td className="num">{formatMoneyChange(line.change)}</td>
      <td className="num caption">{formatPercentChange(line.changeRatio)}</td>
    </tr>
  );
}
