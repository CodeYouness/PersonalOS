/**
 * One day's check-in, read and answered (ADR 0037): the questions computed
 * from the store, and closed answers filed through the action registry. What
 * GET and POST /api/checkin do, kept here so the next channel -- Telegram,
 * a skill -- asks and files the same way instead of copying the route.
 *
 * No model anywhere (rule 3, tests/lint/checkin-no-model.test.js): the
 * questions are a derivation, the answers are rules (./closed.js). The open
 * answer may also be read for records, by a reader the caller hands in --
 * the route hands ./interpret.js's, which calls the small model -- so this
 * module, and the panel that reads the day through it, never reach one.
 */

import { TIME_AREA_KEYS } from '../domain/day-time.js';
import { checkinQuestions, isCheckinDone } from '../domain/derive/checkin.js';
import { receiptFor, runActions } from '../actions/registry.js';
import { createLink, getActionRecord, getDailyLog, getProfile } from '../store.js';
import { actionsForAnswer } from './closed.js';

/** What every check-in action is made under, and what its receipt is read by. */
const ORIGIN = Object.freeze({ type: 'checkin', id: null });

/**
 * @typedef {{ questionId: string, value: unknown }} Answer
 */

/**
 * Reads an open answer for the records it names, as action requests, and
 * never throws (./interpret.js's `readOpenAnswer`).
 *
 * @typedef {(text: string, about: { day: string, habits: import('./interpret.js').HabitContext[] }) => Promise<import('./interpret.js').OpenAnswerReading>} OpenAnswerReader
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
 * The habits a day's questions ask about, as a reader of the open answer is
 * told them.
 *
 * @param {readonly import('../domain/derive/checkin.js').Question[]} questions
 * @returns {import('./interpret.js').HabitContext[]}
 */
function habitsAsked(questions) {
  return questions
    .filter((question) => question.kind === 'habit' && typeof question.subjectId === 'string')
    .map((question) => ({
      id: /** @type {string} */ (question.subjectId),
      name: question.label,
      type: question.habitType ?? 'check',
      target: question.target ?? null,
    }));
}

/**
 * Files what an open answer's reader drew from it, after its journal entry
 * was kept (rule 2: the sentence first, whatever the reader does). Each
 * action is made under the origin `checkin` with the entry as its id, so it
 * is on the day's receipt and undone with the entry; each record one wrote
 * -- a task, a transaction -- gets a `derived_from` link to the entry (rule
 * 7). A reader that fails, or finds nothing, files nothing more; one that
 * throws is caught. A request the registry refuses is a rejected line, and
 * the others are filed all the same.
 *
 * @param {string} day
 * @param {import('../actions/registry.js').ReceiptLine} journalLine
 * @param {readonly import('../domain/derive/checkin.js').Question[]} questions
 * @param {OpenAnswerReader} read
 * @returns {Promise<import('../actions/registry.js').ReceiptLine[]>}
 */
async function fileDrawnFrom(day, journalLine, questions, read) {
  if (journalLine.status !== 'done' || journalLine.actionId === null) return [];
  const kept = await getActionRecord(journalLine.actionId);
  const entryId = kept?.recordRef ?? null;
  const text = /** @type {{ text?: unknown }} */ (kept?.params ?? {}).text;
  if (entryId === null || typeof text !== 'string') return [];

  let reading;
  try {
    reading = await read(text, { day, habits: habitsAsked(questions) });
  } catch (error) {
    console.error('[checkin] the open answer was not read, only its journal entry is filed:', error);
    return [];
  }
  if (reading.outcome !== 'actions' || reading.requests.length === 0) return [];

  const receipt = await runActions(reading.requests, { day, source: 'checkin', origin: { type: 'checkin', id: entryId } });
  for (const line of receipt.lines) {
    if (line.status !== 'done' || line.actionId === null) continue;
    try {
      const recordRef = (await getActionRecord(line.actionId))?.recordRef ?? null;
      if (recordRef !== null) await createLink({ from: recordRef, to: entryId, rel: 'derived_from', source: 'checkin' });
    } catch (error) {
      // The record is made and on the receipt; only where it came from is
      // missing, which the action's origin still says.
      console.error('[checkin] could not link ' + line.name + ' to the entry it was drawn from:', error);
    }
  }
  return receipt.lines;
}

/**
 * Files a list of answers to a day's check-in, in order, and returns the
 * lines of this list alone -- the day's whole receipt is `checkinReceipt`.
 * The questions are recomputed from the store, never taken from the caller:
 * an answer to a question the day does not ask, or a value that does not fit
 * its question, is a rejected line and writes nothing; the other answers are
 * filed all the same. Like a list of actions, a list of answers is not atomic.
 *
 * An open answer is a journal entry, word for word. Given `readOpenAnswer`,
 * the entry is then read for the records it names -- after it is kept, never
 * before -- and their lines follow the entry's (`fileDrawnFrom`). Without
 * one, nothing is read: no model is reached from here.
 *
 * @param {string} day a day key, not in the future
 * @param {readonly Answer[]} answers
 * @param {{ readOpenAnswer?: OpenAnswerReader }} [options]
 * @returns {Promise<import('../actions/registry.js').Receipt>}
 */
export async function answerCheckin(day, answers, options = {}) {
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
    if (question.kind === 'open' && options.readOpenAnswer !== undefined && receipt.lines.length === 1) {
      lines.push(...(await fileDrawnFrom(day, receipt.lines[0], questions, options.readOpenAnswer)));
    }
  }

  return { lines };
}
