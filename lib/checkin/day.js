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

import { dayKeysEndingAt, isDayKey } from '../domain/dates.js';
import { TIME_AREA_KEYS } from '../domain/day-time.js';
import { CHECKIN_WEEK_DAYS, checkinAnswers, checkinQuestions, checkinWeek, countedHabits, isCheckinDone } from '../domain/derive/checkin.js';
import { receiptFor, runActions } from '../actions/registry.js';
import { createLink, getActionRecord, getActionRecords, getDailyLog, getDailyLogs, getJournalEntry, getProfile } from '../store.js';
import { actionsForAnswer, actionsForCounted } from './closed.js';

/** What every check-in action is made under, and what its receipt is read by. */
const ORIGIN = Object.freeze({ type: 'checkin', id: null });

/**
 * @typedef {{ questionId: string, value: unknown }} Answer
 */

/**
 * Reads an open answer for the records it names, as action requests, and
 * never throws (./interpret.js's `readOpenAnswer`). `habits` are the habits
 * the day still leaves open, and `timeDeclared` whether the day's time is
 * already declared: what the day already says is not filed again from it.
 * `counted` the habits counted from a time area (ADR 0039), which only time
 * files.
 *
 * @typedef {(text: string, about: { day: string, habits: import('./interpret.js').HabitContext[], timeDeclared?: boolean, counted?: import('./interpret.js').CountedContext[] }) => Promise<import('./interpret.js').OpenAnswerReading>} OpenAnswerReader
 */

/**
 * @typedef {import('../domain/derive/checkin.js').Question} Question
 * @typedef {import('../domain/derive/checkin.js').CountedHabit} CountedHabit
 * @typedef {import('../actions/registry.js').ReceiptLine} ReceiptLine
 */

/**
 * The day's log as the store says now, the questions computed from it,
 * whether the check-in is done, and the habits its time answers (ADR 0039).
 *
 * @param {string} day
 * @returns {Promise<{ log: import('../domain/types.js').DailyLog, questions: Question[], done: boolean, counted: CountedHabit[] }>}
 */
async function readDay(day) {
  const [profile, log] = await Promise.all([getProfile(), getDailyLog(day)]);
  const questions = checkinQuestions({ habits: profile.habits, log, dayKey: day, timeAreas: TIME_AREA_KEYS });
  return { log, questions, done: isCheckinDone(questions), counted: countedHabits({ habits: profile.habits, dayKey: day }) };
}

/**
 * The day's questions as the store says now, and whether the check-in is done.
 *
 * @param {string} day
 * @returns {Promise<{ questions: Question[], done: boolean }>}
 */
export async function questionsFor(day) {
  const { questions, done } = await readDay(day);
  return { questions, done };
}

/**
 * The check-in's week strip: the seven days ending on `todayKey`, oldest
 * first, each filled, partly filled or not (`checkinWeek`). Derived from the
 * logs on every read, never stored (rule 6); reading it writes nothing.
 *
 * @param {string} todayKey today in the user's timezone, from lib/domain/dates.js
 * @returns {Promise<import('../domain/derive/checkin.js').CheckinWeekDay[]>}
 */
export async function checkinWeekFor(todayKey) {
  const days = dayKeysEndingAt(CHECKIN_WEEK_DAYS, todayKey);
  const [profile, logs] = await Promise.all([getProfile(), getDailyLogs(days[0], todayKey)]);
  return checkinWeek({ habits: profile.habits, logs, days, timeAreas: TIME_AREA_KEYS });
}

/**
 * The day a screen shows the check-in for: the one asked, when it is one of
 * the week strip's seven days, else today. A future day, a day older than
 * the strip and anything that is not a day key are today.
 *
 * @param {unknown} asked
 * @param {string} todayKey
 * @returns {string}
 */
export function weekDayOrToday(asked, todayKey) {
  return typeof asked === 'string' && isDayKey(asked) && dayKeysEndingAt(CHECKIN_WEEK_DAYS, todayKey).includes(asked) ? asked : todayKey;
}

/**
 * One open answer kept in the day's check-in, as the panel shows it: the
 * entry's words, its own line's id and whether it can still be taken back,
 * and the lines of what was filed from it.
 *
 * @typedef {object} CheckinNote
 * @property {string} actionId the `journal.add` action that kept it
 * @property {string} entryId
 * @property {string} text the entry as it reads now, or as it was said if it is gone
 * @property {boolean} undoable
 * @property {ReceiptLine[]} filed what the small model filed from it, in order, undone ones included
 */

