/**
 * The check-in's questions (ADR 0037, docs/domain.md "Check-in question"):
 * what the day's data does not yet say, computed from the day's log and the
 * habits -- never by a model, and never stored. A thing the system already
 * knows is asked as answered, so a screen can show it done rather than
 * asking it again.
 *
 * Asked, in this order:
 *
 * - one `habit:<habitId>` question per habit scheduled that day, in the
 *   habit order -- a habit on its day off, or not active, is not asked --
 *   answered once it is complete or carries a skip reason (`openHabits`).
 *   A habit counted from a time area (ADR 0039) is not asked: the `time`
 *   question answers it, and it is read beside the questions
 *   (`countedHabits`), never counted among them;
 * - `mood` and `energy`, answered once given;
 * - `time`, answered once the day is declared, nothing included -- asked
 *   only when there is an area to declare against;
 * - `open`, "Anything worth noting today?", always last and never answered:
 *   it can be answered more than once.
 *
 * A past appointment is not asked yet: that is a later stage.
 */

import { countedFromArea, habitsForDay, habitValueOn, openHabits, targetOn } from './habits.js';
import { dayTimeTotal } from './time.js';

/** The open question's id, and the one question never answered. */
export const OPEN_QUESTION_ID = 'open';

/** What each fixed question asks. */
const LABELS = Object.freeze({
  mood: 'How did today feel?',
  energy: 'How much energy did today have?',
  time: "Where did today's time go?",
  open: 'Anything worth noting today?',
});

/**
 * One question of the check-in. A habit question names its habit in
 * `subjectId`, and says what it takes: `habitType`, and for a counter the
 * target that day is measured against (null for a check) -- what a closed
 * answer "done" fills a counter to, and what a panel offers.
 *
 * @typedef {object} Question
 * @property {string} id `habit:<habitId>`, `mood`, `energy`, `time` or `open`
 * @property {'habit' | 'mood' | 'energy' | 'time' | 'open'} kind
 * @property {string} [subjectId] the habit's id, on a habit question
 * @property {string} label what is asked; a habit question's is the habit's label
 * @property {boolean} answered whether the day already says it; never, for `open`
 * @property {'check' | 'counter'} [habitType] on a habit question
 * @property {number | null} [target] on a habit question: a counter's target that day, null for a check
 */

/**
 * The day's questions, in the order they are asked.
 *
 * @param {{
 *   habits: import('../types.js').Habit[],
 *   log: import('../types.js').DailyLog,
 *   dayKey: string,
 *   timeAreas: readonly string[],
 * }} input `log` is that day's log as the store reads it; `timeAreas` the
 *   areas time is declared against
 * @returns {Question[]}
 */
export function checkinQuestions({ habits, log, dayKey, timeAreas }) {
  const day = { ...log, date: dayKey };
  const open = new Set(openHabits(habits, day).map((habit) => habit.id));

  /** @type {Question[]} */
  const questions = habitsForDay(habits, dayKey)
    .scheduled.filter((habit) => countedFromArea(habit) === null)
    .map((habit) => ({
    id: 'habit:' + habit.id,
    kind: 'habit',
    subjectId: habit.id,
    label: habit.label,
    answered: !open.has(habit.id),
    habitType: habit.type,
    target: habit.type === 'counter' ? targetOn(habit, dayKey) : null,
  }));

  questions.push({ id: 'mood', kind: 'mood', label: LABELS.mood, answered: log.mood !== null });
  questions.push({ id: 'energy', kind: 'energy', label: LABELS.energy, answered: log.energy !== null });
  if (timeAreas.length > 0) questions.push({ id: 'time', kind: 'time', label: LABELS.time, answered: log.time !== null });
  questions.push({ id: OPEN_QUESTION_ID, kind: 'open', label: LABELS.open, answered: false });

  return questions;
}

/**
 * A habit scheduled on a day and counted from a time area (ADR 0039): not a
 * question -- the day's time answers it -- but read with the day's habits,
 * in the summary and the sheet.
 *
 * @typedef {object} CountedHabit
 * @property {string} id the habit's id
 * @property {string} label
 * @property {string} area the time area it is counted from
 */

