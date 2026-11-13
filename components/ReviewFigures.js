import Link from 'next/link';

import { formatCount, formatDayReading, formatEuro, formatMinutes, slippedLabel, WEEKDAY_SHORT } from '@/components/format.js';
import { crmAddress, goalsAddress } from '@/lib/domain/addresses.js';
import { weekdayOf } from '@/lib/domain/dates.js';
import { TIME_AREA_KEYS } from '@/lib/domain/day-time.js';
import { BASELINE_WEEKS } from '@/lib/domain/derive/week.js';
import { TIME_AREAS } from '@/personalos.config.js';

const THIN_SPACE = String.fromCharCode(0x2009);
const OF = THIN_SPACE + "/" + THIN_SPACE;

/**
 * Step 1 of the Review screen (#239), "What happened": every figure of
 * `weekFigures` (lib/domain/derive/week.js), ported from the redrawn mockup.
 * It only draws. An unknown figure shows a dash and the reason, never a zero;
 * a week in progress says "so far" in the step head.
 *
 * @param {{ figures: import('@/lib/domain/derive/week.js').WeekFigures }} props
 */
export default function ReviewFigures({ figures }) {
  const { inProgress } = figures;
  return (
    <section className="review-step" id="review-figures">
      <div className="step-head">
        <span className="n">1</span>
        <h3 className="title">What happened</h3>
        <span className="caption">
          {inProgress ? 'So far — the week is still running' : 'Computed from your data as it stands now'}
        </span>
      </div>
      <div className="figs">
        <HabitFigures habits={figures.habits} />
        <SpendingFigures spending={figures.spending} />
        <TaskFigures tasks={figures.tasks} />
        <GoalFigures goals={figures.goals} />
      </div>
      <div className="divider" />
      <WeekStats figures={figures} />
      <div className="divider" />
      <TimeStats time={figures.time} days={figures.days.length} />
    </section>
  );
}

