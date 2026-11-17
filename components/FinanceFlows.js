'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { financesHref, MovementAmount } from '@/components/finance.js';
import {
  formatEuro,
  formatEuroShort,
  formatMoney,
  formatMoneyChange,
  formatRate,
  monthLabel,
  monthShort,
  monthSpan,
  percent,
  shortDate,
} from '@/components/format.js';
import { shiftMonth, yearOf } from '@/lib/domain/dates.js';
import {
  circleArc,
  flowCircle,
  foldedLines,
  meetsSavingsTarget,
  savingsRate,
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
/** @typedef {import('@/lib/domain/derive/finance.js').FlowCircle} FlowCircle */
/** @typedef {import('@/lib/domain/derive/finance.js').CirclePart} CirclePart */
/** @typedef {import('@/lib/domain/derive/finance.js').LineMovement} LineMovement */
/** @typedef {Map<string, { rows: LineMovement[], more: number }>} Movements each line's movements of the period, by line id */
/** @typedef {CirclePart['key'] | 'over'} PartKey what the circle can emphasise */

/**
 * The parts of a whole in a chart (docs/design/ui-rules.md): the composition
 * bar's parts cycle through them, in the table's order.
 */
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'];

/** The circle's geometry, in its 120-unit view box: the ring and, outside it, the overspending's arc. */
const CENTRE = 60;
const RING = 44;
const OUTER = 56;

/**
 * The Income & spending section of the Finances screen (#137): what came in,
 * where it went and what was left, for a month (`?month=YYYY-MM`,
 * monthFlows) or, with `?period=year`, that month's calendar year to date
 * (calendarYearFlows).
 *
 * Top to bottom (ADR 0050): the head -- Month / Year, the month or year
 * picker, and Circle / Table (`?view=table`; the circle is the default and
 * never written); the one line counting movements without a category
 * (uncategorisedCounts, ADR 0048); the trend, income and spending as bars
 * over the twelve months around the selected one or the year's, each month a
 * link that reads it (ADR 0048); and the body.
 *
 * The body, in the circle view, has no table and no row of income or
 * spending (ADR 0050, amended): on the left the circle with its four totals
 * under it -- income, spent, invested, kept, each part marked in its tone in
 * the ring, income, the whole ring, unmarked -- and on its right the rest of
 * the summary: what was spent beyond the income, invested from earlier
 * savings or sold beyond what was bought, the savings rates against the
 * target (ADR 0045), a missed target's shortfall, fixed vs variable. Side by
 * side down to 560 px, stacked under. The circle (flowCircle) is the
 * period's income split, clockwise from the top, into what was spent,
 * invested (periodInvested, from the trades) and kept; spending beyond the
 * income is an arc outside the ring in the danger tone, and said in words.
 * Hovering or focusing a part shows it in the centre; hovering a total
 * emphasises its part.
 *
 * In the table view the body is the breakdown: income, then spending, with
 * the composition of spending (spendingParts) and the comparison columns --
 * the change from last month, or in a year each line's average month
 * (lineAverages) and the change from the same months of last year -- then the
 * whole summary as the final account. A line's name with subcategories opens
 * them, with what was spent in each and a link to the line's movements
 * (`?category=<line>`); a subcategory's name, and a line's without any,
 * opens its movements of the period in place (`movements`, lineMovements,
 * ADR 0052), the newest first and "and N more" linking to the line's
 * listing. The lines with nothing in the period fold into one row at the end
 * of their table (foldedLines, ADR 0048).
 *
 * Read-only, and loading it calls neither the model nor an integration.
 *
 * @param {{
 *   flows: PeriodFlows & { months?: string[] },
 *   period: 'month' | 'year',
 *   view: import('@/lib/domain/addresses.js').FinancesView,
 *   yearRate: number | null,
 *   target: number | null,
 *   trend: TrendMonth[],
 *   invested: { bought: number, sold: number, net: number },
 *   averages: Map<string, number> | null,
 *   uncategorised: { spending: number, income: number },
 *   movements: Movements | null,
 *   months: string[],
 *   month: string,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 *   `movements` only in the table view, which shows them
 */
export default function FinanceFlows({ flows, period, view, yearRate, target, trend, invested, averages, uncategorised, movements, months, month, todayKey, place }) {
  const router = useRouter();
  /** @type {[PartKey | null, (key: PartKey | null) => void]} */
  const [active, setActive] = useState(/** @type {PartKey | null} */ (null));
  const year = yearOf(month);
  const circle = flowCircle(flows, invested);
  const label = period === 'year' ? year : monthLabel(month);
  const years = [...new Set(months.map(yearOf))];
  const table = view === 'table';
  /** @param {string} target */
  const go = (target) => router.push(target, { scroll: false });
  const columns = {
    change: table ? (period === 'year' ? 'vs ' + yearOf(shiftMonth(month, -12)) : 'vs last month') : null,
    averages: table && period === 'year' ? averages : null,
  };
  const quietLabel = period === 'year' ? 'this year' : 'this month';
  const shared = { quietLabel, columns, compared: flows.compared, movements, todayKey, place };
  const empty = circle.state === 'empty';
  const summary = { flows, circle, period, year, yearRate, target, setActive };

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
          <div className="segmented" role="group" aria-label="View">
            {/** @type {const} */ (['circle', 'table']).map((choice) => (
              <Link
                key={choice}
                href={financesHref({ ...place, view: choice })}
                scroll={false}
                className={'seg' + (view === choice ? ' is-on' : '')}
                aria-current={view === choice ? 'true' : undefined}
              >
                {choice === 'circle' ? 'Circle' : 'Table'}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <div className="card-body">
        <UncategorisedLine counts={uncategorised} place={place} />
        <Trend trend={trend} period={period} month={month} place={place} />

        {empty && <p className="caption">Nothing came in or went out in {label}.</p>}
        {table ? (
          <div className="finance-breakdown">
            <FlowTable
              title="Income"
              totalHead="Received"
              table={foldedLines(flows.incomeCategories, flows.uncategorisedIncome, listed(flows.uncategorisedIncome))}
              uncategorised={flows.uncategorisedIncome}
              parts={[]}
              {...shared}
            />
            <Composition flows={flows} />
            <FlowTable
              title="Spending"
              totalHead="Spent"
              table={foldedLines(flows.spendingCategories, flows.uncategorisedSpending, listed(flows.uncategorisedSpending))}
              uncategorised={flows.uncategorisedSpending}
              parts={spendingParts(flows)}
              {...shared}
            />
            {columns.averages !== null && !empty && (
              <p className="caption finance-average-note">
                Average: per month over the {(flows.months?.length ?? 1) === 1 ? 'one month' : flows.months?.length + ' months'} of {year} on offer.
              </p>
            )}
            {!empty && <Summary {...summary} totals />}
          </div>
        ) : (
          !empty && (
            <div className="finance-flow-body">
              <div className="finance-circle-side">
                <Circle circle={circle} label={label} active={active} setActive={setActive} />
                <CircleTotals flows={flows} circle={circle} setActive={setActive} />
              </div>
              <div className="finance-breakdown">
                <Summary {...summary} totals={false} />
              </div>
            </div>
          )
        )}
      </div>
    </article>
  );
}

/**
 * Whether a table lists its Uncategorised line: when it has money in the
 * period or the one before, as monthFlows lists a category.
 *
 * @param {CategoryFlow} line
 * @returns {boolean}
 */
function listed(line) {
  return line.total !== 0 || line.previous !== 0;
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
 * The trend (ADR 0044): per month, income and spending as two bars against
 * the highest drawn, and what was left as a tick on the income bar, on a
 * scale from zero to the top, printed beside it. Money in is an outlined bar,
 * money out a solid one, always in that order (ADR 0048), so they tell apart
 * without the legend. A month with nothing counted is an outlined slot,
 * never a bar of zero.
 *
 * Each month is a link that reads it; its name says its figures, so the
 * chart has a text equivalent. When narrow it scrolls inside the card and
 * opens at its newest end -- a right-to-left scroll box, so CSS alone puts it
 * there before any script runs -- and a selected month further back is
 * brought into view by moving that box, never the page.
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
      <div className="finance-trend-frame">
        <div className="finance-trend-scroll">
          <div className="finance-trend-plot" role="group" aria-label="Income and spending by month">
            {trend.map((row, index) => {
              const bar = bars[index];
              const selected = period === 'month' && row.month === month;
              const newYear = index === 0 || yearOf(row.month) !== yearOf(trend[index - 1].month);
              return (
                <Link
                  key={row.month}
                  ref={selected ? revealInTrend : undefined}
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
        </div>
        <div className="finance-trend-axis" aria-hidden="true">
          <span className="is-top num">{formatEuroShort(trendHigh(trend))}</span>
          <span className="is-bottom num">{formatEuroShort(0)}</span>
        </div>
      </div>
      <figcaption className="legend">
        <span>
          <i className="finance-swatch is-income" />
          Income, money in
        </span>
        <span>
          <i className="finance-swatch is-spending" />
          Spending, money out
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
 * Brings the selected month into view inside the trend's own scroll box,
 * which opens at its newest end, when it is not already -- by moving that box
 * only, never the page. A ref callback: it runs once, as the link mounts.
 *
 * @param {HTMLAnchorElement | null} link
 */
function revealInTrend(link) {
  const box = link?.closest('.finance-trend-scroll');
  if (!link || !(box instanceof HTMLElement)) return;
  const at = link.getBoundingClientRect();
  const view = box.getBoundingClientRect();
  if (at.left < view.left) box.scrollLeft -= view.left - at.left;
  else if (at.right > view.right) box.scrollLeft += at.right - view.right;
}

/**
 * What a month of the bars says to a screen reader.
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
 * reader: the parts' names and the summary beside it say all of it.
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
 * The four totals under the circle (ADR 0050, amended): what came in, then
 * what was spent, invested and kept. Each part is marked in exactly its tone
 * in the ring; income is the whole ring, so it has no mark. Whole euros, as
 * the ring's parts are named. Hovering a part's total emphasises it in the
 * circle.
 *
 * @param {{ flows: PeriodFlows, circle: FlowCircle, setActive: (key: PartKey | null) => void }} props
 */
function CircleTotals({ flows, circle, setActive }) {
  return (
    <dl className="finance-circle-totals">
      <div className="finance-circle-total">
        <dt>Income</dt>
        <dd className="num">{formatEuro(flows.income)}</dd>
      </div>
      {circle.parts.map((part) => (
        <div key={part.key} className="finance-circle-total" onMouseEnter={() => setActive(part.key)} onMouseLeave={() => setActive(null)}>
          <dt>
            <i className={'finance-swatch is-' + part.key} aria-hidden="true" />
            {part.name}
          </dt>
          <dd className="num">{formatEuro(part.amount)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The final account (ADR 0050). In the table view, under the tables: income,
 * then what was spent, invested and kept, each with a note when spending
 * passed the income, an investment came out of earlier savings or more was
 * sold than bought. In the circle view, beside the circle, whose totals
 * already say the four amounts: only those notes. Then, in both, the
 * savings rates, each against the target in words and a quiet mark, never
 * colour alone (ADR 0045), what a missed target needed in a year, and fixed
 * vs variable. Hovering a part's row emphasises it in the circle.
 *
 * @param {{
 *   flows: PeriodFlows,
 *   circle: FlowCircle,
 *   period: 'month' | 'year',
 *   year: string,
 *   yearRate: number | null,
 *   target: number | null,
 *   totals: boolean,
 *   setActive: (key: PartKey | null) => void,
 * }} props
 */
function Summary({ flows, circle, period, year, yearRate, target, totals, setActive }) {
  const rate = savingsRate(flows);
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
  const notes = totals
    ? []
    : circle.parts.flatMap((part) => {
        const said = note(part);
        return said === null ? [] : [{ key: part.key, ...said }];
      });

  return (
    <div className={'finance-summary' + (totals ? '' : ' is-beside')}>
      {notes.map((said) => (
        <p key={said.key} className={'caption finance-summary-note' + (said.down ? ' down' : '')}>
          {said.text}
        </p>
      ))}
      <dl>
        {totals && (
          <div className="finance-summary-row">
            <dt>Income</dt>
            <dd className="num">{formatEuro(flows.income, { cents: true })}</dd>
          </div>
        )}
        {totals && circle.parts.map((part) => {
          const said = note(part);
          return (
            <div key={part.key} className="finance-summary-row" onMouseEnter={() => setActive(part.key)} onMouseLeave={() => setActive(null)}>
              <dt>{part.name}</dt>
              <dd className="num">{formatEuro(part.amount, { cents: true })}</dd>
              {said !== null && <dd className={'caption finance-summary-note' + (said.down ? ' down' : '')}>{said.text}</dd>}
            </div>
          );
        })}
        <Rate label={period === 'year' ? 'Saved in ' + year : 'Saved this month'} rate={rate} target={target}>
          {shortfall !== null && (
            <dd className="caption finance-target-note">
              To meet the {target}% target on what came in during {year}, <span className="num">{formatEuro(shortfall.needed, { cents: true })}</span>{' '}
              would have to be left: <span className="num">{formatEuro(shortfall.more, { cents: true })}</span> more.
            </dd>
          )}
        </Rate>
        {period === 'month' && <Rate label="Saved over 12 months" rate={yearRate} target={target} />}
        <div className="finance-summary-row is-quiet">
          <dt>Fixed</dt>
          <dd className="num">{formatEuro(flows.fixed, { cents: true })}</dd>
        </div>
        <div className="finance-summary-row is-quiet">
          <dt>Variable</dt>
          <dd className="num">{formatEuro(flows.variable, { cents: true })}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * A savings rate in the summary. With a target, a line under it says
 * whether it meets it -- in words, with a quiet mark (filled when met, an
 * outline when not), never colour alone (ADR 0045); a blank rate has none.
 *
 * @param {{ label: string, rate: number | null, target: number | null, children?: import('react').ReactNode }} props
 */
function Rate({ label, rate, target, children = null }) {
  const meets = meetsSavingsTarget(rate, target);
  return (
    <div className="finance-summary-row is-rate">
      <dt>{label}</dt>
      <dd className="num">{formatRate(rate)}</dd>
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
 * One bar of the period's spending by top-level category, in the table
 * view. Its legend is the spending table under it: each line with a part
 * carries the part's dot, and its share is already a column. The bar's own
 * name lists the parts.
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

/**
 * The columns a table shows besides the name, Share and the amount, which
 * is always last (ADR 0050): in the table view the change from the period
 * before, headed by it, and in a year each line's average month.
 *
 * @typedef {{ change: string | null, averages: Map<string, number> | null }} Columns
 */

/**
 * One kind's table. A line with subcategories opens into them by its name;
 * one whose subcategory -- or itself -- is selected opens by itself. A
 * subcategory's name, and a line's with none, opens its movements of the
 * period in place (ADR 0052), as does selecting it. The lines with nothing
 * in the period sit folded in one row at the end, "N categories with nothing
 * this month", which opens to show them -- by itself when the selected line
 * is one of them.
 *
 * @param {{
 *   title: string,
 *   totalHead: string,
 *   table: ReturnType<typeof foldedLines>,
 *   quietLabel: string,
 *   uncategorised: CategoryFlow,
 *   parts: { id: string }[],
 *   columns: Columns,
 *   compared: boolean,
 *   movements: Movements | null,
 *   todayKey: string,
 *   place: import('@/components/finance.js').FinancesPlace,
 * }} props
 */
function FlowTable({ title, totalHead, table, quietLabel, uncategorised, parts, columns, compared, movements, todayKey, place }) {
  const { lines, quiet, showUncategorised } = table;
  /** @param {CategoryFlow} line */
  const holdsSelected = (line) => line.id === place.category || line.children.some((child) => child.id === place.category);
  const [open, setOpen] = useState(
    () => new Set([...lines, ...quiet].filter((line) => line.children.length > 0 && holdsSelected(line)).map((line) => line.id))
  );
  const [opened, setOpened] = useState(() => new Set(place.category !== null && place.category !== undefined && movements?.has(place.category) ? [place.category] : []));
  const [showQuiet, setShowQuiet] = useState(() => quiet.some(holdsSelected));
  if (lines.length === 0 && quiet.length === 0 && !showUncategorised) return null;

  /**
   * @param {(update: (current: Set<string>) => Set<string>) => void} set
   * @param {string} id
   */
  const toggle = (set, id) =>
    set((current) => {
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
  const width = 3 + (columns.averages === null ? 0 : 1) + (columns.change === null ? 0 : 1);
  const shared = { place, columns, compared };
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
        onToggle={list === undefined ? null : () => toggle(setOpened, line.id)}
        {...shared}
      />,
      ...(shown ? movementRows(line, list, child) : []),
    ];
  };
  /**
   * @param {CategoryFlow} line
   * @param {{ rows: LineMovement[], more: number }} list
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
      : list.rows.map((row) => (
          <MovementRow key={line.id + ':' + row.id} row={row} span={width - 1} deep={deep} todayKey={todayKey} place={place} />
        ))),
    <tr key={line.id + ':listing'} className={'finance-movement-row finance-movements-row' + (deep ? ' is-deep' : '')}>
      <td colSpan={width}>
        <Link href={listing(line.id)} scroll={false} className="finance-account-link" aria-current={place.category === line.id ? 'true' : undefined}>
          {list.more > 0 ? 'and ' + list.more + ' more' : 'Movements in ' + line.name}
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
        onToggle={() => toggle(setOpen, line.id)}
        {...shared}
      />,
      ...(expanded
        ? [
            ...line.children.flatMap((child) => leaf(child, true)),
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
      <table className={'finance-table finance-flow-table' + (width > 3 ? ' is-wide' : '')}>
        <thead>
          <tr>
            <th>{title}</th>
            <th className="num">Share</th>
            {columns.averages !== null && <th className="num">Average</th>}
            {columns.change !== null && <th className="num">{columns.change}</th>}
            <th className="num">{totalHead}</th>
          </tr>
        </thead>
        <tbody>
          {lines.flatMap(rows)}
          {showUncategorised && leaf(uncategorised, false)}
          {quiet.length > 0 && (
            <tr className="finance-quiet-row">
              <td colSpan={width}>
                <button type="button" className="finance-quiet-toggle" aria-expanded={showQuiet} onClick={() => setShowQuiet((shown) => !shown)}>
                  <span className="finance-quiet-mark" aria-hidden="true">
                    {showQuiet ? '▾' : '▸'}
                  </span>
                  {quiet.length === 1 ? '1 category' : quiet.length + ' categories'} with nothing {quietLabel}
                </button>
              </td>
            </tr>
          )}
          {showQuiet && quiet.flatMap(rows)}
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
 * this is and when it was paid: "2 of 3 · paid 15 Apr". One line, the
 * description cut first, the note never.
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
        </span>
      </td>
      <MovementAmount amount={row.amount} />
    </tr>
  );
}

/**
 * A line of a table. Its name is the control: a button, a ▸ before it and
 * `aria-expanded`, that opens its subcategories or, for a line with none,
 * its movements; without anything to open (no movements were handed), a
 * link that lists its movements in the Transactions card.
 *
 * @param {{
 *   line: CategoryFlow,
 *   place: import('@/components/finance.js').FinancesPlace,
 *   columns: Columns,
 *   compared: boolean,
 *   tone?: string | null,
 *   child?: boolean,
 *   open?: boolean,
 *   onToggle?: (() => void) | null,
 * }} props
 */
function FlowRow({ line, place, columns, compared, tone = null, child = false, open = false, onToggle = null }) {
  const selected = place.category === line.id;
  const average = columns.averages?.get(line.id);
  return (
    <tr className={(selected ? 'is-selected' : '') + (child ? ' is-child' : '') || undefined}>
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
      <td className="num caption">{percent(line.share)}</td>
      {columns.averages !== null && <td className="num caption">{average === undefined ? '' : formatMoney(average, { cents: true })}</td>}
      {columns.change !== null && <td className="num">{compared ? formatMoneyChange(line.change) : ''}</td>}
      <td className="num">{formatMoney(line.total, { cents: true })}</td>
    </tr>
  );
}