/**
 * The open answers the day's check-in kept and not taken back, oldest first,
 * each with what was filed from it -- read off the day's check-in receipt and
 * its action records. What was filed from a note is shown nowhere else, so
 * the panel lists it under the note with its Undo. Reading writes nothing.
 *
 * @param {string} day
 * @param {import('../actions/registry.js').Receipt} receipt the day's check-in receipt, as `checkinReceipt` reads it
 * @returns {Promise<CheckinNote[]>}
 */
export async function checkinNotes(day, receipt) {
  const records = await getActionRecords({ day, origin: { type: ORIGIN.type } });
  const byId = new Map(receipt.lines.map((line) => [line.actionId, line]));
  /** @type {CheckinNote[]} */
  const notes = [];
  for (const record of [...records].reverse()) {
    if (record.name !== 'journal.add' || record.status !== 'done' || record.origin.id !== null || record.recordRef === null) continue;
    const entryId = record.recordRef;
    const said = /** @type {{ text?: unknown }} */ (record.params ?? {}).text;
    const entry = await getJournalEntry(entryId);
    const filed = records
      .filter((other) => other.origin.id === entryId)
      .reverse()
      .map((other) => byId.get(other.id))
      .filter((line) => line !== undefined);
    notes.push({
      actionId: record.id,
      entryId,
      text: entry?.text ?? (typeof said === 'string' ? said : ''),
      undoable: byId.get(record.id)?.undoable ?? false,
      filed,
    });
  }
  return notes;
}

/**
 * Everything the check-in panel shows of a day, as GET /api/checkin answers
 * it: the questions and whether the day is done, the habits its time
 * answers instead of a question (`counted`, ADR 0039), what it was answered with,
 * the notes and what was filed from them, the day's whole check-in receipt,
 * and the week ending today. No model and no integration (rule 3); reading
 * it writes nothing.
 *
 * @param {string} day a day key, not in the future
 * @param {string} todayKey today, which the week ends on
 */
