/**
 * What Home shows (ADR 0040): what needs you today, what is worth noting,
 * and four small tiles. A composition, not a second implementation: a task's
 * lateness is tasks.js's, a habit's day habits.js's, last week's review
 * review.js's, the week's spending week.js's, net worth finance.js's. This
 * module decides what Home asks of them and when a figure is worth a
 * sentence. Pure: it is handed what the store holds, today and the time, and
 * calls no model and no integration (rule 3). Nothing it returns is stored.
 *
 * Each "worth noting" rule is one small threshold in `limits`
 * (personalos.config.js), passed in so a test can hold it at, below and
 * above. Every sentence is descriptive (ADR 0037): a number, what it is
 * compared with, no cause and no verdict.
 */

import { limits } from '../../../personalos.config.js';
import { crmAddress, financesAddress, goalsAddress, habitsAddress, journalAddress, reviewAddress } from '../addresses.js';
import { dayKeyRange, formatTimeInZone, shiftDayKey, toDayKey, weekDayKeys } from '../dates.js';
import { PAUSED } from '../habit-skip.js';
import { dayAgenda } from './calendar.js';
import {
  countedFromArea,
  habitRate,
  habitValueOn,
  isActiveOn,
  isComplete,
  isRecorded,
  isScheduledOn,
  openHabits,
  skipOn,
} from './habits.js';
import { daysOverdue, dueToday, isOverdue } from './tasks.js';
import { BASELINE_WEEKS } from './week.js';

/** How far back the habit rules look: the baseline's four weeks. */
const LOOKBACK_DAYS = BASELINE_WEEKS * 7;

/**
 * Today and the wall-clock time in the user's zone, from one instant: the
 * only "now" Home uses (rule 4). An instant past midnight in the zone is the
 * zone's new day, whatever UTC says.
 *
 * @param {Date} instant
 * @param {string} [timezone] the configured one by default
 * @returns {{ today: string, now: string }} a day key and HH:MM
 */
export function homeClock(instant, timezone) {
  return { today: toDayKey(instant, timezone), now: formatTimeInZone(instant, timezone) };
}

/**
 * @typedef {object} NeedsYou
 * @property {import('../types.js').Appointment[]} appointments today's, not
 *   started yet, earliest first; one a sync no longer sees is left out
 * @property {{ task: import('../types.js').Task, overdueDays: number, href: string }[]} tasks
 *   overdue or due today, most urgent first, at most `taskCount`
 * @property {{ count: number, href: string } | null} moreTasks the rest of them, or null
 * @property {number} unclassified captures left `unclassified` among those given
 * @property {{ from: string, started: boolean, href: string } | null} review
 *   last week's review while it is absent or unfinished, else null
 * @property {boolean} empty nothing above needs you
 */

/**
 * What needs a gesture today, in the order Home lists it.
 *
 * @param {{
 *   appointments: import('../types.js').Appointment[],
 *   tasks: import('../types.js').Task[],
 *   captures: Pick<import('../types.js').Capture, 'route'>[],
 *   lastWeek: import('./review.js').LastWeekReview,
 *   today: string,
 *   now: string,
 * }} inputs `captures`: the ones the capture log shows, so every one counted
 *   can be opened there; `lastWeek`: `lastWeekReview` for today
 * @param {{ taskCount?: number }} [options]
 * @returns {NeedsYou}
 */
export function needsYou({ appointments, tasks, captures, lastWeek, today, now }, { taskCount = limits.homeTaskCount } = {}) {
  const upcoming = dayAgenda(appointments, today).filter(
    (appointment) => appointment.confirmed !== false && appointment.startTime >= now
  );

  const due = dueToday(tasks, today);
  const shown = due.slice(0, taskCount).map((task) => ({
    task,
    overdueDays: isOverdue(task, today) ? daysOverdue(task, today, dayKeyRange) : 0,
    href: crmAddress('board', task.id),
  }));
  const rest = due.length - shown.length;

  const unclassified = captures.filter((capture) => capture.route === 'unclassified').length;
  const review = lastWeek.pending
    ? { from: lastWeek.from, started: lastWeek.started, href: reviewAddress(lastWeek.from) }
    : null;

  return {
    appointments: upcoming,
    tasks: shown,
    moreTasks: rest > 0 ? { count: rest, href: crmAddress('board') } : null,
    unclassified,
    review,
    empty: upcoming.length === 0 && shown.length === 0 && unclassified === 0 && review === null,
  };
}

/**
 * @typedef {object} KeptCount
 * @property {number} kept habit-days kept
 * @property {number} scheduled habit-days scheduled and not paused
 * @property {number | null} rate kept / scheduled; null with nothing scheduled
 */

/**
 * The habits kept so far this week, every habit's `habitRate` summed: Monday
 * to yesterday, and today for each habit already answered -- kept, or given a
 * reason. A habit still open today is not a miss yet, so the number does not
 * dip every morning and climb back every evening.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs
 * @param {string} today
 * @returns {KeptCount}
 */