/**
 * The habits a day reads from its time instead of asking, in the habit
 * order: scheduled that day and counted from an area.
 *
 * @param {{ habits: import('../types.js').Habit[], dayKey: string }} input
 * @returns {CountedHabit[]}
 */
export function countedHabits({ habits, dayKey }) {
  return habitsForDay(habits, dayKey).scheduled.flatMap((habit) => {
    const area = countedFromArea(habit);
    return area === null ? [] : [{ id: habit.id, label: habit.label, area }];
  });
}

/**
 * What is left to ask: the questions not answered, and the open one, in order.
 *
 * @param {Question[]} questions
 * @returns {Question[]}
 */
export function openQuestions(questions) {
  return questions.filter((question) => !question.answered || question.kind === 'open');
}

/**
 * Whether the day's check-in is done: every question but the open one
 * answered. The open one never closes, so it never holds the check-in open.
 *
 * @param {Question[]} questions
 * @returns {boolean}
 */
export function isCheckinDone(questions) {
  return questions.every((question) => question.answered || question.kind === 'open');
}

/**
 * How far a day's check-in is: `filled` when it is done, `empty` when no
 * question but the open one is answered, `partly` in between. A habit given a
 * skip reason -- paused included -- is answered, so it counts.
 *
 * @typedef {'filled' | 'partly' | 'empty'} CheckinFill
 *
 * @param {Question[]} questions
 * @returns {{ fill: CheckinFill, answered: number, total: number }} `total`
 *   every question but the open one; `answered` those the day already says
 */
export function checkinFill(questions) {
  const closed = questions.filter((question) => question.kind !== 'open');
  const answered = closed.filter((question) => question.answered).length;
  /** @type {CheckinFill} */
  const fill = answered === closed.length ? 'filled' : answered === 0 ? 'empty' : 'partly';
  return { fill, answered, total: closed.length };
}

/** How many days the check-in's week strip shows: today and the six before it. */
export const CHECKIN_WEEK_DAYS = 7;

/**
 * One day of the check-in's week strip.
 *
 * @typedef {object} CheckinWeekDay
 * @property {string} day a day key
 * @property {CheckinFill} fill
 * @property {number} answered
 * @property {number} total
 */

/**
 * The check-in's week: for each day of `days`, in order, whether its
 * check-in is filled, partly filled or not, from the same questions the day
 * would ask (`checkinQuestions`) -- derived, never stored (rule 6). A day
 * with no log among `logs` is an empty one.
 *
 * @param {{
 *   habits: import('../types.js').Habit[],
 *   logs: readonly import('../types.js').DailyLog[],
 *   days: readonly string[],
 *   timeAreas: readonly string[],
 * }} input `days` the day keys to read; `logs` any days
 * @returns {CheckinWeekDay[]}
 */
export function checkinWeek({ habits, logs, days, timeAreas }) {
  const byDate = new Map(logs.map((log) => [log.date, log]));
  return days.map((day) => {
    const log = byDate.get(day) ?? emptyLog(day);
    return { day, ...checkinFill(checkinQuestions({ habits, log, dayKey: day, timeAreas })) };
  });
}

/**
 * @param {string} date
 * @returns {import('../types.js').DailyLog} a day with nothing recorded
 */
function emptyLog(date) {
  return { date, habits: {}, skips: {}, meals: [], measurements: [], notes: [], mood: null, energy: null, time: null };
}

/**
 * What a day's check-in has been answered with, as the panel shows and
 * changes it: the parts of the day's log the check-in asks about.
 *
 * @typedef {object} CheckinAnswers
 * @property {number | null} mood
 * @property {number | null} energy
 * @property {Record<string, number> | null} time null when not declared
 * @property {Record<string, boolean | number>} habits values by habit id
 * @property {Record<string, import('../habit-skip.js').HabitSkipReason>} skips reasons by habit id
 */

/**
 * @param {import('../types.js').DailyLog} log
 * @returns {CheckinAnswers}
 */
export function checkinAnswers(log) {
  return { mood: log.mood, energy: log.energy, time: log.time, habits: log.habits, skips: log.skips ?? {} };
}

