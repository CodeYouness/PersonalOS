import {
  daysLabel,
  formatCostMicros,
  formatCount,
  formatDuration,
  formatInstant,
} from '@/components/format.js';
import { runCostMicros } from '@/lib/domain/derive/run-log.js';

/** Who started a run, as the log words it. */
const STARTERS = { schedule: 'Schedule', user: 'You', telegram: 'Telegram' };

/** How a run ended, as the log words it. */
const OUTCOMES = { ok: 'OK', failed: 'Failed', skipped: 'Skipped' };

/** What a due schedule waits for (ADR 0066), as the log words it. */
const WAITS = { unlocked: 'When the Mac is unlocked' };

/** The engine of a run, as the log words it. */
const ENGINES = { script: 'Script', 'small-model': 'Model' };

/**
 * The run log (#289, ADR 0063): each configured schedule with its last run
 * and when it is next due, then the runs, newest first. A schedule that is
 * owed a run and waits for what it needs says what for, in place of a date
 * (ADR 0066). Saved values only --
 * nothing here starts a run or calls a model or an integration. A server
 * component; the view is derived by `runLogView`.
 *
 * @param {{
 *   view: import('@/lib/domain/derive/run-log.js').RunLogView,
 *   timezone?: string,
 *   prices: Record<string, { inputPerMTok: number, outputPerMTok: number }>,
 * }} props
 */
export default function RunLog({ view, timezone, prices }) {
  return (
    <>
      <section className="card span-12" aria-labelledby="runlog-schedules-title">
        <div className="card-head">
          <h2 id="runlog-schedules-title" className="eyebrow">
            Schedules
          </h2>
        </div>
        <div className="card-body">
          <div className="finance-table-scroll">
            <table className="finance-table runlog-table">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Runs at</th>
                  <th>Last run</th>
                  <th>Outcome</th>
                  <th>Next due</th>
                </tr>
              </thead>
              <tbody>
                {view.schedules.map(({ id, schedule, last, nextAt, due }) => (
                  <tr key={id} data-schedule-row>
                    <td className="runlog-id">{id}</td>
                    <td className="finance-date-cell">
                      {daysLabel(schedule.days)} at {schedule.time}
                    </td>
                    <td className="finance-date-cell">{last === null ? 'Never' : formatInstant(last.startedAt, timezone)}</td>
                    <td>{last === null ? <span className="caption">—</span> : <Outcome outcome={last.outcome} />}</td>
                    <td className="finance-date-cell">
                      {due && schedule.needs !== undefined ? WAITS[schedule.needs] : formatInstant(nextAt, timezone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="card span-12" aria-labelledby="runlog-runs-title">
        <div className="card-head">
          <h2 id="runlog-runs-title" className="eyebrow">
            Runs
          </h2>
          <span className="caption">{countLine(view.rows.length, view.total)}</span>
        </div>
        <div className="card-body">
          {view.rows.length === 0 ? (
            <p className="caption">No runs yet. The first run of a schedule is recorded here when it ends.</p>
          ) : (
            <div className="finance-table-scroll">
              <table className="finance-table runlog-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Schedule</th>
                    <th>By</th>
                    <th>Engine</th>
                    <th className="num">Took</th>
                    <th>Outcome</th>
                    <th>Wrote</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((run) => {
                    const detail = detailOf(run, prices);
                    return (
                      <tr key={run.id}>
                        <td className="finance-date-cell">{formatInstant(run.startedAt, timezone)}</td>
                        <td className="runlog-id">{run.schedule}</td>
                        <td>{STARTERS[run.startedBy]}</td>
                        <td>{ENGINES[run.engine]}</td>
                        <td className="num finance-date-cell">{formatDuration(run.durationMs)}</td>
                        <td>
                          <Outcome outcome={run.outcome} />
                        </td>
                        <td className="finance-date-cell">{wroteOf(run.wrote)}</td>
                        <td className="runlog-detail" title={detail}>
                          {detail}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/** @param {{ outcome: 'ok' | 'failed' | 'skipped' }} props */
function Outcome({ outcome }) {
  return <span className={'runlog-outcome is-' + outcome}>{OUTCOMES[outcome]}</span>;
}

/**
 * "Showing 3 runs", "Showing the newest 100 of 140 runs".
 *
 * @param {number} shown
 * @param {number} total
 */
function countLine(shown, total) {
  if (total === 0) return 'No runs';
  /** @param {number} count */
  const runs = (count) => formatCount(count) + (count === 1 ? ' run' : ' runs');
  return shown === total ? 'Showing ' + runs(total) : 'Showing the newest ' + formatCount(shown) + ' of ' + runs(total);
}

/**
 * What a run wrote, by kind: "runs 3, files 2"; "—" for nothing.
 *
 * @param {Record<string, number>} wrote
 */
function wroteOf(wrote) {
  const parts = Object.entries(wrote)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => kind + ' ' + formatCount(count));
  return parts.length === 0 ? '—' : parts.join(', ');
}

/**
 * The error of a failed run, the reason of a skipped one, and a model run's
 * tokens with the cost derived from them -- joined, one line.
 *
 * @param {import('@/lib/domain/types.js').Run} run
 * @param {Record<string, { inputPerMTok: number, outputPerMTok: number }>} prices
 */
function detailOf(run, prices) {
  const parts = [];
  if (run.reason !== '') parts.push(run.reason);
  if (run.inputTokens !== null && run.outputTokens !== null) {
    const cost = runCostMicros(run, prices);
    parts.push(
      [run.model, formatCount(run.inputTokens) + ' in', formatCount(run.outputTokens) + ' out']
        .filter(Boolean)
        .join(' · ') + (cost === null ? '' : ' · ' + formatCostMicros(cost))
    );
  }
  return parts.length === 0 ? '—' : parts.join(' · ');
}
