'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { financesHref, InterestLine, interestRunLabel, MovementAmount, refundNote, RefundedLine } from '@/components/finance.js';
import {
  dayOfMonth,
  formatEuro,
  formatEuroShort,
  formatMoney,
  monthLabel,
  monthShort,
  monthSpan,
  percent,
  shortDate,
} from '@/components/format.js';
import Segmented from '@/components/Segmented.js';
import Tip, { TipFigures } from '@/components/Tip.js';
import { yearOf } from '@/lib/domain/dates.js';
import {
  circleArc,
  dayBars,
  dayHigh,
  dayMarkFloor,
  fixedCostSplit,
  flowCircle,
  ownLineParent,
  savingsReading,
  spendingParts,
  targetShortfall,
  trendBars,
  trendHigh,
  UNCATEGORISED_INCOME,
  UNCATEGORISED_SPENDING,
} from '@/lib/domain/derive/finance.js';

/** @typedef {import('@/lib/domain/derive/finance.js').CategoryFlow} CategoryFlow */
/** @typedef {import('@/lib/domain/derive/finance.js').PeriodFlows} PeriodFlows */
/** @typedef {import('@/lib/domain/derive/finance.js').TrendMonth} TrendMonth */
/** @typedef {import('@/lib/domain/derive/finance.js').YearColumn} YearColumn */
/** @typedef {import('@/lib/domain/derive/finance.js').DayColumn} DayColumn */
/** @typedef {import('@/lib/domain/derive/finance.js').FlowCircle} FlowCircle */
/** @typedef {import('@/lib/domain/derive/finance.js').CirclePart} CirclePart */
/** @typedef {import('@/lib/domain/derive/finance.js').LineMovement} LineMovement */
/** @typedef {import('@/lib/domain/derive/interest.js').InterestRun} InterestRun */
/** @typedef {{ rows: (LineMovement | InterestRun)[], more: number, refunded?: number, interest?: number }} LineList a line's movements of the period; `refunded` how many refunded movements it left out (ADR 0055), `interest` how many interest movements it folded (ADR 0056) */
/** @typedef {Map<string, LineList>} Movements each line's movements of the period, by line id */
/** @typedef {CirclePart['key'] | 'over'} PartKey what the circle can emphasise */
/**
 * What the columns draw (ADR 0053): a month's days, with what is counted on
 * no day, or a year's twelve months.
 *
 * @typedef {{ kind: 'days', days: DayColumn[], apart: { income: number, spending: number, movements: number } } | { kind: 'months', months: YearColumn[] }} ChartColumns
 */

/**
 * The parts of a whole in a chart (docs/design/ui-rules.md): the composition
 * bar's parts cycle through them, in the table's order.
 */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

/** The circle's geometry, in its 120-unit view box: the ring and, outside it, the overspending's arc. */
const CENTRE = 60;
const RING = 44;
const OUTER = 56;

/** The days of a month labelled under its columns: a week apart, from the 1st. */
const DAY_TICKS = new Set(['1', '8', '15', '22', '29']);

/** A year's columns are labelled every this many months, from January: the quarters. */
const MONTH_TICK_STEP = 3;

/**
 * The Income & spending section of the Finances screen (#137): what came in,
 * where it went and what was left, for a month (`?month=YYYY-MM`,
 * monthFlows) or, with `?period=year`, that month's calendar year to date
 * (calendarYearFlows).
 *
 * Top to bottom (ADR 0053, amending 0050; ADR 0060): the head -- the name
 * and right beside it the view, a Circle / Columns segmented control
 * (`?view=columns`; the circle is the default and never written) of glyphs
 * alone, each named; on the right a toolbar that wraps on a narrow card, the
 * period, a Month / Year segmented control followed by its stepper (‹ the
 * month or year, its select ›); the
 * one line counting movements without a category (uncategorisedCounts, ADR
 * 0048); and the body, two columns, stacked on a phone. No strip of bars
 * across the top: what it drew is the columns.
 *
 * **On the left**, the chart the view picks, then the period's four totals
 * and the rest of the summary under it:
 *
 * - The circle (flowCircle, ADR 0050): the period's income split, clockwise
 *   from the top, into what was spent, invested (periodInvested, from the
 *   trades) and kept; spending beyond the income an arc outside the ring in
 *   the danger tone, and said in words. Hovering or focusing a part shows it
 *   in the centre; hovering a total emphasises its part.
 * - The columns: in a year one per month (yearColumns, each a link that reads
 *   it) -- money in outlined, money out solid, "left" a tick, on a scale from
 *   zero to the highest bar printed beside them; in a month one per day
 *   (dayColumns) -- money out solid on a scale from zero to the largest day's
 *   spending, money in an outlined mark on its day from 1% of the month's
 *   income, not drawn to scale (dayBars, ADR 0053 amended). Each column is
 *   focusable and shows its exact figures on hover, focus and a tap (Tip). A
 *   day still to come, or a month the year does not offer, is empty. What a month counts on no day -- a
 *   movement spread over months (ADR 0052) -- is said under the days.
 * - The four totals -- income, spent, invested, kept -- each part marked in
 *   its tone in the ring (in the columns: income outlined, spent solid), then
 *   the summary: what was spent beyond the income, invested from earlier
 *   savings or sold beyond what was bought, the savings rates against the
 *   target (ADR 0045) -- or, where a percent says nothing, what was saved
 *   (savingsReading, ADR 0059) -- a missed target's shortfall, and one line
 *   splitting what was spent into fixed costs, their categories in a
 *   tooltip, and the rest (fixedCostSplit, ADR 0060).
 *
 * **On the right, always**, the breakdown: income, then spending, with the
 * composition of spending (spendingParts, each part with its tooltip) and,
 * in a year, each line's average month (lineAverages). No comparison with
 * the period before (ADR 0057). The lines are the ones the period lists
 * (periodFlows): a spending line only when it holds a counted movement, every
 * income line also at nothing, an Uncategorised line when it holds one. A
 * line's name with subcategories opens them, with what was spent in each --
 * and, last, what was filed on the line itself ("No subcategory"), so the
 * rows add up to the line -- and a link to the line's movements
 * (`?category=<line>`); a subcategory's name, the own row's and a line's
 * without any open their movements of the period in place (`movements`,
 * lineMovements, ADR 0052), the newest first and "and N more" linking to the
 * line's listing. A deposit's month of interest is one row of the line that
 * counts it (ADR 0056), naming its account (`accounts`).
 *
 * Read-only, and loading it calls neither the model nor an integration.
 *
 * @param {{
 *   flows: PeriodFlows & { months?: string[] },
 *   period: 'month' | 'year',
 *   view: import('@/lib/domain/addresses.js').FinancesView,
 *   twelveMonths: { income: number, spending: number } | null,
 *   target: number | null,
 *   columns: ChartColumns | null,
 *   invested: { bought: number, sold: number, net: number },
 *   averages: Map<string, number> | null,
 *   uncategorised: { spending: number, income: number },
 *   movements: Movements | null,
 *   accounts?: Pick<import('@/lib/domain/types.js').FinanceAccount, 'id' | 'name'>[],
 *   months: string[],
 *   month: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props `columns` only in the columns view, which draws them;
 *   `twelveMonths` the twelve months ending with the month (yearFlows), in a
 *   month only
 */
