import { dayLabel, formatChange, formatCount, formatWeight } from '@/components/format.js';

/**
 * The Health card, ported from design/mockup.html's `#card-health`: how the
 * month is going, next to today's Nutrition card. No period selector yet --
 * a fixed `healthWindowDays` (docs/spec.md).
 *
 * The averages cover the days before today (ADR 0020) and carry how many
 * days they rest on; the table shows today too, labelled, since it is the
 * day still being eaten. Unknown is "—", never 0. Calories over the target
 * take the warning colour, never red; the weight change stays neutral --
 * without a goal nothing says which way is good.
 *
 * Presentational: the page derives every number on the server.
 *
 * @param {{
 *   averages: ReturnType<typeof import('@/lib/domain/derive/nutrition.js').averagesOverRecordedDays>,
 *   rows: ReturnType<typeof import('@/lib/domain/derive/health.js').healthRows>,
 *   weight: ReturnType<typeof import('@/lib/domain/derive/health.js').weightTrend>,
 *   target: number,
 *   windowDays: number,
 *   todayKey: string,
 * }} props
 */
export default function HealthCard({ averages, rows, weight, target, windowDays, todayKey }) {
  const leftOut = windowDays - averages.recordedDays;
  const over = averages.calories !== null && averages.calories > target;

  return (
    <article id="card-health" className="card span-6">
      <div className="card-head">
        <span className="eyebrow">Health</span>
        <span className="caption">Last {windowDays} days</span>
      </div>
      <div className="card-body">
        <div className="nutrition-headline">
          <span className={'display num' + (over ? ' nutrition-over' : '')}>
            {averages.calories === null ? '—' : formatCount(averages.calories)}
          </span>
          <span className="caption">avg of {formatCount(target)} kcal</span>
        </div>
        <p className="caption health-caption">
          {averages.recordedDays === 0
            ? 'No day recorded before today'
            : 'Average over ' + averages.recordedDays + (averages.recordedDays === 1 ? ' recorded day' : ' recorded days')}
          {leftOut > 0 && ' · ' + leftOut + (leftOut === 1 ? ' day' : ' days') + ' with nothing recorded left out, not counted as zero'}
          {averages.withoutNumbers > 0 &&
            ' · ' + averages.withoutNumbers + (averages.withoutNumbers === 1 ? ' meal' : ' meals') + ' missing numbers'}
        </p>

        <div className="avg-strip">
          <Average label="protein" value={averages.protein} unit="g" />
          <Average label="carbs" value={averages.carbs} unit="g" />
          <Average label="fat" value={averages.fat} unit="g" />
          <div className="avg">
            <div className="k">weight</div>
            <div className="v">
              {weight === null ? '—' : formatWeight(weight.latest)}
              {weight !== null && <span className="caption">kg</span>}
            </div>
            {weight !== null && weight.change !== null && (
              <div className="caption num">
                {formatChange(weight.change)} since {dayLabel(weight.since)}
              </div>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="caption">Nothing recorded in the last {windowDays} days</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th className="num">kcal</th>
                <th className="num">P</th>
                <th className="num">C</th>
                <th className="num">F</th>
                <th className="num">Meals</th>
                <th className="num">kg</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.date}>
                  <td>{row.date === todayKey ? 'Today' : dayLabel(row.date)}</td>
                  <td className={'num' + (row.calories !== null && row.calories > target ? ' nutrition-over' : '')}>
                    {known(row.calories)}
                  </td>
                  <td className="num">{known(row.protein)}</td>
                  <td className="num">{known(row.carbs)}</td>
                  <td className="num">{known(row.fat)}</td>
                  <td className="num">{formatCount(row.meals)}</td>
                  <td className="num">{row.weight === null ? '—' : formatWeight(row.weight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </article>
  );
}

/** @param {{ label: string, value: number | null, unit: string }} props */
function Average({ label, value, unit }) {
  return (
    <div className="avg">
      <div className="k">{label}</div>
      <div className="v">
        {value === null ? '—' : formatCount(value)}
        {value !== null && <span className="caption">{unit}</span>}
      </div>
    </div>
  );
}

/** @param {number | null} value */
function known(value) {
  return value === null ? '—' : formatCount(value);
}