export async function checkinDay(day, todayKey) {
  const [{ log, questions, done, counted }, receipt, week] = await Promise.all([readDay(day), checkinReceipt(day), checkinWeekFor(todayKey)]);
  const notes = await checkinNotes(day, receipt);
  return { day, questions, done, counted, answers: checkinAnswers(log), notes, receipt, week };
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
 * Whether the day already holds something for a habit: a value -- ticked,
 * unticked or a count -- or a skip reason. A habit the closed questions
 * already answered is not filed again from the open answer.
 *
 * @param {import('../domain/types.js').DailyLog} log
 * @param {unknown} habitId
 * @returns {boolean}
 */
function habitHasAnswer(log, habitId) {
  return typeof habitId === 'string' && (habitId in log.habits || habitId in (log.skips ?? {}));
}

/**
 * The habits the day asks about and holds nothing for yet, as a reader of
 * the open answer is told them: those are the only ones it may file.
 *
 * @param {readonly Question[]} questions
 * @param {import('../domain/types.js').DailyLog} log
 * @returns {import('./interpret.js').HabitContext[]}
 */
function habitsLeft(questions, log) {
  return questions
    .filter((question) => question.kind === 'habit' && typeof question.subjectId === 'string' && !habitHasAnswer(log, question.subjectId))
    .map((question) => ({
      id: /** @type {string} */ (question.subjectId),
      name: question.label,
      type: question.habitType ?? 'check',
      target: question.target ?? null,
    }));
}

/**
 * Whether a request drawn from the open answer would file again what the day
 * already says: a habit that has a value or a skip reason, a habit counted
 * from a time area -- the time says it (ADR 0039) -- or time on a day whose
 * time is already declared. Such a request is dropped -- the closed answer
 * stands, and "went to the gym" does not tick the gym twice.
 *
 * @param {import('../actions/registry.js').ActionRequest} request
 * @param {import('../domain/types.js').DailyLog} log
 * @param {readonly CountedHabit[]} counted the day's habits counted from time
 * @returns {boolean}
 */
function alreadyAnswered(request, log, counted) {
  if (request.name === 'habit.set' || request.name === 'habit.skip') {
    const habitId = /** @type {{ habitId?: unknown }} */ (request.params ?? {}).habitId;
    return habitHasAnswer(log, habitId) || counted.some((habit) => habit.id === habitId);
  }
  if (request.name === 'time.set' || request.name === 'time.none') return log.time !== null;
  return false;
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
 * The day is read again first, so the answers filed before this one -- in
 * this request too -- count: the reader is told only the habits the day holds
 * nothing for and whether its time is declared, and a request for something
 * the day already says is dropped (`alreadyAnswered`). Dropped, not
 * rejected: the closed answer stands and nothing went wrong, so the server
 * log says it and the receipt does not.
 *
 * @param {string} day
 * @param {ReceiptLine} journalLine
 * @param {OpenAnswerReader} read
 * @returns {Promise<ReceiptLine[]>}
 */
async function fileDrawnFrom(day, journalLine, read) {
  if (journalLine.status !== 'done' || journalLine.actionId === null) return [];
  const kept = await getActionRecord(journalLine.actionId);
  const entryId = kept?.recordRef ?? null;
  const text = /** @type {{ text?: unknown }} */ (kept?.params ?? {}).text;
  if (entryId === null || typeof text !== 'string') return [];

  const { log, questions, counted } = await readDay(day);
  let reading;
  try {
    reading = await read(text, {
      day,
      habits: habitsLeft(questions, log),
      timeDeclared: log.time !== null,
      counted: counted.map((habit) => ({ name: habit.label, area: habit.area })),
    });
  } catch (error) {
    console.error('[checkin] the open answer was not read, only its journal entry is filed:', error);
    return [];
  }
  if (reading.outcome !== 'actions') return [];
  const requests = reading.requests.filter((request) => !alreadyAnswered(request, log, counted));
  if (requests.length < reading.requests.length) {
    console.info('[checkin] not filed again from the open answer, the day already says it:', reading.requests.filter((request) => alreadyAnswered(request, log, counted)).map((request) => request.name).join(', '));
  }
  if (requests.length === 0) return [];

  const receipt = await runActions(requests, { day, source: 'checkin', origin: { type: 'checkin', id: entryId } });
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
 * A habit counted from a time area (ADR 0039) is answered by `habit:<id>`
 * too, though it is not a question: with a reason only, never a tick.
 *
 * An open answer is a journal entry, word for word. Given `readOpenAnswer`,
 * the entry is then read for the records it names -- after it is kept, never
 * before -- and their lines follow the entry's (`fileDrawnFrom`). Without
 * one, nothing is read: no model is reached from here.
 *
 * `clientId` is the caller's own id for the open answer it sends, for a
 * channel that may deliver the same one twice (ADR 0068): the journal entry
 * is written once for it. It names one sentence, so a caller that gives it
 * sends one open answer.
 *
 * @param {string} day a day key, not in the future
 * @param {readonly Answer[]} answers
 * @param {{ readOpenAnswer?: OpenAnswerReader, clientId?: string }} [options]
 * @returns {Promise<import('../actions/registry.js').Receipt>}
 */
export async function answerCheckin(day, answers, options = {}) {
  const { questions, counted } = await readDay(day);
  const byId = new Map(questions.map((question) => [question.id, question]));
  const countedById = new Map(counted.map((habit) => ['habit:' + habit.id, habit]));
  /** @type {ReceiptLine[]} */
  const lines = [];

  for (const answer of answers) {
    const question = byId.get(answer.questionId);
    const countedHabit = countedById.get(answer.questionId);
    if (question === undefined && countedHabit !== undefined) {
      // Not a question, but its reason is still the day's to give (ADR 0039).
      const shaped = actionsForCounted(countedHabit, answer.value);
      if (!shaped.ok) lines.push(rejectedLine(answer.questionId + ': ' + shaped.error));
      else lines.push(...(await runActions(shaped.requests, { day, source: 'checkin', origin: ORIGIN })).lines);
      continue;
    }
    if (question === undefined) {
      lines.push(rejectedLine('the check-in for ' + day + ' asks no question ' + JSON.stringify(answer.questionId)));
      continue;
    }
    // A habit's answer may depend on what the day holds now -- a reason
    // given to a habit ticked unticks it first (./closed.js) -- so the day is
    // read for each, after the answers before it were filed.
    const log = question.kind === 'habit' ? await getDailyLog(day) : undefined;
    const shaped = actionsForAnswer(question, answer.value, log);
    if (!shaped.ok) {
      lines.push(rejectedLine(question.id + ': ' + shaped.error));
      continue;
    }
    const receipt = await runActions(shaped.requests, {
      day,
      source: 'checkin',
      origin: ORIGIN,
      ...(question.kind === 'open' && options.clientId !== undefined ? { clientId: options.clientId } : {}),
    });
    lines.push(...receipt.lines);
    if (question.kind === 'open' && options.readOpenAnswer !== undefined && receipt.lines.length === 1) {
      lines.push(...(await fileDrawnFrom(day, receipt.lines[0], options.readOpenAnswer)));
    }
  }

  return { lines };
}