export function keptSoFar(habits, logs, today) {
  const monday = weekDayKeys(today)[0];
  const yesterday = shiftDayKey(today, -1);
  const todayLog = logs.find((log) => log.date === today) ?? emptyLog(today);
  const open = new Set(openHabits(habits, todayLog).map((habit) => habit.id));

  let kept = 0;
  let scheduled = 0;
  for (const habit of habits) {
    if (yesterday >= monday) {
      const past = habitRate(habit, logs, { from: monday, to: yesterday });
      kept += past.kept;
      scheduled += past.scheduled;
    }
    if (!open.has(habit.id)) {
      const now = habitRate(habit, logs, { from: today, to: today });
      kept += now.kept;
      scheduled += now.scheduled;
    }
  }
  return { kept, scheduled, rate: scheduled === 0 ? null : kept / scheduled };
}

/**
 * The same count over the four whole weeks before this one: the "usual" the
 * week is compared with.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs
 * @param {string} today
 * @returns {KeptCount}
 */
export function keptBaseline(habits, logs, today) {
  const monday = weekDayKeys(today)[0];
  const span = { from: shiftDayKey(monday, -LOOKBACK_DAYS), to: shiftDayKey(monday, -1) };
  let kept = 0;
  let scheduled = 0;
  for (const habit of habits) {
    const rate = habitRate(habit, logs, span);
    kept += rate.kept;
    scheduled += rate.scheduled;
  }
  return { kept, scheduled, rate: scheduled === 0 ? null : kept / scheduled };
}

/**
 * Habits active today not kept on their last scheduled days running, before
 * today, at least `runDays` of them; the longest run first. Walking back from
 * yesterday, at most four weeks: a day kept ends the run; a paused day, and a
 * day with nothing recorded -- nothing at all that day, or the time not
 * declared for a habit counted from it (ADR 0039) -- is passed over, since
 * forgetting to record is not failing. Any other scheduled day is a miss.
 *
 * @param {import('../types.js').Habit[]} habits
 * @param {import('../types.js').DailyLog[]} logs
 * @param {string} today
 * @param {number} [runDays]
 * @returns {{ habit: import('../types.js').Habit, days: number }[]}
 */
export function missedRuns(habits, logs, today, runDays = limits.homeMissedRunDays) {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  const runs = [];
  for (const habit of habits) {
    if (!isActiveOn(habit, today)) continue;
    let days = 0;
    for (let back = 1; back <= LOOKBACK_DAYS; back += 1) {
      const day = shiftDayKey(today, -back);
      if (!isScheduledOn(habit, day)) continue;
      const log = byDate.get(day) ?? emptyLog(day);
      const value = habitValueOn(habit, log);
      if (isComplete(habit, day, value)) break;
      const reason = skipOn(log, habit.id);
      if (reason === PAUSED) continue;
      const noRecord = !isRecorded(log, habits) || (countedFromArea(habit) !== null && value === undefined);
      if (reason === null && noRecord) continue;
      days += 1;
    }
    if (days >= runDays) runs.push({ habit, days });
  }
  return runs.sort((a, b) => b.days - a.days);
}

/**
 * @typedef {(
 *   { kind: 'lever', lever: string, href: string } |
 *   { kind: 'missed', label: string, days: number, href: string } |
 *   { kind: 'kept', week: KeptCount, baseline: KeptCount, href: string } |
 *   { kind: 'spending', total: number, mean: number, weeks: number, ratio: number, href: string } |
 *   { kind: 'net-worth', change: number, ratio: number, href: string }
 * )} Note
 */

/**
 * @typedef {object} NoteThresholds
 * @property {number} [max] at most this many notes
 * @property {number} [keptPoints] percentage points the week's kept rate is off the baseline's
 * @property {number} [keptMinDays] habit-days each side must rest on
 * @property {number} [spendingRatio] share last week's spending is off its baseline mean
 * @property {number} [spendingMinWeeks] baseline weeks with spending, at least
 * @property {number} [missedRunDays] scheduled days missed running
 * @property {number} [netWorthRatio] share of net worth 30 days ago it moved by
 */

/**
 * What is worth noting today: only what differs from usual, in this order,
 * at most `max`:
 *
 * 1. this week's lever, when last week's completed review set one;
 * 2. a habit not kept on its last `missedRunDays` scheduled days (`missedRuns`);
 * 3. the habits kept so far this week at least `keptPoints` points off the
 *    four weeks before, each resting on `keptMinDays` habit-days or more;
 * 4. last week's spending at least `spendingRatio` off the weekly mean of the
 *    weeks before it (week.js's baseline), with `spendingMinWeeks` of them;
 * 5. net worth moved by at least `netWorthRatio` of its value 30 days ago.
 *
 * Nothing differs: an empty list, and Home leaves the section out.
 *
 * @param {{
 *   habits: import('../types.js').Habit[],
 *   dailyLogs: import('../types.js').DailyLog[],
 *   today: string,
 *   lastWeek: import('./review.js').LastWeekReview,
 *   spending: import('./week.js').WeekFigures['spending'] | null,
 *   netWorth: { value: number, change30: number | null } | null,
 * }} inputs `spending`: weekFigures for last week; `netWorth`: null while unknown
 * @param {NoteThresholds} [thresholds]
 * @returns {Note[]}
 */
