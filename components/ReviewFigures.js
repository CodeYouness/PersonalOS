import Link from 'next/link';

import { formatCount, formatEuro, slippedLabel, WEEKDAY_SHORT } from '@/components/format.js';
import { crmAddress, goalsAddress } from '@/lib/domain/addresses.js';
import { weekdayOf } from '@/lib/domain/dates.js';

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
          <div className="k">{baseline.weeks === 0 ? 'Average, 4 weeks' : 'Average, ' + baseline.weeks + ' weeks'}</div>
          {baseline.mean === null ? (
            <Unknown reason="no earlier week to compare" />
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
  const { journal, rating, intake, captures, days } = figures;
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
      <div className="stat">
        <div className="k">Days rated</div>
        {rating.days === null || rating.mean === null ? (
          <Unknown reason="none rated" />
        ) : (
          <div className="v num rating">
            {rating.days + OF + days.length} <span className="caption">avg {rating.mean.toFixed(1)}</span>
          </div>
        )}
      </div>
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

/** @param {{ reason: string }} props */
function Unknown({ reason }) {
  return (
    <div className="v num unknown">
      —<span className="caption"> {reason}</span>
    </div>
  );
}
