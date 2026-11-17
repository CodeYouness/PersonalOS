'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { financesHref } from '@/components/finance.js';
import {
  formatEuro,
  formatMoney,
  formatMoneyChange,
  formatPercentChange,
  formatRate,
  monthLabel,
  monthShort,
  percent,
} from '@/components/format.js';
import { shiftMonth, yearOf } from '@/lib/domain/dates.js';
import { AVERAGE_MIN_MONTHS, averageMark, savingsRate, spendingParts, trendBars } from '@/lib/domain/derive/finance.js';

/** @typedef {import('@/lib/domain/derive/finance.js').CategoryFlow} CategoryFlow */
/** @typedef {import('@/lib/domain/derive/finance.js').PeriodFlows} PeriodFlows */
/** @typedef {import('@/lib/domain/derive/finance.js').TrendMonth} TrendMonth */

/**
 * The parts of a whole in a chart (docs/design/ui-rules.md): the composition
 * bar's parts cycle through them, in the table's order.
 */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

/**
 * The Income & spending section of the Finances screen (#137), from
 * lib/domain/derive/finance.js: what came in, what went out and what was
 * left; the savings rate, blank without income; fixed vs variable spending;
 * and a table per kind of category, each with its share and its change from
 * the period before. Parents open into their subcategories. Selecting a line
 * (`?category=<line>`) lists the period's transactions it counts below.
 * Uncategorised money is a line of its own in each table.
 *
 * It reads a month (`?month=YYYY-MM`, monthFlows) or, with `?period=year`,
 * that month's calendar year to date (calendarYearFlows). Above the figures
 * the trend draws income and spending per month -- the twelve months around
 * the selected one, or the year's -- each month a link that reads it. The
 * spending table's composition bar shows each line's part of the whole; in a
 * month each top-level spending line is set against its average month
 * (spendingAverages), blank until there are enough months to average.
 *
 * Read-only, and loading it calls neither the model nor an integration.
 *
 * @param {{
 *   flows: PeriodFlows,
 *   period: 'month' | 'year',
 *   yearRate: number | null,
 *   trend: TrendMonth[],
 *   averages: { months: number, byLine: Map<string, number> } | null,
 *   months: string[],
 *   month: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
export default function FinanceFlows({ flows, period, yearRate, trend, averages, months, month, place }) {
  const router = useRouter();
  const year = yearOf(month);
  const label = period === 'year' ? year : monthLabel(month);
  const years = [...new Set(months.map(yearOf))];
  /** @param {string} target */
  const go = (target) => router.push(target, { scroll: false });

  return (
    <article id="card-finance-flows" className="card">
      <div className="card-head">
        <span className="eyebrow">Income &amp; spending</span>
        <div className="finance-flow-controls">
          <div className="segmented" role="group" aria-label="Period">
            {/** @type {const} */ (['month', 'year']).map((choice) => (
              <Link
                key={choice}
                href={financesHref({ ...place, period: choice })}
                scroll={false}
                className={'seg' + (period === choice ? ' is-on' : '')}
                aria-current={period === choice ? 'true' : undefined}
              >
                {choice === 'month' ? 'Month' : 'Year'}
              </Link>
            ))}
          </div>
          {period === 'month' ? (
            <select
              aria-label="Month"
              className="input finance-month-picker"
              value={month}
              onChange={(event) => go(financesHref({ ...place, month: event.target.value, transaction: null }))}
            >
              {months.map((choice) => (
                <option key={choice} value={choice}>
                  {monthLabel(choice)}
                </option>
              ))}
            </select>
          ) : (
            <select
              aria-label="Year"
              className="input finance-month-picker"
              value={year}
              onChange={(event) =>
                go(
                  financesHref({
                    ...place,
                    // The year's newest month on offer: months are newest first.
                    month: months.find((choice) => yearOf(choice) === event.target.value) ?? month,
                    transaction: null,
                  })
                )
              }
            >
              {years.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <div className="card-body">
        <Trend trend={trend} period={period} month={month} place={place} />

        <div className={'finance-flow-totals' + (period === 'year' ? ' is-four' : '')}>
          <Figure label="Income" value={formatEuro(flows.income, { cents: true })} />
          <Figure label="Spending" value={formatEuro(flows.spending, { cents: true })} />
          <Figure label="Left" value={formatEuro(flows.left, { cents: true })} />
          <Figure label={period === 'year' ? 'Saved in ' + year : 'Saved this month'} value={formatRate(savingsRate(flows))} />
          {period === 'month' && <Figure label="Saved over 12 months" value={formatRate(yearRate)} />}
        </div>
        <p className="caption finance-fixed">
          Fixed <span className="num">{formatEuro(flows.fixed, { cents: true })}</span> · Variable{' '}
          <span className="num">{formatEuro(flows.variable, { cents: true })}</span>
        </p>

        <Composition flows={flows} />
        <FlowTable
          title="Spending"
          lines={flows.spendingCategories}
          uncategorised={flows.uncategorisedSpending}
          parts={spendingParts(flows)}
          averages={averages}
          compared={flows.compared}
          changeHead={period === 'year' ? 'vs ' + yearOf(shiftMonth(month, -12)) : 'vs last month'}
          place={place}
        />
        {period === 'month' && (
          <p className="caption finance-average-note">
            {averages === null
              ? 'No average yet: it needs ' + AVERAGE_MIN_MONTHS + ' months on offer before this one.'
              : 'Average: the ' + averages.months + ' months on offer before this one, a month with nothing in a category counting as zero. ' +
                'Beside it, this month (dark) over the average (light).'}
          </p>
        )}
        <FlowTable
          title="Income"
          lines={flows.incomeCategories}
          uncategorised={flows.uncategorisedIncome}
          parts={[]}
          averages={null}
          compared={flows.compared}
          changeHead={period === 'year' ? 'vs ' + yearOf(shiftMonth(month, -12)) : 'vs last month'}
          place={place}
        />
        {[...flows.spendingCategories, ...flows.incomeCategories, flows.uncategorisedSpending, flows.uncategorisedIncome].every(
          (line) => line.total === 0 && line.previous === 0
        ) && <p className="caption">Nothing came in or went out in {label}.</p>}
      </div>
    </article>
  );
}

/**
 * The trend: per month, income and spending as two bars against the highest
 * drawn, and what was left as a tick on the income bar -- below it is what
 * was kept. A month with nothing counted is an outlined slot, never a bar of
 * zero. Each month is a link that reads it; its name says its figures, so
 * the chart has a text equivalent. It scrolls inside the card when narrow.
 *
 * @param {{
 *   trend: TrendMonth[],
 *   period: 'month' | 'year',
 *   month: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function Trend({ trend, period, month, place }) {
  if (trend.length === 0) return null;
  const bars = trendBars(trend);
  return (
    <figure className="finance-trend">
      <div className="finance-trend-plot" role="group" aria-label="Income and spending by month">
        {trend.map((row, index) => {
          const bar = bars[index];
          const selected = period === 'month' && row.month === month;
          const newYear = index === 0 || yearOf(row.month) !== yearOf(trend[index - 1].month);
          return (
            <Link
              key={row.month}
              href={financesHref({ ...place, month: row.month, period: 'month', transaction: null })}
              scroll={false}
              className={'finance-trend-month' + (selected ? ' is-selected' : '') + (bar === null ? ' is-empty' : '')}
              aria-current={selected ? 'true' : undefined}
              aria-label={trendLabel(row)}
            >
              <span className="finance-trend-bars" aria-hidden="true">
                {bar !== null && (
                  <>
                    <i className="is-income" style={{ height: bar.income * 100 + '%' }} />
                    <i className="is-spending" style={{ height: bar.spending * 100 + '%' }} />
                    {bar.left !== null && <b className="finance-trend-left" style={{ bottom: bar.left * 100 + '%' }} />}
                  </>
                )}
              </span>
              <span className="finance-trend-label" aria-hidden="true">
                {monthShort(row.month)}
                <span className="finance-trend-year">{newYear ? yearOf(row.month) : ' '}</span>
              </span>
            </Link>
          );
        })}
      </div>
      <figcaption className="legend">
        <span>
          <i className="dot" style={{ color: 'var(--series-2)' }} />
          Income
        </span>
        <span>
          <i className="dot" style={{ color: 'var(--series-1)' }} />
          Spending
        </span>
        <span>
          <i className="finance-trend-tick" />
          Left
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * What a month of the trend says to a screen reader.
 *
 * @param {TrendMonth} row
 * @returns {string}
 */
function trendLabel(row) {
  if (row.income === null || row.spending === null || row.left === null) return monthLabel(row.month) + ': nothing recorded';
  return (
    monthLabel(row.month) +
    ': income ' + formatEuro(row.income) +
    ', spending ' + formatEuro(row.spending) +
    ', left ' + formatEuro(row.left)
  );
}

/**
 * One bar of the period's spending by top-level category. Its legend is the
 * spending table under it: each line with a part carries the part's dot,
 * and its share is already a column. The bar's own name lists the parts.
 *
 * @param {{ flows: PeriodFlows }} props
 */
function Composition({ flows }) {
  const parts = spendingParts(flows);
  if (parts.length < 2) return null;
  return (
    <div
      className="alloc finance-composition"
      role="img"
      aria-label={'Spending by category: ' + parts.map((part) => part.name + ' ' + percent(part.share)).join(', ')}
    >
      {parts.map((part, index) => (
        <i key={part.id} style={{ width: part.share * 100 + '%', background: SERIES[index % SERIES.length] }} />
      ))}
    </div>
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
 * subcategory is selected opens by itself. With averages, each top-level
 * line has its average month and a paired mark beside its total.
 *
 * @param {{
 *   title: string,
 *   lines: CategoryFlow[],
 *   uncategorised: CategoryFlow,
 *   parts: { id: string }[],
 *   averages: { months: number, byLine: Map<string, number> } | null,
 *   compared: boolean,
 *   changeHead: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function FlowTable({ title, lines, uncategorised, parts, averages, compared, changeHead, place }) {
  const [open, setOpen] = useState(
    () => new Set(lines.filter((line) => line.children.some((child) => child.id === place.category)).map((line) => line.id))
  );
  const showUncategorised = uncategorised.total !== 0 || uncategorised.previous !== 0;
  if (lines.length === 0 && !showUncategorised) return null;

  /** @param {string} id */
  const toggle = (id) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  /** @param {string} id */
  const tone = (id) => {
    const at = parts.findIndex((part) => part.id === id);
    return parts.length < 2 || at === -1 ? null : SERIES[at % SERIES.length];
  };
  const shared = { place, averages, compared };

  return (
    <table className={'finance-table finance-flow-table' + (averages === null ? '' : ' has-average')}>
      <thead>
        <tr>
          <th>{title}</th>
          <th className="num">Total</th>
          {averages !== null && (
            <>
              <th className="num">Average</th>
              <th className="finance-average-mark-head">
                <span className="visually-hidden">Against the average</span>
              </th>
            </>
          )}
          <th className="num">Share</th>
          <th className="num">{changeHead}</th>
          <th className="num">%</th>
        </tr>
      </thead>
      <tbody>
        {lines.flatMap((line) => [
          <FlowRow
            key={line.id}
            line={line}
            tone={tone(line.id)}
            open={open.has(line.id)}
            onToggle={line.children.length > 0 ? () => toggle(line.id) : null}
            {...shared}
          />,
          ...(open.has(line.id) ? line.children.map((child) => <FlowRow key={child.id} line={child} child {...shared} />) : []),
        ])}
        {showUncategorised && <FlowRow line={uncategorised} tone={tone(uncategorised.id)} {...shared} />}
      </tbody>
    </table>
  );
}

/**
 * @param {{
 *   line: CategoryFlow,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   averages: { months: number, byLine: Map<string, number> } | null,
 *   compared: boolean,
 *   tone?: string | null,
 *   child?: boolean,
 *   open?: boolean,
 *   onToggle?: (() => void) | null,
 * }} props
 */
function FlowRow({ line, place, averages, compared, tone = null, child = false, open = false, onToggle = null }) {
  const selected = place.category === line.id;
  const average = child || averages === null ? undefined : averages.byLine.get(line.id);
  const mark = average === undefined ? null : averageMark(line.total, average);
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
        {tone !== null && <i className="dot finance-part-dot" style={{ color: tone }} aria-hidden="true" />}
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
      {averages !== null && (
        <>
          <td className="num caption">{average === undefined ? '' : formatMoney(average, { cents: true })}</td>
          <td className="finance-average-mark">
            {mark !== null && (
              <span aria-hidden="true">
                <i className="is-total" style={{ width: mark.total * 100 + '%' }} />
                <i className="is-average" style={{ width: mark.average * 100 + '%' }} />
              </span>
            )}
          </td>
        </>
      )}
      <td className="num caption">{percent(line.share)}</td>
      <td className="num">{compared ? formatMoneyChange(line.change) : ''}</td>
      <td className="num caption">{compared ? formatPercentChange(line.changeRatio) : ''}</td>
    </tr>
  );
}