export function worthNoting({ habits, dailyLogs, today, lastWeek, spending, netWorth }, thresholds = {}) {
  const {
    max = limits.homeNotesMax,
    keptPoints = limits.homeKeptRatePoints,
    keptMinDays = limits.homeKeptRateMinDays,
    spendingRatio = limits.homeSpendingRatio,
    spendingMinWeeks = limits.homeSpendingMinWeeks,
    missedRunDays = limits.homeMissedRunDays,
    netWorthRatio = limits.homeNetWorthRatio,
  } = thresholds;

  /** @type {Note[]} */
  const notes = [];

  if (lastWeek.lever !== null) notes.push({ kind: 'lever', lever: lastWeek.lever, href: reviewAddress(lastWeek.from) });

  for (const run of missedRuns(habits, dailyLogs, today, missedRunDays)) {
    notes.push({ kind: 'missed', label: run.habit.label, days: run.days, href: habitsAddress() });
  }

  const week = keptSoFar(habits, dailyLogs, today);
  const baseline = keptBaseline(habits, dailyLogs, today);
  if (
    week.rate !== null &&
    baseline.rate !== null &&
    week.scheduled >= keptMinDays &&
    baseline.scheduled >= keptMinDays &&
    // Whole points, as they are shown: 0.85 - 0.70 is 0.1499... in floats.
    Math.abs(Math.round(week.rate * 100) - Math.round(baseline.rate * 100)) >= keptPoints
  ) {
    notes.push({ kind: 'kept', week, baseline, href: habitsAddress() });
  }

  if (
    spending !== null &&
    spending.total !== null &&
    spending.baseline.mean !== null &&
    spending.baseline.mean > 0 &&
    spending.baseline.weeks >= spendingMinWeeks
  ) {
    const ratio = (spending.total - spending.baseline.mean) / spending.baseline.mean;
    if (Math.abs(ratio) >= spendingRatio) {
      notes.push({
        kind: 'spending',
        total: spending.total,
        mean: spending.baseline.mean,
        weeks: spending.baseline.weeks,
        ratio,
        href: financesAddress(),
      });
    }
  }

  if (netWorth !== null && netWorth.change30 !== null) {
    const before = netWorth.value - netWorth.change30;
    if (before !== 0) {
      const ratio = netWorth.change30 / Math.abs(before);
      if (Math.abs(ratio) >= netWorthRatio) {
        notes.push({ kind: 'net-worth', change: netWorth.change30, ratio, href: financesAddress() });
      }
    }
  }

  return notes.slice(0, max);
}

/**
 * @typedef {object} HomeTiles
 * @property {KeptCount & { active: number, href: string }} habits `keptSoFar`,
 *   and how many habits are active today
 * @property {{ netWorth: number | null, change30: number | null, href: string }} money
 *   null net worth while no account has a value: unknown, not zero
 * @property {{ open: number, href: string }} goals
 * @property {{ thisWeek: number, last: string | null, href: string }} journal
 *   entries dated this week, and the newest entry's day among those given
 */

/**
 * The four tiles: one number each, the whole tile a link.
 *
 * @param {{
 *   habits: import('../types.js').Habit[],
 *   dailyLogs: import('../types.js').DailyLog[],
 *   today: string,
 *   finance: { asOf: string | null, netWorth: number, changes: { days30: number | null } },
 *   goals: Pick<import('../types.js').Goal, 'done'>[],
 *   journalEntries: Pick<import('../types.js').JournalEntry, 'date'>[],
 * }} inputs `finance`: financeOverview for today
 * @returns {HomeTiles}
 */
export function homeTiles({ habits, dailyLogs, today, finance, goals, journalEntries }) {
  const monday = weekDayKeys(today)[0];
  const dates = journalEntries.map((entry) => entry.date).filter((date) => date <= today).sort();
  const known = finance.asOf !== null;
  return {
    habits: {
      ...keptSoFar(habits, dailyLogs, today),
      active: habits.filter((habit) => isActiveOn(habit, today)).length,
      href: habitsAddress(),
    },
    money: {
      netWorth: known ? finance.netWorth : null,
      change30: known ? finance.changes.days30 : null,
      href: financesAddress(),
    },
    goals: { open: goals.filter((goal) => !goal.done).length, href: goalsAddress() },
    journal: {
      thisWeek: dates.filter((date) => date >= monday).length,
      last: dates[dates.length - 1] ?? null,
      href: journalAddress(today),
    },
  };
}

/**
 * @param {string} date
 * @returns {import('../types.js').DailyLog}
 */
function emptyLog(date) {
  return { date, habits: {}, skips: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, time: null };
}
