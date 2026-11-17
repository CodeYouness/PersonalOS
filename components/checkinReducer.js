/**
 * The check-in panel's state machine (ADR 0037), kept apart from the
 * components that draw it so the transitions are testable without a DOM, as
 * captureBarReducer.js is for the capture bar.
 *
 * What a day says -- its questions, whether it is done, what it was answered
 * with, its notes and the week strip -- is only ever the server's: what the
 * page was rendered with (`loaded`, again on every `router.refresh()` and
 * when another day is picked), what POST /api/checkin answered (`answered`)
 * or what GET answered after an undo (`undoSettled`). The panel never moves
 * a question on its own memory of what it sent. What it keeps itself is
 * only what has not been sent, and where you are:
 *
 * - which question is shown -- the first one left, unless you went back
 *   (`cursor`) or set some aside for now (`aside`);
 * - whether the sheet of every answer is open (`sheet`);
 * - a counter's count, the time being declared, the note being typed;
 * - why a request failed, said once where it happened.
 *
 *   idle --submit--> pending --answered / failed--> idle
 *   idle --undoStart--> pending --undoSettled--> idle
 *
 * One request at a time, for the whole panel: `pending` names what it runs
 * for, and every button waits, so two answers never land out of order. A
 * new day loaded starts clean: nothing typed or stepped carries from one day
 * to another.
 */

import { OPEN_QUESTION_ID } from '@/lib/domain/derive/checkin.js';

/**
 * @typedef {import('@/lib/domain/derive/checkin.js').Question} Question
 * @typedef {import('@/lib/domain/derive/checkin.js').CountedHabit} CountedHabit
 * @typedef {import('@/lib/domain/derive/checkin.js').CheckinAnswers} CheckinAnswers
 * @typedef {import('@/lib/domain/derive/checkin.js').CheckinWeekDay} CheckinWeekDay
 * @typedef {import('@/lib/checkin/day.js').CheckinNote} CheckinNote
 * @typedef {import('@/lib/actions/registry.js').ReceiptLine} ReceiptLine
 *
 * @typedef {object} CheckinServerState what a day says, as the server read it
 * @property {string} day the day shown
 * @property {Question[]} questions
 * @property {CountedHabit[]} [counted] the habits the day's time answers, never
 *   a question (ADR 0039); none when absent
 * @property {boolean} done
 * @property {CheckinAnswers} answers
 * @property {CheckinNote[]} notes
 * @property {CheckinWeekDay[]} week the seven days ending today, oldest first
 *
 * @typedef {CheckinServerState & { receipt: { lines: ReceiptLine[] } }} CheckinAnswerResponse
 *   what POST /api/checkin answers: the day after the writes, and this request's lines alone
 *
 * @typedef {object} CheckinLocal
 * @property {string | null} pending what a request runs for: a question id, or `undo:<actionId>`
 * @property {Record<string, string>} errors why a question's last answer did not land, by question id
 * @property {Record<string, string>} lineErrors why an undo was refused, by action id
 * @property {ReceiptLine[]} noteProblems what was drawn from the last note and not
 *   filed, said once, until the next request
 * @property {string | null} cursor the question shown because you went back to it
 * @property {string[]} aside questions set aside for now, the longest ago first
 * @property {boolean} sheet whether the sheet of every answer is open
 * @property {Record<string, number>} counts a counter's count not yet sent, by question id
 * @property {Record<string, number> | null} time the time being declared, minutes by
 *   area -- an area at nothing has no key; null while untouched, showing what is saved
 * @property {string | null} openText the note being typed; null before anything is
 *   typed for this day in this mount, so the panel shows the draft the browser kept
 *
 * @typedef {CheckinServerState & CheckinLocal} CheckinState
 *
 * @typedef {
 *   | ({ type: 'loaded' } & CheckinServerState)
 *   | { type: 'submit', questionId: string }
 *   | { type: 'answered', questionId: string, response: CheckinAnswerResponse }
 *   | { type: 'failed', questionId: string, error: string }
 *   | { type: 'undoStart', actionId: string }
 *   | { type: 'undoSettled', actionId: string, error: string | null, server: CheckinServerState | null }
 *   | { type: 'count', questionId: string, value: number }
 *   | { type: 'time', area: string, minutes: number }
 *   | { type: 'type', text: string }
 *   | { type: 'back' }
 *   | { type: 'next' }
 *   | { type: 'openSheet' }
 *   | { type: 'closeSheet' }
 * } CheckinAction
 */

