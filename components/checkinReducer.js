/**
 * The check-in panel's state machine (ADR 0037), kept apart from the
 * components that draw it so the transitions are testable without a DOM, as
 * captureBarReducer.js is for the capture bar.
 *
 * What the day says -- the questions, whether the check-in is done, the
 * day's receipt, the habits' values -- is only ever the server's: what the
 * page was rendered with (`loaded`, again on every `router.refresh()`), what
 * POST /api/checkin answered (`answered`) or what GET answered after an undo
 * (`undoSettled`). The panel never moves a question on its own memory of
 * what it sent. What it keeps itself is only what has not been sent: a
 * counter's count, the time being declared, the open answer being typed,
 * which skip list is open, and why a request failed.
 *
 *   idle --submit--> pending --answered / failed--> idle
 *   idle --undoStart--> pending --undoSettled--> idle
 *
 * One request at a time, for the whole panel: `pending` names the row it
 * runs for, and every button waits, so two answers never land out of order.
 */

import { openQuestions } from '@/lib/domain/derive/checkin.js';

/**
 * @typedef {import('@/lib/domain/derive/checkin.js').Question} Question
 * @typedef {import('@/lib/actions/registry.js').ReceiptLine} ReceiptLine
 *
 * @typedef {object} CheckinServerState what the day says, as the server read it
 * @property {Question[]} questions
 * @property {boolean} done
 * @property {ReceiptLine[]} lines the day's check-in receipt as kept
 *
 * @typedef {object} CheckinAnswerResponse what POST /api/checkin answers
 * @property {Question[]} questions
 * @property {boolean} done
 * @property {{ lines: ReceiptLine[] }} receipt this request's lines alone
 * @property {{ lines: ReceiptLine[] }} dayReceipt the day's, as kept
 *
 * @typedef {object} CheckinState
 * @property {Question[]} questions
 * @property {boolean} done
 * @property {ReceiptLine[]} lines the day's check-in receipt as kept
 * @property {ReceiptLine[]} unkept the last answer's lines the day keeps no
 *   record of -- a rejected one -- shown after the kept ones until the next request
 * @property {Record<string, boolean | number>} values the day's habit values, by habit id
 * @property {string | null} pending the row a request runs for: a question id, or `undo:<actionId>`
 * @property {Record<string, string>} errors why a question's last answer did not land, by question id
 * @property {Record<string, string>} lineErrors why a line's undo was refused, by action id
 * @property {string | null} skipping the habit question whose skip reasons are shown
 * @property {Record<string, number>} counts a counter's count not yet sent, by question id
 * @property {Record<string, number>} time the time being declared, minutes by area; an area at nothing has no key
 * @property {string | null} openText the open answer being typed; null before anything is typed
 *   in this mount, so the panel shows the draft the browser kept
 *
 * @typedef {
 *   | ({ type: 'loaded', values?: Record<string, boolean | number> } & CheckinServerState)
 *   | { type: 'submit', questionId: string }
 *   | { type: 'answered', questionId: string, response: CheckinAnswerResponse }
 *   | { type: 'failed', questionId: string, error: string }
 *   | { type: 'undoStart', actionId: string }
 *   | { type: 'undoSettled', actionId: string, error: string | null, server: CheckinServerState | null }
 *   | { type: 'toggleSkip', questionId: string }
 *   | { type: 'count', questionId: string, value: number }
 *   | { type: 'time', area: string, minutes: number }
 *   | { type: 'type', text: string }
 * } CheckinAction
 */

/**
 * @param {CheckinServerState & { values: Record<string, boolean | number> }} initial
 * @returns {CheckinState}
 */
export function initialCheckinState({ questions, done, lines, values }) {
  return {
    questions,
    done,
    lines,
    unkept: [],
    values,
    pending: null,
    errors: {},
    lineErrors: {},
    skipping: null,
    counts: {},
    time: {},
    openText: null,
  };
}

/**
 * The questions still to ask as rows, in order -- the open one is not a row,
 * it is the box under them.
 *
 * @param {CheckinState} state
 * @returns {Question[]}
 */
export function rowsToAsk(state) {
  return openQuestions(state.questions).filter((question) => question.kind !== 'open');
}

/**
 * How far the day's check-in is: questions answered out of every question
 * but the open one, which never closes.
 *
 * @param {CheckinState} state
 * @returns {{ answered: number, total: number, done: boolean }}
 */
