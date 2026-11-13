/**
 * One day's check-in, read and answered (ADR 0037): the questions computed
 * from the store, and closed answers filed through the action registry. What
 * GET and POST /api/checkin do, kept here so the next channel -- Telegram,
 * a skill -- asks and files the same way instead of copying the route.
 *
 * No model anywhere (rule 3, tests/lint/checkin-no-model.test.js): the
 * questions are a derivation, the answers are rules (./closed.js).
 */

import { TIME_AREA_KEYS } from '../domain/day-time.js';
import { checkinQuestions, isCheckinDone } from '../domain/derive/checkin.js';
import { receiptFor, runActions } from '../actions/registry.js';
import { getDailyLog, getProfile } from '../store.js';
import { actionsForAnswer } from './closed.js';

/** What every check-in action is made under, and what its receipt is read by. */
const ORIGIN = Object.freeze({ type: 'checkin', id: null });

/**
 * @typedef {{ questionId: string, value: unknown }} Answer
 */

/**
 * The day's questions as the store says now, and whether the check-in is done.
 *
 * @param {string} day
 * @returns {Promise<{ questions: import('../domain/derive/checkin.js').Question[], done: boolean }>}
 */
export async function questionsFor(day) {
  const [profile, log] = await Promise.all([getProfile(), getDailyLog(day)]);
  const questions = checkinQuestions({ habits: profile.habits, log, dayKey: day, timeAreas: TIME_AREA_KEYS });
  return { questions, done: isCheckinDone(questions) };
}

/**
 * The day's check-in receipt as kept: every action the check-in made that
 * day, undone ones included. Reading it writes nothing.
 *
 * @param {string} day
 * @returns {Promise<import('../actions/registry.js').Receipt>}
 */
export function checkinReceipt(day) {
  return receiptFor({ day, origin: { type: ORIGIN.type } });
}

/**
 * @param {string} error
 * @returns {import('../actions/registry.js').ReceiptLine}
 */
function rejectedLine(error) {
  return { actionId: null, name: '', text: 'Not done: ' + error, status: 'rejected', undoable: false, error };
}

/**
 * Files a list of answers to a day's check-in, in order, and returns the
 * lines of this list alone -- the day's whole receipt is `checkinReceipt`.
 * The questions are recomputed from the store, never taken from the caller:
 * an answer to a question the day does not ask, or a value that does not fit
 * its question, is a rejected line and writes nothing; the other answers are
 * filed all the same. Like a list of actions, a list of answers is not atomic.
 *
 * @param {string} day a day key, not in the future
 * @param {readonly Answer[]} answers
 * @returns {Promise<import('../actions/registry.js').Receipt>}
 */
export async function answerCheckin(day, answers) {
  const { questions } = await questionsFor(day);
  const byId = new Map(questions.map((question) => [question.id, question]));
  /** @type {import('../actions/registry.js').ReceiptLine[]} */
  const lines = [];

  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    if (question === undefined) {
      lines.push(rejectedLine('the check-in for ' + day + ' asks no question ' + JSON.stringify(answer.questionId)));
      continue;
    }
    const shaped = actionsForAnswer(question, answer.value);
    if (!shaped.ok) {
      lines.push(rejectedLine(question.id + ': ' + shaped.error));
      continue;
    }
    const receipt = await runActions(shaped.requests, { day, source: 'checkin', origin: ORIGIN });
    lines.push(...receipt.lines);
  }

  return { lines };
}