/** @returns {CheckinLocal} */
function freshLocal() {
  return {
    pending: null,
    errors: {},
    lineErrors: {},
    noteProblems: [],
    cursor: null,
    aside: [],
    sheet: false,
    counts: {},
    time: null,
    openText: null,
  };
}

/**
 * @param {CheckinServerState} server
 * @returns {CheckinServerState} only the server's fields, whatever else came with them
 */
function serverPart({ day, questions, counted = [], done, answers, notes, week }) {
  return { day, questions, counted, done, answers, notes, week };
}

/**
 * @param {CheckinServerState} server
 * @returns {CheckinState}
 */
export function initialCheckinState(server) {
  return { ...serverPart(server), ...freshLocal() };
}

/**
 * Every question but the open one, in the order the day asks them: what is
 * answered one at a time, and what "left" counts.
 *
 * @param {Pick<CheckinState, 'questions'>} state
 * @returns {Question[]}
 */
export function closedQuestions(state) {
  return state.questions.filter((question) => question.kind !== 'open');
}

/**
 * How far the day's check-in is: questions answered out of every question
 * but the open one, which never closes and is never "left".
 *
 * @param {Pick<CheckinState, 'questions' | 'done'>} state
 * @returns {{ answered: number, total: number, left: number, done: boolean }}
 */
export function progress(state) {
  const closed = closedQuestions(state);
  const answered = closed.filter((question) => question.answered).length;
  return { answered, total: closed.length, left: closed.length - answered, done: state.done };
}

/**
 * The question the card shows, or null once the day is done -- the summary
 * shows then. The one you went back to; else the first one left that is not
 * set aside; else, when every one left is set aside, the one set aside
 * longest ago, so "Skip for now" goes round them.
 *
 * @param {CheckinState} state
 * @returns {Question | null}
 */
export function currentQuestion(state) {
  if (state.done) return null;
  const closed = closedQuestions(state);
  if (state.cursor !== null) {
    const chosen = closed.find((question) => question.id === state.cursor);
    if (chosen !== undefined) return chosen;
  }
  const left = closed.filter((question) => !question.answered);
  const first = left.find((question) => !state.aside.includes(question.id));
  if (first !== undefined) return first;
  const longest = state.aside.map((id) => left.find((question) => question.id === id)).find((question) => question !== undefined);
  return longest ?? left[0] ?? null;
}

/**
 * Whether there is a question before the one shown to go back to.
 *
 * @param {CheckinState} state
 * @returns {boolean}
 */
export function canGoBack(state) {
  const shown = currentQuestion(state);
  return shown !== null && closedQuestions(state).indexOf(shown) > 0;
}

/**
 * Whether the card can move on without an answer: the one shown is answered
 * (you went back to it), or another question is still left.
 *
 * @param {CheckinState} state
 * @returns {boolean}
 */
export function canGoOn(state) {
  const shown = currentQuestion(state);
  if (shown === null) return false;
  return shown.answered || closedQuestions(state).some((question) => !question.answered && question.id !== shown.id);
}

/**
 * The day the week ends on: today, as the server said it.
 *
 * @param {Pick<CheckinState, 'week' | 'day'>} state
 * @returns {string}
 */
export function todayOf(state) {
  return state.week.at(-1)?.day ?? state.day;
}