export function progress(state) {
  const closed = state.questions.filter((question) => question.kind !== 'open');
  return { answered: closed.filter((question) => question.answered).length, total: closed.length, done: state.done };
}

/**
 * The receipt as shown: the day's kept lines in the order they were made,
 * then the last answer's lines the day keeps no record of.
 *
 * @param {CheckinState} state
 * @returns {ReceiptLine[]}
 */
export function receiptLines(state) {
  return state.unkept.length === 0 ? state.lines : [...state.lines, ...state.unkept];
}

/**
 * A counter's count as the day has it saved: nothing when it has none.
 *
 * @param {CheckinState} state
 * @param {Question} question
 * @returns {number}
 */
export function savedCount(state, question) {
  const saved = question.subjectId === undefined ? undefined : state.values[question.subjectId];
  return typeof saved === 'number' ? saved : 0;
}

/**
 * A counter's count as the stepper shows it: the count not yet sent, else
 * the saved one.
 *
 * @param {CheckinState} state
 * @param {Question} question
 * @returns {number}
 */
export function counterValue(state, question) {
  return question.id in state.counts ? state.counts[question.id] : savedCount(state, question);
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
 * The state after the server said what the day is: drafts and errors kept
 * only for questions still asked, a count dropped once it is what is saved.
 *
 * @param {CheckinState} state
 * @param {CheckinServerState} server
 * @param {Record<string, boolean | number>} values
 * @returns {CheckinState}
 */
function withServer(state, server, values) {
  const asked = new Set(openQuestions(server.questions).map((question) => question.id));
  const next = { ...state, questions: server.questions, done: server.done, lines: server.lines, values };
  next.errors = keepWhere(state.errors, (id) => asked.has(id));
  next.counts = keepWhere(state.counts, (id, count) => {
    if (!asked.has(id)) return false;
    const habitId = server.questions.find((question) => question.id === id)?.subjectId;
    return habitId === undefined || values[habitId] !== count;
  });
  if (!asked.has('time')) next.time = {};
  if (state.skipping !== null && !asked.has(state.skipping)) next.skipping = null;
  return next;
}

/**
 * @param {CheckinState} state
 * @param {CheckinAction} action
 * @returns {CheckinState}
 */
export function checkinReducer(state, action) {
  switch (action.type) {
    case 'loaded':
      return withServer(state, action, action.values ?? state.values);

    case 'submit':
      return { ...state, pending: action.questionId, errors: without(state.errors, action.questionId), unkept: [] };

    case 'answered': {
      const { response, questionId } = action;
      /** @type {ReceiptLine[]} */
      const mine = response.receipt.lines;
      const next = withServer(
        { ...state, pending: null },
        { questions: response.questions, done: response.done, lines: response.dayReceipt.lines },
        state.values
      );
      next.unkept = mine.filter((line) => line.actionId === null);
      const problems = mine.filter((line) => line.status === 'rejected' || line.status === 'failed');
      if (problems.length > 0) {
        next.errors = { ...next.errors, [questionId]: problems.map((line) => line.error ?? line.text).join('; ') };
        return next;
      }
      if (questionId === 'open') next.openText = '';
      if (questionId === 'time') next.time = {};
      if (next.skipping === questionId) next.skipping = null;
      return next;
    }

    case 'failed':
      return { ...state, pending: null, errors: { ...state.errors, [action.questionId]: action.error } };

    case 'undoStart':
      return { ...state, pending: 'undo:' + action.actionId, lineErrors: without(state.lineErrors, action.actionId), unkept: [] };

    case 'undoSettled': {
      const settled = { ...state, pending: null };
      const next = action.server === null ? settled : withServer(settled, action.server, state.values);
      if (action.error !== null) next.lineErrors = { ...next.lineErrors, [action.actionId]: action.error };
      return next;
    }

    case 'toggleSkip':
      return { ...state, skipping: state.skipping === action.questionId ? null : action.questionId };

    case 'count':
      return { ...state, counts: { ...state.counts, [action.questionId]: clampCount(state, action.questionId, action.value) } };

    case 'time': {
      const time = { ...state.time };
      if (action.minutes > 0) time[action.area] = action.minutes;
      else delete time[action.area];
      return { ...state, time };
    }

    case 'type':
      return { ...state, openText: action.text };

    default:
      return state;
  }
}