/**
 * One habit as a day's summary reads it: `kept` complete, `paused` or
 * `skipped` with the reason given, `open` neither -- unanswered, or a counter
 * short of its target with no reason. A habit counted from a time area (ADR
 * 0039) is `missed` on a day whose time is declared with none for its area
 * and no reason given, and `open` while the time is not declared; it says
 * its area and that area's minutes for the hint.
 *
 * @typedef {object} SummaryHabit
 * @property {string} id
 * @property {string} label
 * @property {'check' | 'counter'} habitType
 * @property {number | null} target
 * @property {boolean | number | null} value
 * @property {import('../habit-skip.js').HabitSkipReason | null} skip
 * @property {'kept' | 'skipped' | 'paused' | 'missed' | 'open'} state
 * @property {string | null} countedFrom the time area, on a habit counted from one
 * @property {number | null} minutes the area's minutes that day, null when not declared
 *   or on a habit not counted from time
 */

/**
 * @typedef {object} CheckinSummary
 * @property {number | null} mood
 * @property {number | null} energy
 * @property {SummaryHabit[]} habits in the order the day asks them, then
 *   those counted from time
 * @property {number} kept habits kept
 * @property {number} counted habits scheduled and not paused
 * @property {{ total: number, areas: { area: string, minutes: number }[] } | null} time
 *   the day's time, the areas with some in `timeAreas` order; null when not declared
 */

/**
 * A day's check-in as its summary shows it: the readings, the habits and how
 * many were kept, and the time declared by area. Habits kept are counted out
 * of those scheduled and not paused, as a habit's rate counts them -- a
 * paused day is set aside, not missed. A habit is kept when the day answers
 * it with no reason: answered means complete or given a reason, and the
 * store never keeps a reason beside a complete value. A habit counted from
 * time is kept or not by `habitValueOn`, the rule every reader uses, on the
 * answers as they stand -- so the summary follows the time as it is changed.
 *
 * @param {{ questions: Question[], answers: CheckinAnswers, timeAreas: readonly string[], counted?: readonly CountedHabit[] }} input
 * @returns {CheckinSummary}
 */
export function checkinSummary({ questions, answers, timeAreas, counted = [] }) {
  /** @type {SummaryHabit[]} */
  const habits = questions
    .filter((question) => question.kind === 'habit' && typeof question.subjectId === 'string')
    .map((question) => {
      const id = /** @type {string} */ (question.subjectId);
      const skip = answers.skips[id] ?? null;
      /** @type {SummaryHabit['state']} */
      const state = !question.answered ? 'open' : skip === null ? 'kept' : skip === 'paused' ? 'paused' : 'skipped';
      return {
        id,
        label: question.label,
        habitType: question.habitType ?? 'check',
        target: question.target ?? null,
        value: answers.habits[id] ?? null,
        skip,
        state,
        countedFrom: null,
        minutes: null,
      };
    });
  for (const habit of counted) {
    const value = habitValueOn({ id: habit.id, countedFrom: habit.area }, answers);
    const skip = answers.skips[habit.id] ?? null;
    /** @type {SummaryHabit['state']} */
    const state =
      value === true ? 'kept' : skip === 'paused' ? 'paused' : skip !== null ? 'skipped' : value === false ? 'missed' : 'open';
    habits.push({
      id: habit.id,
      label: habit.label,
      habitType: 'check',
      target: null,
      value: value ?? null,
      skip: value === true ? null : skip,
      state,
      countedFrom: habit.area,
      minutes: answers.time === null ? null : answers.time[habit.area] ?? 0,
    });
  }
  const time = answers.time;
  const total = dayTimeTotal({ time });
  return {
    mood: answers.mood,
    energy: answers.energy,
    habits,
    kept: habits.filter((habit) => habit.state === 'kept').length,
    counted: habits.filter((habit) => habit.state !== 'paused').length,
    time:
      time === null || total === null
        ? null
        : { total, areas: timeAreas.filter((area) => (time[area] ?? 0) > 0).map((area) => ({ area, minutes: time[area] })) },
  };
}