/**
 * Yesterday, when it is not filled and today is the day shown: the one
 * banner that asks for a past day. Older days left open are the strip's.
 *
 * @param {Pick<CheckinState, 'week' | 'day'>} state
 * @returns {CheckinWeekDay | null}
 */
export function yesterdayOpen(state) {
  const yesterday = state.week.at(-2);
  if (yesterday === undefined || state.day !== todayOf(state)) return null;
  return yesterday.fill === 'filled' ? null : yesterday;
}

/**
 * A counter's count as the day has it saved: nothing when it has none.
 *
 * @param {Pick<CheckinState, 'answers'>} state
 * @param {Question} question
 * @returns {number}
 */
export function savedCount(state, question) {
  const saved = question.subjectId === undefined ? undefined : state.answers.habits[question.subjectId];
  return typeof saved === 'number' ? saved : 0;
}

/**
 * A counter's count as the stepper shows it: the count not yet sent, else
 * the saved one.
 *
 * @param {Pick<CheckinState, 'answers' | 'counts'>} state
 * @param {Question} question
 * @returns {number}
 */
export function counterValue(state, question) {
  return question.id in state.counts ? state.counts[question.id] : savedCount(state, question);
}

/**
 * The time as the steppers show it: what is being declared, else what is
 * saved, else nothing.
 *
 * @param {Pick<CheckinState, 'answers' | 'time'>} state
 * @returns {Record<string, number>}
 */
export function timeShown(state) {
  return state.time ?? state.answers.time ?? {};
}

/**
 * The areas Save sends, as `time.set` takes them: on a day not declared,
 * the areas given some time; on one declared, every area whose minutes
 * changed, one taken to nothing as 0. Empty when there is nothing to save.
 *
 * @param {Pick<CheckinState, 'answers' | 'time'>} state
 * @returns {Record<string, number>}
 */
export function timeChanges(state) {
  const saved = state.answers.time;
  const shown = timeShown(state);
  if (saved === null) return Object.fromEntries(Object.entries(shown).filter(([, minutes]) => minutes > 0));
  /** @type {Record<string, number>} */
  const changes = {};
  for (const area of new Set([...Object.keys(saved), ...Object.keys(shown)])) {
    const next = shown[area] ?? 0;
    if (next !== (saved[area] ?? 0)) changes[area] = next;
  }
  return changes;
}

/**
 * @param {CheckinState} state
 * @param {string} questionId
 * @param {number} value
 * @returns {number} on the stepper: from nothing to the counter's target that day
 */
function clampCount(state, questionId, value) {
  const target = state.questions.find((question) => question.id === questionId)?.target;
  const floor = Math.max(0, Math.round(value));
  return typeof target === 'number' && target > 0 ? Math.min(floor, target) : floor;
}

/**
 * @template T
 * @param {Record<string, T>} record
 * @param {(key: string, value: T) => boolean} keep
 * @returns {Record<string, T>}
 */
function keepWhere(record, keep) {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => keep(key, value)));
}

/**
 * @param {Record<string, string>} record
 * @param {string} key
 * @returns {Record<string, string>}
 */
function without(record, key) {
  return keepWhere(record, (other) => other !== key);
}

/**
 * The state after the server said what a day is. Another day starts clean.
 * The same day keeps what is not sent yet and where you are, for the
 * questions it still asks; a count is dropped once it is what is saved.
 *
 * @param {CheckinState} state
 * @param {CheckinServerState} server
 * @returns {CheckinState}
 */
function withServer(state, server) {
  if (server.day !== state.day) return initialCheckinState(server);
  // A habit counted from time is answered by its id too -- with a reason,
  // from the sheet -- so what it was told stays with it.
  const ids = new Set([...server.questions.map((question) => question.id), ...(server.counted ?? []).map((habit) => 'habit:' + habit.id)]);
  /** @type {CheckinState} */
  const next = { ...state, ...serverPart(server) };
  next.errors = keepWhere(state.errors, (id) => ids.has(id));
  next.aside = state.aside.filter((id) => ids.has(id));
  if (state.cursor !== null && !ids.has(state.cursor)) next.cursor = null;
  next.counts = keepWhere(state.counts, (id, count) => {
    const question = server.questions.find((other) => other.id === id);
    return question !== undefined && savedCount(next, question) !== count;
  });
  return next;
}

