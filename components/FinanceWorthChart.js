import { formatEuro, formatEuroShort, monthLabel, monthShort, shortDate } from '@/components/format.js';
import Tip, { TipFigures } from '@/components/Tip.js';
import { yearOf } from '@/lib/domain/dates.js';

/** @typedef {import('@/lib/domain/derive/finance.js').WorthMonth} WorthMonth */

/**
 * The net worth line over all tracked time (ADR 0048), drawn from
 * `worthChart` -- the Net worth card's and, compact, Home's. One component
 * and one derivation, so the two never draw it apart.
 *
 * The whole span fits the width, never scrolling: one stretched SVG with a
 * point at each month's middle, broken where a month is unknown, on a scale
 * from its bottom to its top value (worthLine, ADR 0044), both printed in a
 * column beside it. Few months (twelve at most) carry a dot each; past that
 * the line carries them, and only the newest month and a month alone between
 * two gaps keep a dot, so many months stay a line rather than a string of
 * beads. The months labelled under it thin out (worthTicks): wide, at most
 * twelve; on a phone, at most four, the CSS hiding the rest. No month is a
 * link: the chart reads no selected month.
 *
 * On the Net worth card (not compact), every month with a value is a
 * focusable column of the plot that shows its month, the day it is read on
 * and its net worth in full on hover, focus and a tap (Tip, ADR 0053); its
 * dot is drawn then, if the line does not already carry one. An unknown
 * month stays a gap: no point, nothing to show.
 *
 * Read-only and presentational: what is drawn is decided by the derivation.
 *
 * @param {{
 *   chart: ReturnType<typeof import('@/lib/domain/derive/finance.js').worthChart>,
 *   todayKey: string,
 *   compact?: boolean,
 * }} props `compact`: Home's, shorter, and silent to a screen reader --
 *   the link around it says what it shows
 */
export default function FinanceWorthChart({ chart, todayKey, compact = false }) {
  const { series, line, ticks } = chart;
  if (line.newest === null || line.low === null || line.high === null) return null;
  const columns = series.length;
  /** @param {number} index */
  const middle = (index) => ((index + 0.5) / columns) * 100 + '%';
  const dotted = (/** @type {number} */ index) => {
    if (line.points[index] === null) return false;
    if (columns <= 12 || series[index] === line.newest) return true;
    return (line.points[index - 1] ?? null) === null && (line.points[index + 1] ?? null) === null;
  };

  return (
    <figure
      className={'finance-worth' + (compact ? ' is-compact' : '')}
      aria-hidden={compact ? 'true' : undefined}
      aria-label={compact ? undefined : 'Net worth at the end of each month since ' + monthLabel(series[0].month)}
      role={compact ? undefined : 'group'}
    >
      <div className="finance-worth-frame">
        <div className="finance-worth-main">
          <div className="finance-worth-plot" aria-hidden={compact ? 'true' : undefined}>
            <WorthPath points={line.points} />
            {line.points.map((point, index) => {
              if (point === null) return null;
              const row = series[index];
              const dot = 'finance-worth-point' + (row === line.newest ? ' is-newest' : '') + (dotted(index) ? '' : ' is-hover');
              if (compact) {
                return dotted(index) ? <b key={row.month} className={dot} style={{ left: middle(index), bottom: point * 100 + '%' }} /> : null;
              }
              return (
                <Tip
                  key={row.month}
                  className="finance-worth-hit"
                  style={{ left: (index / columns) * 100 + '%', width: 100 / columns + '%' }}
                  label={worthLabel(row, todayKey, { cents: true })}
                  tip={
                    <TipFigures
                      head={monthLabel(row.month)}
                      rows={[{ label: 'Net worth', value: formatEuro(/** @type {number} */ (row.netWorth), { cents: true }) }]}
                      note={row.asOf === null ? null : 'on ' + shortDate(row.asOf, todayKey)}
                    />
                  }
                >
                  <b className={dot} style={{ left: '50%', bottom: point * 100 + '%' }} />
                </Tip>
              );
            })}
          </div>
          <div className="finance-worth-ticks" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick.month} className={'finance-worth-tick' + (tick.narrow ? ' is-narrow' : '')} style={{ left: middle(tick.index) }}>
                {monthShort(tick.month)}
                {(tick.year || tick.narrowYear) && (
                  <span className={'finance-worth-year' + (tick.year ? ' is-wide' : '') + (tick.narrowYear ? ' is-narrow' : '')}>
                    {yearOf(tick.month)}
                  </span>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className="finance-worth-axis" aria-hidden="true">
          <span className="is-top num">{formatEuroShort(line.high)}</span>
          <span className="is-bottom num">{formatEuroShort(line.low)}</span>
        </div>
      </div>
      {!compact && (
        <ol className="visually-hidden">
          {series.map((row) => (
            <li key={row.month}>{worthLabel(row, todayKey)}</li>
          ))}
        </ol>
      )}
    </figure>
  );
}

/**
 * The line: one column per month, each point at its column's middle, broken
 * where a month is unknown, with a hairline at the scale's top and bottom.
 * Stretched to the plot (`preserveAspectRatio`), its strokes kept at their
 * own width.
 *
 * @param {{ points: (number | null)[] }} props
 */
function WorthPath({ points }) {
  const columns = points.length;
  /** @type {string[]} */
  const steps = [];
  points.forEach((point, index) => {
    if (point === null) return;
    const joined = index > 0 && points[index - 1] !== null;
    steps.push((joined ? 'L' : 'M') + (index + 0.5) + ' ' + (100 - point * 100));
  });
  return (
    <svg className="finance-worth-line" viewBox={'0 0 ' + columns + ' 100'} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line className="is-grid" x1="0" x2={columns} y1="0" y2="0" />
      <line className="is-grid" x1="0" x2={columns} y1="100" y2="100" />
      {steps.length > 0 && <path d={steps.join(' ')} />}
    </svg>
  );
}

/**
 * What a month of the line says to a screen reader: its net worth and the
 * day it is read on, or that it is unknown. A point's name gives the amount
 * to the cent, as its popover does.
 *
 * @param {WorthMonth} row
 * @param {string} todayKey
 * @param {{ cents?: boolean }} [options]
 * @returns {string}
 */
function worthLabel(row, todayKey, options) {
  if (row.netWorth === null || row.asOf === null) return monthLabel(row.month) + ': net worth unknown';
  return monthLabel(row.month) + ': net worth ' + formatEuro(row.netWorth, options) + ' on ' + shortDate(row.asOf, todayKey);
}