export default function FinanceFlows({ flows, period, view, twelveMonths, target, columns, invested, averages, uncategorised, movements, accounts = [], months, month, todayKey, place }) {
  const router = useRouter();
  /** @type {[PartKey | null, (key: PartKey | null) => void]} */
  const [active, setActive] = useState(/** @type {PartKey | null} */ (null));
  const year = yearOf(month);
  const circle = flowCircle(flows, invested);
  const label = period === 'year' ? year : monthLabel(month);
  /** @param {string} target */
  const go = (target) => router.push(target, { scroll: false });
  const yearAverages = period === 'year' ? averages : null;
  const quietLabel = period === 'year' ? 'this year' : 'this month';
  const shared = { quietLabel, averages: yearAverages, movements, accounts, todayKey, place };
  // Which lines are open, one state per table: the spending table's rows and
  // the composition bar's parts open the same lines (ADR 0060).
  const incomeOpen = useOpenLines(flows.incomeCategories, place, movements);
  const spendingOpen = useOpenLines(flows.spendingCategories, place, movements);
  const empty = circle.state === 'empty';
  const drawn = view === 'columns' ? columns : null;
  // The least a day's income is marked from, when a day of the month's columns reaches it.
  const floor =
    drawn !== null && drawn.kind === 'days' && dayBars(drawn.days, flows.income).some((bar) => bar !== null && bar.marked) ? dayMarkFloor(flows.income) : null;
  const breakdown = (
    <div className="finance-breakdown">
      <FlowTable
        title="Income"
        totalHead="Received"
        lines={flows.incomeCategories}
        uncategorised={flows.uncategorisedIncome}
        parts={[]}
        state={incomeOpen}
        {...shared}
      />
      <Composition flows={flows} state={spendingOpen} movements={movements} />
      <FlowTable
        title="Spending"
        totalHead="Spent"
        lines={flows.spendingCategories}
        uncategorised={flows.uncategorisedSpending}
        parts={spendingParts(flows)}
        state={spendingOpen}
        {...shared}
      />
      {yearAverages !== null && !empty && (
        <p className="caption finance-average-note">
          Average: per month over the {(flows.months?.length ?? 1) === 1 ? 'one month' : flows.months?.length + ' months'} of {year} on offer.
        </p>
      )}
    </div>
  );

  return (
    <article id="card-finance-flows" className="card">
      <div className="card-head">
        <span className="eyebrow">Income &amp; spending</span>
        {!empty && (
          <Segmented
            label="View"
            className="finance-view-switch"
            options={/** @type {const} */ (['circle', 'columns']).map((choice) => ({
              key: choice,
              href: financesHref({ ...place, view: choice }),
              on: view === choice,
              name: choice === 'circle' ? 'Circle' : 'Columns',
              children: choice === 'circle' ? <RingGlyph /> : <BarsGlyph />,
            }))}
          />
        )}
        <div className="finance-toolbar">
          <Segmented
            label="Period"
            options={/** @type {const} */ (['month', 'year']).map((choice) => ({
              key: choice,
              href: financesHref({ ...place, period: choice }),
              on: period === choice,
              children: choice === 'month' ? 'Month' : 'Year',
            }))}
          />
          <PeriodStepper period={period} month={month} months={months} place={place} go={go} />
        </div>
      </div>
      <div className="card-body">
        <UncategorisedLine counts={uncategorised} place={place} />

        {empty ? (
          <>
            <p className="caption">Nothing came in or went out in {label}.</p>
            {breakdown}
          </>
        ) : (
          <div className="finance-flow-body">
            <div className="finance-flow-side">
              {drawn !== null ? (
                drawn.kind === 'days' ? (
                  <DayColumns days={drawn.days} apart={drawn.apart} income={flows.income} month={month} todayKey={todayKey} />
                ) : (
                  <MonthColumns months={drawn.months} year={year} place={place} />
                )
              ) : (
                <Circle circle={circle} label={label} active={active} setActive={setActive} />
              )}
              <CircleTotals flows={flows} circle={circle} legend={drawn === null ? 'circle' : drawn.kind} floor={floor} setActive={setActive} />
              <Summary flows={flows} circle={circle} period={period} year={year} label={label} twelveMonths={twelveMonths} target={target} />
            </div>
            {breakdown}
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * The period's picker (docs/design/ui-rules.md, the stepper around a period):
 * the previous and next period on offer as arrows around the period itself,
 * which is the select -- so any month, or in a year any year, can still be
 * chosen directly. One joined box, as the segmented controls are. `months` is
 * newest first: the previous is the next one in it, the next the one before.
 * Previous is disabled at the oldest period on offer, next at the newest; an
 * arrow that leads somewhere is a link (`?month=`), and a year's goes to that
 * year's newest month on offer, as its select does.
 *
 * @param {{
 *   period: 'month' | 'year',
 *   month: string,
 *   months: string[],
 *   place: import('@/components/finance.js').FinancesPlace,
 *   go: (target: string) => void,
 * }} props
 */
function PeriodStepper({ period, month, months, place, go }) {
  const year = yearOf(month);
  const unit = period === 'year' ? 'year' : 'month';
  const steps = period === 'year' ? [...new Set(months.map(yearOf))] : months;
  const at = steps.indexOf(period === 'year' ? year : month);
  const older = at === -1 || at === steps.length - 1 ? null : steps[at + 1];
  const newer = at <= 0 ? null : steps[at - 1];
  /** @param {string} step a month, or in a year a year */
  const href = (step) =>
    financesHref({
      ...place,
      // A year reads its newest month on offer: months are newest first.
      month: period === 'year' ? (months.find((choice) => yearOf(choice) === step) ?? month) : step,
      transaction: null,
    });
  /** @param {string} step */
  const name = (step) => (period === 'year' ? step : monthLabel(step));
  /**
   * @param {string | null} step
   * @param {'Previous' | 'Next'} which
   */
  const arrow = (step, which) =>
    step === null ? (
      <button type="button" className="finance-step" disabled aria-label={which + ' ' + unit}>
        <ChevronGlyph back={which === 'Previous'} />
      </button>
    ) : (
      <Link href={href(step)} scroll={false} className="finance-step" aria-label={which + ' ' + unit + ', ' + name(step)}>
        <ChevronGlyph back={which === 'Previous'} />
      </Link>
    );

  return (
    <div className="finance-stepper">
      {arrow(older, 'Previous')}
      <select
        aria-label={period === 'year' ? 'Year' : 'Month'}
        className="input finance-month-picker"
        value={period === 'year' ? year : month}
        onChange={(event) => go(href(event.target.value))}
      >
        {steps.map((choice) => (
          <option key={choice} value={choice}>
            {name(choice)}
          </option>
        ))}
      </select>
      {arrow(newer, 'Next')}
    </div>
  );
}

/**
 * The toolbar's glyphs: tiny inline SVGs in the word's colour, hidden from a
 * screen reader, which has the word. A chevron for the stepper; a ring and
 * three bars for how the period is drawn.
 *
 * @param {{ back: boolean }} props
 */
function ChevronGlyph({ back }) {
  return (
    <svg className="seg-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d={back ? 'M10 3.5 5.5 8l4.5 4.5' : 'M6 3.5 10.5 8 6 12.5'} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RingGlyph() {
  return (
    <svg className="seg-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  );
}

function BarsGlyph() {
  return (
    <svg className="seg-glyph" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <rect x="2" y="7" width="3" height="7" rx="0.5" fill="currentColor" />
      <rect x="6.5" y="2" width="3" height="12" rx="0.5" fill="currentColor" />
      <rect x="11" y="5" width="3" height="9" rx="0.5" fill="currentColor" />
    </svg>
  );
}

/**
 * One line at the top when the period has counted movements on no category
 * (ADR 0048): how many, and a link to review them -- the Uncategorised line
 * of spending, of income, or one link each when both have some. Absent when
 * every movement has a category.
 *
 * @param {{ counts: { spending: number, income: number }, place: import('@/components/finance.js').FinancesPlace }} props
 */
function UncategorisedLine({ counts, place }) {
  const total = counts.spending + counts.income;
  if (total === 0) return null;
  /** @param {string} line */
  const review = (line) => financesHref({ ...place, category: line, tag: null, span: null, transaction: null });
  return (
    <p className="finance-review-line">
      <span className="num">{total}</span> {total === 1 ? 'movement' : 'movements'} without a category —{' '}
      {counts.spending > 0 && counts.income > 0 ? (
        <>
          review{' '}
          <Link href={review(UNCATEGORISED_SPENDING)} scroll={false} className="finance-account-link">
            {counts.spending} money out
          </Link>
          ,{' '}
          <Link href={review(UNCATEGORISED_INCOME)} scroll={false} className="finance-account-link">
            {counts.income} money in
          </Link>
        </>
      ) : (
        <Link href={review(counts.spending > 0 ? UNCATEGORISED_SPENDING : UNCATEGORISED_INCOME)} scroll={false} className="finance-account-link">
          review
        </Link>
      )}
    </p>
  );
}

/**
 * A month's columns, one per day (ADR 0053 amended, dayColumns, dayBars):
 * money out a solid bar the column's width, on a scale from zero to the
 * largest day's spending, printed beside it -- no top when nothing went out;
 * money in an outlined mark at the top of its day, not drawn to scale, since
 * a payday against days of tens would leave the spending a pixel high -- and
 * only from 1% of the month's income (dayMarkFloor), so a few cents of
 * interest are no mark; the day's tooltip and name say them anyway. Every
 * day of the month is a column, so the days stand at even steps across the
 * whole width; the 1st, 8th, 15th, 22nd and 29th are labelled. A day still to
 * come is an empty slot, not a column of zero. Each other day -- one with
 * only income too -- is focusable and shows its date and exact figures, both
 * amounts, on hover, focus and a tap.
 *
 * What the month counts on no day -- its part of a movement spread over
 * several months -- is said under the columns, so the days and that line add
 * up to the month's totals.
 *
 * @param {{
 *   days: DayColumn[],
 *   apart: { income: number, spending: number, movements: number },
 *   income: number,
 *   month: string,
 *   todayKey: string,
 * }} props `income`: the month's, which the marks' floor is a share of
 */
function DayColumns({ days, apart, income, month, todayKey }) {
  const bars = dayBars(days, income);
  return (
    <figure className="finance-columns is-days">
      <div className="finance-columns-frame">
        <div className="finance-columns-main">
          <div className="finance-columns-plot" role="group" aria-label={'Income and spending by day, ' + monthLabel(month)}>
            {days.map((row, index) => {
              const bar = bars[index];
              if (bar === null || row.income === null || row.spending === null) {
                return <span key={row.day} className="finance-column is-future" aria-hidden="true" />;
              }
              const date = shortDate(row.day, todayKey);
              const figures =
                row.movements === 0
                  ? null
                  : [
                      { label: 'Income', value: formatEuro(row.income, { cents: true }) },
                      { label: 'Spending', value: formatEuro(row.spending, { cents: true }) },
                    ];
              return (
                <Tip
                  key={row.day}
                  className="finance-column"
                  label={figures === null ? date + ': nothing counted' : date + ': ' + figures.map((each) => each.label.toLowerCase() + ' ' + each.value).join(', ')}
                  tip={<TipFigures head={date} rows={figures ?? []} note={figures === null ? 'Nothing counted' : null} />}
                >
                  {bar.marked && <span className="finance-column-mark" aria-hidden="true" />}
                  <span className="finance-column-bars" aria-hidden="true">
                    {row.spending > 0 && <i className="is-spending" style={{ height: bar.spending * 100 + '%' }} />}
                  </span>
                </Tip>
              );
            })}
          </div>
          <div className="finance-columns-ticks" aria-hidden="true">
            {days.map((row, index) =>
              DAY_TICKS.has(dayOfMonth(row.day)) ? (
                <span key={row.day} style={{ left: ((index + 0.5) / days.length) * 100 + '%' }}>
                  {dayOfMonth(row.day)}
                </span>
              ) : null
            )}
          </div>
        </div>
        <Scale high={dayHigh(days)} />
      </div>
      {apart.movements > 0 && (
        <figcaption className="caption finance-columns-apart">
          {apartLine(apart)}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * What a month counts on no day (ADR 0053): "€ 1,000.00 in and € 0.00 out
 * counted over several months, on no single day: in the totals, not the
 * columns."
 *
 * @param {{ income: number, spending: number, movements: number }} apart
 * @returns {string}
 */
function apartLine(apart) {
  const amounts = [
    ...(apart.income !== 0 ? [formatEuro(apart.income, { cents: true }) + ' in'] : []),
    ...(apart.spending !== 0 ? [formatEuro(apart.spending, { cents: true }) + ' out'] : []),
  ];
  const what = apart.movements === 1 ? '1 movement' : apart.movements + ' movements';
  return (
    (amounts.length === 0 ? what : amounts.join(' and ') + ' from ' + what) +
    ' counted over several months, on no single day: in the totals, not in the columns.'
  );
}

/**
 * A year's columns, one per month (ADR 0053, yearColumns): what the strip
 * across the top of the card drew before, in the year's twelve months --
 * income outlined, spending solid, always in that order, what was left a tick
 * on the income bar. A month on offer is a link that reads it, and shows its
 * figures on hover, focus and a first tap; one with nothing counted is an
 * outlined slot; a month the year does not offer is empty and no link.
 *
 * @param {{ months: YearColumn[], year: string, place: import('@/components/finance.js').FinancesPlace }} props
 */
function MonthColumns({ months, year, place }) {
  const bars = trendBars(months);
  return (
    <figure className="finance-columns is-months">
      <div className="finance-columns-frame">
        <div className="finance-columns-main">
          <div className="finance-columns-plot" role="group" aria-label={'Income and spending by month, ' + year}>
            {months.map((row, index) => {
              if (!row.offered) return <span key={row.month} className="finance-column is-future" aria-hidden="true" />;
              const bar = bars[index];
              const figures = monthFigures(row);
              return (
                <Tip
                  key={row.month}
                  href={financesHref({ ...place, month: row.month, period: 'month', transaction: null })}
                  className={'finance-column' + (bar === null ? ' is-empty' : '')}
                  label={trendLabel(row)}
                  tip={<TipFigures head={monthLabel(row.month)} rows={figures} note={figures.length === 0 ? 'Nothing recorded' : null} />}
                >
                  <span className="finance-column-bars" aria-hidden="true">
                    {bar !== null && (
                      <>
                        <i className="is-income" style={{ height: bar.income * 100 + '%' }} />
                        <i className="is-spending" style={{ height: bar.spending * 100 + '%' }} />
                        {bar.left !== null && <b className="finance-column-left" style={{ bottom: bar.left * 100 + '%' }} />}
                      </>
                    )}
                  </span>
                </Tip>
              );
            })}
          </div>
          <div className="finance-columns-ticks" aria-hidden="true">
            {months.map((row, index) =>
              index % MONTH_TICK_STEP === 0 ? (
                <span key={row.month} style={{ left: ((index + 0.5) / months.length) * 100 + '%' }}>
                  {monthShort(row.month)}
                </span>
              ) : null
            )}
          </div>
        </div>
        <Scale high={trendHigh(months)} />
      </div>
    </figure>
  );
}

/**
 * The columns' scale, beside them: zero at the bottom, the top of the scale
 * (trendHigh for months, dayHigh for days) at the top, short as an axis is.
 * A scale of nothing -- a month with income and no spending -- has no top: a
 * second "€ 0" would say nothing.
 *
 * @param {{ high: number }} props
 */
function Scale({ high }) {
  return (
    <div className="finance-columns-axis" aria-hidden="true">
      {high > 0 && <span className="is-top num">{formatEuroShort(high)}</span>}
      <span className="is-bottom num">{formatEuroShort(0)}</span>
    </div>
  );
}

/**
 * A month's exact figures, as its popover lists them: none when nothing was
 * recorded.
 *
 * @param {TrendMonth} row
 * @returns {{ label: string, value: string }[]}
 */
function monthFigures(row) {
  if (row.income === null || row.spending === null || row.left === null) return [];
  return [
    { label: 'Income', value: formatEuro(row.income, { cents: true }) },
    { label: 'Spending', value: formatEuro(row.spending, { cents: true }) },
    { label: 'Left', value: formatEuro(row.left, { cents: true }) },
  ];
}

/**
 * What a month of the columns says to a screen reader.
 *
 * @param {TrendMonth} row
 * @returns {string}
 */
function trendLabel(row) {
  const figures = monthFigures(row);
  if (figures.length === 0) return monthLabel(row.month) + ': nothing recorded';
  return monthLabel(row.month) + ': ' + figures.map((each) => each.label.toLowerCase() + ' ' + each.value).join(', ');
}

/**
 * The circle of the period (ADR 0050): an inline SVG ring whose whole is the
 * income, its parts drawn by circleArc from flowCircle's turns -- spent in
 * the ink, invested and kept in the lighter series tones -- and the
 * overspending as an arc outside the ring in the danger tone. Without income
 * it is an outlined ring with nothing on it.
 *
 * Each drawn part is focusable, named by its amount and its share of the
 * income (and has a native title); hovering or focusing it emphasises it,
 * dims the others and shows it in the centre. The centre otherwise says what
 * came in and when, or, overspent, by how much. It is hidden from a screen
 * reader: the parts' names and the totals under it say all of it.
 *
 * @param {{
 *   circle: FlowCircle,
 *   label: string,
 *   active: PartKey | null,
 *   setActive: (key: PartKey | null) => void,
 * }} props
 */
function Circle({ circle, label, active, setActive }) {
  const over = 'Spent ' + formatEuro(circle.overspent) + ' more than came in';
  const name =
    (circle.state === 'parts' ? 'What came in during ' + label + ', ' + formatEuro(circle.income) : 'Nothing came in during ' + label) +
    ': ' +
    circle.parts.map((part) => part.name.toLowerCase() + ' ' + formatEuro(part.amount)).join(', ') +
    (circle.overspent > 0 && circle.state === 'parts' ? '. ' + over : '');
  const shown = circle.parts.find((part) => part.key === active) ?? null;
  /** @param {PartKey} key */
  const hover = (key) => ({
    tabIndex: 0,
    role: 'img',
    onMouseEnter: () => setActive(key),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(key),
    onBlur: () => setActive(null),
  });

  return (
    <figure className="finance-circle">
      <div className="finance-circle-frame">
        <svg viewBox="0 0 120 120" role="group" aria-label={name} className={active === null ? undefined : 'has-active'}>
          <circle className={'finance-circle-track' + (circle.state === 'parts' ? '' : ' is-empty')} cx={CENTRE} cy={CENTRE} r={RING} />
          {circle.state === 'parts' &&
            circle.parts
              .filter((part) => part.end > part.start)
              .map((part) => {
                const partName = partLabel(part);
                return (
                  <path
                    key={part.key}
                    d={circleArc(part.start, part.end, RING, CENTRE)}
                    className={'finance-circle-part is-' + part.key + (active === part.key ? ' is-active' : '')}
                    {...hover(part.key)}
                    aria-label={partName}
                  >
                    <title>{partName}</title>
                  </path>
                );
              })}
          {circle.excess !== null && (
            <path
              d={circleArc(0, circle.excess, OUTER, CENTRE)}
              className={'finance-circle-excess' + (active === 'over' ? ' is-active' : '')}
              {...hover('over')}
              aria-label={over}
            >
              <title>{over}</title>
            </path>
          )}
        </svg>
        <div className="finance-circle-centre" aria-hidden="true">
          {active === 'over' ? (
            <>
              <span className="caption">Over</span>
              <span className="num finance-circle-amount">{formatEuro(circle.overspent)}</span>
              <span className="caption down">more than came in</span>
            </>
          ) : shown !== null ? (
            <>
              <span className="caption">{shown.name}</span>
              <span className="num finance-circle-amount">{formatEuro(shown.amount)}</span>
              <span className="caption">{shown.share === null ? '' : percent(shown.share) + ' of income'}</span>
            </>
          ) : circle.state === 'parts' ? (
            <>
              <span className="caption">{label}</span>
              <span className="num finance-circle-amount">{formatEuro(circle.income)}</span>
              {circle.overspent > 0 ? <span className="caption down">{over}</span> : <span className="caption">came in</span>}
            </>
          ) : (
            <>
              <span className="caption">{label}</span>
              <span className="caption">Nothing came in</span>
              {circle.parts[0].amount > 0 && <span className="caption down">{'Spent ' + formatEuro(circle.parts[0].amount)}</span>}
            </>
          )}
        </div>
      </div>
    </figure>
  );
}

/**
 * What a part of the circle says: its name, amount and share of the income.
 *
 * @param {CirclePart} part
 * @returns {string}
 */
function partLabel(part) {
  return part.name + ' ' + formatEuro(part.amount) + (part.share === null ? '' : ', ' + percent(part.share) + ' of income');
}

/**
 * The four totals under the chart (ADR 0050, amended; ADR 0053): what came
 * in, then what was spent, invested and kept. Whole euros, as the ring's
 * parts are named. Each is one row -- its mark, its name and its amount --
 * two by two, in the summary's row style, so the totals and the summary
 * under them read as one account (ADR 0053, amended). Under the circle each
 * part is marked in exactly its tone in the ring, and income, the whole ring,
 * has no mark; under the columns the totals are the columns' legend --
 * income outlined as money in is (a round mark under a month's days, where
 * it is a mark on its day, and none when no day carries one), spent solid as
 * money out is -- and invested and kept, which no column draws, have none. A
 * total without a mark keeps its place, so the names line up. When a month's
 * days mark income (`floor`, the least a marked day took in), the legend says
 * once from how much, and that it is not drawn to scale. Hovering a part's
 * total emphasises it in the circle.
 *
 * @param {{
 *   flows: PeriodFlows,
 *   circle: FlowCircle,
 *   legend: 'circle' | ChartColumns['kind'],
 *   floor: number | null,
 *   setActive: (key: PartKey | null) => void,
 * }} props
 */
function CircleTotals({ flows, circle, legend, floor, setActive }) {
  const columns = legend !== 'circle';
  const income = !columns ? null : legend === 'months' ? 'is-income' : floor !== null ? 'is-income is-mark' : null;
  /** @param {CirclePart['key']} key */
  const swatch = (key) => (columns ? (key === 'spent' ? 'is-spending' : null) : 'is-' + key);
  /** @param {string | null} tone */
  const mark = (tone) => <i className={'finance-swatch' + (tone === null ? '' : ' ' + tone)} aria-hidden="true" />;
  const totals = (
    <dl className="finance-circle-totals">
      <div className="finance-circle-total">
        <dt>
          {mark(income)}
          Income
        </dt>
        <dd className="num">{formatEuro(flows.income)}</dd>
      </div>
      {circle.parts.map((part) => (
        <div key={part.key} className="finance-circle-total" onMouseEnter={() => setActive(part.key)} onMouseLeave={() => setActive(null)}>
          <dt>
            {mark(swatch(part.key))}
            {part.name}
          </dt>
          <dd className="num">{formatEuro(part.amount)}</dd>
        </div>
      ))}
    </dl>
  );
  if (legend !== 'days' || floor === null) return totals;
  return (
    <div className="finance-circle-legend">
      {totals}
      <p className="caption finance-columns-note">{'Income of ' + formatEuro(floor) + ' or more is marked on its day, not drawn to scale.'}</p>
    </div>
  );
}

/**
 * The rest of the final account, under the four totals (ADRs 0050, 0053):
 * a note when spending passed the income, an investment came out of earlier
 * savings or more was sold than bought; the savings rates, each against the
 * target in words and a quiet mark, never colour alone (ADR 0045); what a
 * missed target needed in a year; and, under the list, what was spent split
 * into fixed costs and the rest (ADR 0060).
 *
 * @param {{
 *   flows: PeriodFlows,
 *   circle: FlowCircle,
 *   period: 'month' | 'year',
 *   year: string,
 *   label: string,
 *   twelveMonths: { income: number, spending: number } | null,
 *   target: number | null,
 * }} props `label` the period, as the circle names it
 */
function Summary({ flows, circle, period, year, label, twelveMonths, target }) {
  const shortfall = period === 'year' ? targetShortfall(flows, target) : null;
  const [spent, invested] = circle.parts;
  /** @param {CirclePart} part */
  const note = (part) => {
    if (part === spent && circle.overspent > 0) return { text: 'Spent ' + formatEuro(circle.overspent, { cents: true }) + ' more than came in', down: true };
    if (part === invested && circle.fromSavings > 0) {
      return {
        text: circle.fromSavings === invested.amount ? 'All of it from earlier savings' : formatEuro(circle.fromSavings, { cents: true }) + ' of it from earlier savings',
        down: false,
      };
    }
    if (part === invested && circle.sold > 0) return { text: 'Sold ' + formatEuro(circle.sold, { cents: true }) + ' more than bought', down: false };
    return null;
  };
  const notes = circle.parts.flatMap((part) => {
    const said = note(part);
    return said === null ? [] : [{ key: part.key, ...said }];
  });

  return (
    <div className="finance-summary is-beside">
      {notes.map((said) => (
        <p key={said.key} className={'caption finance-summary-note' + (said.down ? ' down' : '')}>
          {said.text}
        </p>
      ))}
      <dl>
        <Rate label={period === 'year' ? 'Saved in ' + year : 'Saved this month'} flows={flows} target={target}>
          {shortfall !== null && (
            <dd className="caption finance-target-note">
              To meet the {target}% target on what came in during {year}, <span className="num">{formatEuro(shortfall.needed, { cents: true })}</span>{' '}
              would have to be left: <span className="num">{formatEuro(shortfall.more, { cents: true })}</span> more.
            </dd>
          )}
        </Rate>
        {period === 'month' && twelveMonths !== null && <Rate label="Saved over 12 months" flows={twelveMonths} target={target} />}
      </dl>
      <FixedCostLine flows={flows} label={label} />
    </div>
  );
}

/**
 * Where a category is marked as a fixed cost, as the screen names it: the
 * Fixed box on its row in Manage's Categories fold (FinanceCategories).
 */
const FIXED_COST_NOTE = 'A category counts here when Fixed is ticked on it, under Manage › Categories.';

/**
 * What was spent, split into fixed costs and the rest (fixedCostSplit, ADR
 * 0060): "Of the € 751.41 spent: fixed costs € 227.94 · the rest € 523.47",
 * one quiet line under the summary's list that wraps on a phone. "fixed
 * costs" shows, on hover, focus and a tap (Tip), the period's fixed-cost
 * categories that spent, each with its amount -- adding up to the figure --
 * and where a category is marked as one. Nothing when nothing was spent or
 * none of it is a fixed cost: "fixed costs € 0.00" says nothing (ADR 0059).
 *
 * @param {{ flows: PeriodFlows, label: string }} props `label` the period, as the circle names it
 */
function FixedCostLine({ flows, label }) {
  const split = fixedCostSplit(flows);
  if (split === null) return null;
  const head = 'Fixed costs, ' + label;
  const rows = split.costs.map((cost) => ({ label: cost.name, value: formatEuro(cost.amount, { cents: true }) }));
  return (
    <p className="caption finance-summary-split">
      Of the <span className="num">{formatEuro(split.spent, { cents: true })}</span> spent:{' '}
      <Tip
        className="finance-term"
        label={head + ': ' + rows.map((row) => row.label + ' ' + row.value).join(', ') + '. ' + FIXED_COST_NOTE}
        tip={<TipFigures head={head} rows={rows} note={FIXED_COST_NOTE} />}
      >
        fixed costs
      </Tip>{' '}
      <span className="num">{formatEuro(split.fixed, { cents: true })}</span> · the rest{' '}
      <span className="num">{formatEuro(split.rest, { cents: true })}</span>
    </p>
  );
}

/**
 * A savings rate in the summary -- or, where a percent says nothing (no
 * income, or below −100%), what was saved, signed, in the summary's money
 * (savingsReading, ADR 0059); "—" with nothing in or out. With a target, a
 * line under it says whether it meets it -- in words, with a quiet mark
 * (filled when met, an outline when not), never colour alone (ADR 0045); a
 * blank one has none.
 *
 * @param {{ label: string, flows: { income: number, spending: number }, target: number | null, children?: import('react').ReactNode }} props
 */
function Rate({ label, flows, target, children = null }) {
  const { rate, saved, meets } = savingsReading(flows, target);
  return (
    <div className="finance-summary-row is-rate">
      <dt>{label}</dt>
      <dd className="num">{rate !== null ? percent(rate) : saved !== null ? formatEuro(saved, { cents: true }) : '—'}</dd>
      {target !== null && meets !== null && (
        <dd className="caption finance-target">
          <i className={'finance-target-mark' + (meets ? ' is-met' : '')} aria-hidden="true" />
          {(meets ? 'Meets' : 'Under') + ' the ' + target + '% target'}
        </dd>
      )}
      {children}
    </div>
  );
}

/**
 * One bar of the period's spending by top-level category, above the
 * spending table. Its legend is the spending table under it: each line with a part
 * carries the part's dot, and its share is already a column. Each part is a
 * mark that shows, on hover, keyboard focus and a tap (Tip, ADR 0053
 * amended), the category, what it spent and its share of the period's
 * spending, and is named by all three -- as the allocation bar's parts are.
 * A part too thin to point at is still a tab stop, and its line in the table
 * says the same.
 *
 * Each part is also the line's name (ADR 0060): a click, a tap, Enter or
 * Space opens its line in the spending table under it -- its subcategories,
 * or its movements -- as the row's name does, in the same state (`state`),
 * so a second press closes it; opened, the row is scrolled into view only
 * when it is outside it. A tap shows the figures too, and the opened row
 * says them anyway. A part whose line cannot open (no movements handed) is
 * no button. Every part is one line of the table: the bar folds nothing.
 *
 * @param {{ flows: PeriodFlows, state: OpenLines, movements: Movements | null }} props
 */
function Composition({ flows, state, movements }) {
  const parts = spendingParts(flows);
  if (parts.length < 2) return null;
  const lines = [...flows.spendingCategories, flows.uncategorisedSpending];
  return (
    <div className="alloc finance-composition" role="group" aria-label="Spending by category">
      {parts.map((part, index) => {
        const spent = formatEuro(part.amount, { cents: true });
        const share = percent(part.share);
        const line = lines.find((each) => each.id === part.id);
        const opener = line === undefined ? null : lineOpener(line, state, movements);
        return (
          <Tip
            key={part.id}
            as="i"
            style={{ width: part.share * 100 + '%', background: SERIES[index % SERIES.length] }}
            {...(opener === null
              ? {}
              : {
                  expanded: opener.open,
                  onPress: () => {
                    opener.toggle();
                    if (!opener.open) revealLine(part.id);
                  },
                })}
            label={part.name + ': spent ' + spent + ', ' + share + ' of spending'}
            tip={
              <TipFigures
                head={part.name}
                rows={[
                  { label: 'Spent', value: spent },
                  { label: 'Share of spending', value: share },
                ]}
              />
            }
          />
        );
      })}
    </div>
  );
}

/**
 * Which lines of a table are open: a line with subcategories into them
 * (`open`), a line without any -- or a subcategory, or a parent's own row --
 * into its movements (`opened`), each by id.
 *
 * @typedef {{
 *   open: Set<string>,
 *   opened: Set<string>,
 *   toggleOpen: (id: string) => void,
 *   toggleOpened: (id: string) => void,
 * }} OpenLines
 */

/**
 * A table's open lines, held above it so the composition bar opens the same
 * lines its rows do (ADR 0060). At first, a line with subcategories is open
 * when it -- or a subcategory, or its own row -- is the one selected
 * (`?category=`), and the selected line's movements are open when they were
 * handed.
 *
 * @param {CategoryFlow[]} lines
 * @param {import('@/components/finance.js').FinancesPlace} place
 * @param {Movements | null} movements
 * @returns {OpenLines}
 */
function useOpenLines(lines, place, movements) {
  const selected = place.category ?? null;
  /** @param {CategoryFlow} line */
  const holdsSelected = (line) =>
    selected !== null && [line, ...line.children, ...(line.own === null ? [] : [line.own])].some((each) => each.id === selected);
  const [open, setOpen] = useState(() => new Set(lines.filter((line) => line.children.length > 0 && holdsSelected(line)).map((line) => line.id)));
  const [opened, setOpened] = useState(() => new Set(selected !== null && movements?.has(selected) ? [selected] : []));
  /**
   * @param {(update: (current: Set<string>) => Set<string>) => void} set
   * @returns {(id: string) => void}
   */
  const toggler = (set) => (id) =>
    set((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return { open, opened, toggleOpen: toggler(setOpen), toggleOpened: toggler(setOpened) };
}

/**
 * How a top-level line opens, as its row's name opens it: into its
 * subcategories when it has any, else into its movements when they were
 * handed; null when it opens nothing (its row is then a link).
 *
 * @param {CategoryFlow} line
 * @param {OpenLines} state
 * @param {Movements | null} movements
 * @returns {{ open: boolean, toggle: () => void } | null}
 */
function lineOpener(line, state, movements) {
  if (line.children.length > 0) return { open: state.open.has(line.id), toggle: () => state.toggleOpen(line.id) };
  if (movements?.get(line.id) === undefined) return null;
  return { open: state.opened.has(line.id), toggle: () => state.toggleOpened(line.id) };
}

/**
 * Scrolls a top-level line's row into view once it has opened, only when it
 * is not already in view (`block: 'nearest'` moves nothing then).
 *
 * @param {string} id
 */
function revealLine(id) {
  requestAnimationFrame(() => {
    const row = [...document.querySelectorAll('tr[data-line]')].find((each) => each instanceof HTMLElement && each.dataset.line === id);
    row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

/**
 * One kind's table: name, Share -- "—" for a net refund, or when the whole
 * is not positive (lineShare, ADR 0059) -- in a year the line's average month
 * (`averages`), and the amount, always last (ADR 0050, 0057). Its lines are
 * the ones the period lists (periodFlows); the Uncategorised line when it
 * holds a counted movement. A line with subcategories opens into them by its
 * name, then its own row ("No subcategory", `line.own`) when something is
 * filed on the line itself; one whose subcategory, own row -- or itself -- is
 * selected opens by itself. A subcategory's name, the own row's and a line's
 * with none open their movements of the period in place (ADR 0052), as does
 * selecting one. Which lines are open is `state`, held above the table
 * (useOpenLines), so the composition bar opens the same ones (ADR 0060).
 *
 * @param {{
 *   title: string,
 *   totalHead: string,
 *   lines: CategoryFlow[],
 *   quietLabel: string,
 *   uncategorised: CategoryFlow,
 *   parts: { id: string }[],
 *   state: OpenLines,
 *   averages: Map<string, number> | null,
 *   movements: Movements | null,
 *   accounts: Pick<import('@/lib/domain/types.js').FinanceAccount, 'id' | 'name'>[],
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function FlowTable({ title, totalHead, lines, quietLabel, uncategorised, parts, state, averages, movements, accounts, todayKey, place }) {
  const showUncategorised = uncategorised.movements > 0;
  const { open, opened } = state;
  if (lines.length === 0 && !showUncategorised) return null;

  /** @param {string} id */
  const tone = (id) => {
    const at = parts.findIndex((part) => part.id === id);
    return parts.length < 2 || at === -1 ? null : SERIES[at % SERIES.length];
  };
  const width = 3 + (averages === null ? 0 : 1);
  const shared = { place, averages };
  /** @param {string} id */
  const listing = (id) => financesHref({ ...place, category: id, tag: null, span: null, transaction: null });
  /**
   * A line whose name opens its movements: its row and, open, the movements.
   *
   * @param {CategoryFlow} line
   * @param {boolean} child
   */
  const leaf = (line, child) => {
    const list = movements?.get(line.id);
    const shown = list !== undefined && opened.has(line.id);
    return [
      <FlowRow
        key={line.id}
        line={line}
        tone={child ? null : tone(line.id)}
        child={child}
        open={shown}
        onToggle={list === undefined ? null : () => state.toggleOpened(line.id)}
        {...shared}
      />,
      ...(shown ? movementRows(line, list, child) : []),
    ];
  };
  /**
   * @param {CategoryFlow} line
   * @param {LineList} list
   * @param {boolean} deep under a subcategory
   */
  const movementRows = (line, list, deep) => [
    ...(list.rows.length === 0
      ? [
          <tr key={line.id + ':none'} className={'finance-movement-row' + (deep ? ' is-deep' : '')}>
            <td colSpan={width} className="caption">
              No movements {quietLabel}
            </td>
          </tr>,
        ]
      : list.rows.map((row) =>
          'kind' in row ? (
            <InterestRow key={line.id + ':' + row.id} run={row} accounts={accounts} span={width - 1} deep={deep} todayKey={todayKey} place={place} />
          ) : (
            <MovementRow key={line.id + ':' + row.id} row={row} span={width - 1} deep={deep} todayKey={todayKey} place={place} />
          )
        )),
    // A paired refund and a purchase all of which came back, left out as
    // the Transactions card leaves them out (ADR 0055).
    ...((list.refunded ?? 0) > 0
      ? [
          <tr key={line.id + ':refunded'} className={'finance-movement-row' + (deep ? ' is-deep' : '')}>
            <td colSpan={width}>
              <RefundedLine count={list.refunded ?? 0} place={place} as="span" />
            </td>
          </tr>,
        ]
      : []),
    // A deposit's interest, folded by account and month (ADR 0056).
    ...((list.interest ?? 0) > 0
      ? [
          <tr key={line.id + ':interest'} className={'finance-movement-row' + (deep ? ' is-deep' : '')}>
            <td colSpan={width}>
              <InterestLine count={list.interest ?? 0} place={place} as="span" />
            </td>
          </tr>,
        ]
      : []),
    <tr key={line.id + ':listing'} className={'finance-movement-row finance-movements-row' + (deep ? ' is-deep' : '')}>
      <td colSpan={width}>
        <Link href={listing(line.id)} scroll={false} className="finance-account-link" aria-current={place.category === line.id ? 'true' : undefined}>
          {list.more > 0 ? 'and ' + list.more + ' more' : ownLineParent(line.id) !== null ? 'Movements with no subcategory' : 'Movements in ' + line.name}
        </Link>
      </td>
    </tr>,
  ];
  /** @param {CategoryFlow} line */
  const rows = (line) => {
    if (line.children.length === 0) return leaf(line, false);
    const expanded = open.has(line.id);
    return [
      <FlowRow
        key={line.id}
        line={line}
        tone={tone(line.id)}
        open={expanded}
        onToggle={() => state.toggleOpen(line.id)}
        {...shared}
      />,
      ...(expanded
        ? [
            ...line.children.flatMap((child) => leaf(child, true)),
            // What is filed on the line itself, so the rows add up to it (ADR 0057).
            ...(line.own === null ? [] : leaf(line.own, true)),
            <tr key={line.id + ':movements'} className="is-child finance-movements-row">
              <td colSpan={width}>
                <Link href={listing(line.id)} scroll={false} className="finance-account-link" aria-current={place.category === line.id ? 'true' : undefined}>
                  Movements in {line.name}
                </Link>
              </td>
            </tr>,
          ]
        : []),
    ];
  };

  return (
    <div className="finance-table-scroll">
      <table className={'finance-table finance-flow-table' + (averages !== null ? ' is-year' : '')}>
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Share</th>
            {averages !== null && <th className="num">Average</th>}
            <th className="num">{totalHead}</th>
          </tr>
        </thead>
        <tbody>
          {lines.flatMap(rows)}
          {showUncategorised && leaf(uncategorised, false)}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One movement a line opened in place (ADR 0052): the day it was paid, its
 * description -- the link to its panel -- and its amount, signed as the
 * Transactions card signs it (MovementAmount). A movement counted over
 * several months shows the month (or months) of the period it counts in
 * instead of a day, its part of the amount, and says which of its months
 * this is and when it was paid: "2 of 3 · paid 15 Apr". One end of a refund
 * pair (ADR 0055) says what it is, as in the Transactions card (refundNote):
 * a purchase partly refunded, hidden pair, shows what is left of it. One
 * line, the description cut first, the note never.
 *
 * @param {{
 *   row: LineMovement,
 *   span: number,
 *   deep: boolean,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function MovementRow({ row, span, deep, todayKey, place }) {
  const description = row.description === '' ? '(no description)' : row.description;
  const paid = shortDate(row.date, todayKey);
  const spread = row.spread;
  const note =
    spread === null
      ? null
      : (spread.of === 1 ? '' : spread.count === 1 ? spread.index + ' of ' + spread.of + ' · ' : spread.count + ' of ' + spread.of + ' months · ') +
        'paid ' + paid;
  const selected = place.transaction === row.id;
  const refund = refundNote(row.refund ?? null, place.refunded === 'show');
  return (
    <tr className={'finance-movement-row' + (deep ? ' is-deep' : '') + (selected ? ' is-selected' : '')}>
      <td colSpan={span}>
        <span className="finance-movement">
          <span className="num finance-date">{spread === null ? paid : monthSpan(spread.first, spread.last)}</span>
          <Link
            href={financesHref({ ...place, transaction: row.id })}
            scroll={false}
            className="finance-account-link finance-cut-text"
            title={description}
            aria-current={selected ? 'true' : undefined}
          >
            {description}
          </Link>
          {note !== null && <span className="caption">· {note}</span>}
          {refund !== null && <span className="caption">· {refund}</span>}
        </span>
      </td>
      <MovementAmount amount={row.amount} />
    </tr>
  );
}

/**
 * A deposit's month of interest folded into one row of the line that counts
 * it (ADR 0056): its newest day, "Interest · 31 days" -- the link that lists
 * the month's movements one by one (`?interest=show`) -- its account, and
 * what the line counts of it, signed as any movement. Selected while it
 * holds the selected movement.
 *
 * @param {{
 *   run: InterestRun,
 *   accounts: Pick<import('@/lib/domain/types.js').FinanceAccount, 'id' | 'name'>[],
 *   span: number,
 *   deep: boolean,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function InterestRow({ run, accounts, span, deep, todayKey, place }) {
  const account = accounts.find((row) => row.id === run.accountId)?.name ?? null;
  const what = run.count === 1 ? '1 interest movement' : run.count + ' interest movements';
  const selected = place.transaction !== null && place.transaction !== undefined && run.ids.includes(place.transaction);
  return (
    <tr className={'finance-movement-row' + (deep ? ' is-deep' : '') + (selected ? ' is-selected' : '')}>
      <td colSpan={span}>
        <span className="finance-movement">
          <span className="num finance-date">{shortDate(run.date, todayKey)}</span>
          <Link
            href={financesHref({ ...place, interest: 'show' })}
            scroll={false}
            className="finance-account-link finance-cut-text"
            title={'Show the ' + what + ' one by one'}
          >
            {interestRunLabel(run)}
          </Link>
          {account !== null && <span className="caption">· {account}</span>}
        </span>
      </td>
      <MovementAmount amount={run.amount} />
    </tr>
  );
}

/**
 * A line of a table. Its name is the control: a button, a ▸ before it and
 * `aria-expanded`, that opens its subcategories or, for a line with none,
 * its movements; without anything to open (no movements were handed), a
 * link that lists its movements in the Transactions card. A top-level line's
 * row carries its id (`data-line`), so the composition bar can bring it into
 * view (ADR 0060).
 *
 * @param {{
 *   line: CategoryFlow,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   averages: Map<string, number> | null,
 *   tone?: string | null,
 *   child?: boolean,
 *   open?: boolean,
 *   onToggle?: (() => void) | null,
 * }} props
 */
function FlowRow({ line, place, averages, tone = null, child = false, open = false, onToggle = null }) {
  const selected = place.category === line.id;
  const average = averages?.get(line.id);
  return (
    <tr className={(selected ? 'is-selected' : '') + (child ? ' is-child' : '') || undefined} data-line={child ? undefined : line.id}>
      <td title={line.name}>
        {tone !== null && <i className="dot finance-part-dot" style={{ color: tone }} aria-hidden="true" />}
        {onToggle !== null ? (
          <button type="button" className="finance-line-toggle" aria-expanded={open} onClick={onToggle}>
            <span className="finance-line-mark" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            {line.name}
          </button>
        ) : (
          <Link
            href={financesHref({ ...place, category: line.id, tag: null, span: null, transaction: null })}
            scroll={false}
            className="finance-account-link"
            aria-current={selected ? 'true' : undefined}
          >
            {line.name}
          </Link>
        )}
      </td>
      <td className="num caption">{line.share === null ? '—' : percent(line.share)}</td>
      {averages !== null && <td className="num caption">{average === undefined ? '' : formatMoney(average, { cents: true })}</td>}
      <td className="num">{formatMoney(line.total, { cents: true })}</td>
    </tr>
  );
}