/**
 * The state after an answer's response: moved on, its drafts cleared. What
 * did not land is said where it was asked. For the note its own line
 * decides: once the entry is kept the box empties -- saving it again would
 * keep it twice -- and what was not filed from it is said under the note.
 *
 * @param {CheckinState} state
 * @param {string} questionId
 * @param {CheckinAnswerResponse} response
 * @returns {CheckinState}
 */
function afterAnswer(state, questionId, response) {
  const next = withServer({ ...state, pending: null }, response);
  const lines = response.receipt.lines;
  /** @param {ReceiptLine} line */
  const problem = (line) => line.status === 'rejected' || line.status === 'failed';
  /** @param {ReceiptLine[]} problems */
  const say = (problems) => problems.map((line) => line.error ?? line.text).join('; ');

  if (questionId === OPEN_QUESTION_ID) {
    const [entry, ...drawn] = lines;
    if (entry === undefined || problem(entry)) {
      return { ...next, errors: { ...next.errors, [questionId]: entry === undefined ? 'Nothing was saved' : say([entry]) } };
    }
    return { ...next, openText: '', noteProblems: drawn.filter(problem) };
  }

  const problems = lines.filter(problem);
  if (problems.length > 0) return { ...next, errors: { ...next.errors, [questionId]: say(problems) } };
  return {
    ...next,
    counts: keepWhere(next.counts, (id) => id !== questionId),
    cursor: null,
    aside: next.aside.filter((id) => id !== questionId),
    time: questionId === 'time' ? null : next.time,
  };
}

/**
 * @param {CheckinState} state
 * @param {CheckinAction} action
 * @returns {CheckinState}
 */
export function checkinReducer(state, action) {
  switch (action.type) {
    case 'loaded':
      return withServer(state, action);

    case 'submit':
      return { ...state, pending: action.questionId, errors: without(state.errors, action.questionId), noteProblems: [] };

    case 'answered':
      return afterAnswer(state, action.questionId, action.response);

    case 'failed':
      return { ...state, pending: null, errors: { ...state.errors, [action.questionId]: action.error } };

    case 'undoStart':
      return { ...state, pending: 'undo:' + action.actionId, lineErrors: without(state.lineErrors, action.actionId), noteProblems: [] };

    case 'undoSettled': {
      const settled = { ...state, pending: null };
      const next = action.server === null ? settled : withServer(settled, action.server);
      if (action.error !== null) next.lineErrors = { ...next.lineErrors, [action.actionId]: action.error };
      return next;
    }

    case 'count':
      return { ...state, counts: { ...state.counts, [action.questionId]: clampCount(state, action.questionId, action.value) } };

    case 'time': {
      const time = { ...timeShown(state) };
      if (action.minutes > 0) time[action.area] = action.minutes;
      else delete time[action.area];
      return { ...state, time };
    }

    case 'type':
      return { ...state, openText: action.text };

    case 'back': {
      const shown = currentQuestion(state);
      const closed = closedQuestions(state);
      const index = shown === null ? -1 : closed.indexOf(shown);
      return index > 0 ? { ...state, cursor: closed[index - 1].id } : state;
    }

    case 'next': {
      const shown = currentQuestion(state);
      if (shown === null) return state;
      if (!shown.answered) return { ...state, cursor: null, aside: [...state.aside.filter((id) => id !== shown.id), shown.id] };
      const closed = closedQuestions(state);
      return { ...state, cursor: closed[closed.indexOf(shown) + 1]?.id ?? null };
    }

    case 'openSheet':
      return { ...state, sheet: true };

    case 'closeSheet':
      return { ...state, sheet: false, counts: {}, time: null };

    default:
      return state;
  }
}
