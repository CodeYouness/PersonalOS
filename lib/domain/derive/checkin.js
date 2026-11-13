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
 *   answered once it is complete or carries a skip reason (`openHabits`);
 * - `mood` and `energy`, answered once given;
 * - `time`, answered once the day is declared, nothing included -- asked
 *   only when there is an area to declare against;
 * - `open`, "Anything worth noting today?", always last and never answered:
 *   it can be answered more than once.
 *
 * A past appointment is not asked yet: that is a later stage.
 */

import { habitsForDay, openHabits, targetOn } from './habits.js';

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
  const questions = habitsForDay(habits, dayKey).scheduled.map((habit) => ({
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