/** @param {{ habits: import('@/lib/domain/derive/week.js').HabitWeek[] }} props */
function HabitFigures({ habits }) {
  return (
    <div className="fig-group" id="review-habits">
      <h4>Habits — scheduled days kept, against the week before</h4>
      {habits.length === 0 ? (
        <p className="caption unknown">No habit was scheduled this week</p>
      ) : (
        <ul className="review-list">
          {habits.map((row) => (
            <li key={row.habit.id}>
              <span className="grow">{row.habit.label}</span>
              <span className="vs">
                <span className="num">{row.complete + OF + row.scheduled}</span>{' '}
                <span className="caption num">
                  {row.previous === null ? 'not scheduled before' : 'before ' + row.previous.complete + OF + row.previous.scheduled}
                </span>
              </span>
              {row.notComplete.length > 0 && (
                <span className="days caption">
                  <Misses misses={row.notComplete} />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** @param {{ misses: import('@/lib/domain/derive/week.js').HabitMiss[] }} props */
function Misses({ misses }) {
  const missed = misses.filter((miss) => miss.state === 'missed');
  const unrecorded = misses.filter((miss) => miss.state === 'unrecorded');
  return (
    <>
      {missed.length > 0 && 'Missed ' + missed.map(weekdayName).join(', ')}
      {missed.length > 0 && unrecorded.length > 0 && ' · '}
      {unrecorded.length > 0 && (
        <span className="unknown">{unrecorded.map(weekdayName).join(', ') + ' not recorded'}</span>
      )}
    </>
  );
}

/** @param {{ date: string }} miss */
function weekdayName(miss) {
  return WEEKDAY_SHORT[weekdayOf(miss.date) - 1];
}

/** @param {{ spending: import('@/lib/domain/derive/week.js').WeekFigures['spending'] }} props */
function SpendingFigures({ spending }) {
  const { total, baseline, topCategories } = spending;
  return (
    <div className="fig-group" id="review-spending">
      <h4>Spending — against the average of the four weeks before</h4>
      <div className="stat-row">
        <div className="stat">
          <div className="k">This week</div>
          {total === null ? <Unknown reason="no spending recorded" /> : <div className="v num">{formatEuro(total)}</div>}
        </div>
        <div className="stat">
          <div className="k">
            {baseline.weeks === 0 ? 'Average of earlier weeks' : 'Average, ' + baseline.weeks + (baseline.weeks === 1 ? ' week' : ' weeks')}
          </div>
          {baseline.mean === null ? (
            <Unknown reason={'none of the ' + BASELINE_WEEKS + ' weeks before had spending'} />
          ) : (
            <div className="v num">{formatEuro(baseline.mean)}</div>
          )}
        </div>
      </div>
      {topCategories.length > 0 && (
        <ul className="review-list">
          {topCategories.map((category) => (
            <li key={category.id}>
              <span className="grow">{category.name}</span>
              <span className="num">{formatEuro(category.total)}</span>
            </li>
          ))}
        </ul>
      )}
      {baseline.weeks > 0 && baseline.weeks < BASELINE_WEEKS && (
        <p className="caption fig-note">
          Only {baseline.weeks} of the {BASELINE_WEEKS} weeks before had spending.
        </p>
      )}
      <p className="caption fig-note">Transfers and not-counted money left out; refunds taken off.</p>
    </div>
  );
}

/** @param {{ tasks: import('@/lib/domain/derive/week.js').WeekFigures['tasks'] }} props */
function TaskFigures({ tasks }) {
  return (
    <div className="fig-group" id="review-tasks">
      <h4>Tasks</h4>
      <ul className="review-list">
        {tasks.completed.length === 0 && tasks.overdue.length === 0 && (
          <li>
            <span className="grow caption">Nothing completed, nothing overdue</span>
          </li>
        )}
        {tasks.completed.length > 0 && (
          <li>
            <span className="mark up">✓</span>
            <span className="grow">{tasks.completed.length} completed</span>
          </li>
        )}
        {tasks.completed.map((task) => (
          <li key={task.id}>
            <span className="mark" />
            <Link className="grow" href={crmAddress('board', task.id)}>
              {task.title}
            </Link>
          </li>
        ))}
        {tasks.overdue.map(({ task, days }) => (
          <li key={task.id}>
            <span className="mark due">→</span>
            <Link className="grow" href={crmAddress('board', task.id)}>
              {task.title}
            </Link>
            <span className="caption num">overdue {days}d</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** @param {{ goals: import('@/lib/domain/derive/week.js').WeekFigures['goals'] }} props */
function GoalFigures({ goals }) {
  return (
    <div className="fig-group" id="review-goals">
      <h4>Goals</h4>
      <ul className="review-list">
        {goals.completed.length === 0 && goals.slipped.length === 0 && (
          <li>
            <span className="grow caption">No goal completed or slipped</span>
          </li>
        )}
        {goals.completed.map((goal) => (
          <li key={goal.id}>
            <span className="mark up">✓</span>
            <Link className="grow" href={goalsAddress(goal.id)}>
              {goal.name}
            </Link>
            <span className="caption">completed</span>
          </li>
        ))}
        {goals.slipped.map(({ goal, period }) => (
          <li key={goal.id}>
            <span className="mark due">→</span>
            <Link className="grow" href={goalsAddress(goal.id)}>
              {goal.name}
            </Link>
            <span className="caption">slipped · {slippedLabel(period, goal.horizon === 'month' ? 'month' : 'week')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** @param {{ figures: import('@/lib/domain/derive/week.js').WeekFigures }} props */
function WeekStats({ figures }) {
  const { journal, mood, energy, intake, captures, days } = figures;
  return (
    <div className="stat-row" id="review-stats">
      <div className="stat">
        <div className="k">Journal days</div>
        {journal.days === null ? (
          <Unknown reason="no entries" />
        ) : (
          <div className="v num">{journal.days + OF + days.length}</div>
        )}
      </div>
      <ReadingStat label="Mood" reading={mood} days={days.length} />
      <ReadingStat label="Energy" reading={energy} days={days.length} />
      <div className="stat">
        <div className="k">Average intake</div>
        {intake === null || intake.calories === null ? (
          <Unknown reason={intake === null ? 'no meals recorded' : 'no calories recorded'} />
        ) : (
          <div className="v num">
            {formatCount(intake.calories)}
            <span className="caption"> kcal · {intake.days.calories} {intake.days.calories === 1 ? 'day' : 'days'}</span>
          </div>
        )}
      </div>
      <div className="stat">
        <div className="k">Captures filed</div>
        {captures === null ? <Unknown reason="none this week" /> : <div className="v num">{formatCount(captures)}</div>}
      </div>
    </div>
  );
}

/**
 * The days of the week given a mood (or an energy) and their mean; unknown,
 * never zero, when none was given.
 *
 * @param {{ label: string, reading: { days: number | null, mean: number | null }, days: number }} props
 */
function ReadingStat({ label, reading, days }) {
  return (
    <div className="stat">
      <div className="k">{label}</div>
      {reading.days === null || reading.mean === null ? (
        <Unknown reason={'no ' + label.toLowerCase() + ' given'} />
      ) : (
        <div className="v num reading">
          {reading.days + OF + days} <span className="caption">avg {formatDayReading(reading.mean)}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The time declared against each area over the week (ADR 0037): the total
 * with the days declared, then one stat per area that had time. Unknown,
 * never zero, when no day was declared; a week declared with nothing shows
 * its zero.
 *
 * @param {{ time: import('@/lib/domain/derive/week.js').WeekFigures['time'], days: number }} props
 */
function TimeStats({ time, days }) {
  return (
    <div className="stat-row" id="review-time">
      <div className="stat">
        <div className="k">Time declared</div>
        {time === null || time.total === null ? (
          <Unknown reason="no time declared" />
        ) : (
          <div className="v num">
            {formatMinutes(time.total)} <span className="caption">{time.declaredDays + OF + days} days</span>
          </div>
        )}
      </div>
      {time !== null &&
        TIME_AREA_KEYS.filter((area) => time.byArea[area] !== undefined).map((area) => (
          <div className="stat" key={area}>
            <div className="k">{TIME_AREAS[area]}</div>
            <div className="v num">{formatMinutes(time.byArea[area])}</div>
          </div>
        ))}
    </div>
  );
}

/** @param {{ reason: string }} props */
function Unknown({ reason }) {
  return (
    <div className="v num unknown">
      —<span className="caption"> {reason}</span>
    </div>
  );
}
