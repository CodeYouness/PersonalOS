/**
 * The capture bar's state machine, kept separate from the component that
 * renders it so the transitions are testable without a DOM.
 *
 * Status matches design/mockup.html's data-state values minus "listening"
 * -- voice input is out of scope this pass, text only. `error` is not in the
 * mockup (an idealised comp has no failure states); it exists so a request
 * that never lands still tells the user something, per the rule that capture
 * must never look like it silently vanished. `asking` is the question twin
 * of `processing` (#172, ADR 0028).
 *
 *   idle --submit--> processing --receiptReceived--> done --dismiss--> idle
 *                        \--requestFailed--> error --dismiss--> idle
 *   idle --submitQuestion--> asking --answerReceived / questionFailed--> idle
 *
 * `mode` is the only thing that decides whether a sentence is filed or asked
 * -- never its content -- and every answer outcome sends it back to
 * `capture`, so the next sentence is a capture unless the user asks again.
 * `answer` is the panel above the bar; it is independent of `status`, so a
 * receipt coming and going never touches it.
 */

/**
 * @typedef {object} CitationChip
 * @property {string} id
 * @property {string} type
 * @property {string} label
 * @property {string[]} [labels] how the record stands: done, archived, expired, unconfirmed
 *
 * @typedef {object} AnswerStatement
 * @property {string} text
 * @property {CitationChip[]} citations
 *
 * @typedef {object} AnswerResult what the questions route said, without the question
 * @property {'answer' | 'not-in-data' | 'no-model'} outcome
 * @property {AnswerStatement[]} [statements]
 * @property {boolean} [leftOut]
 *
 * @typedef {object} AnswerState
 * @property {string} question
 * @property {'answer' | 'not-in-data' | 'no-model' | 'failed'} outcome
 * @property {AnswerStatement[]} [statements]
 * @property {boolean} [leftOut]
 * @property {string} [message] why a question failed
 * @property {boolean} [retryable] false when sending it again would fail the same way
 *
 * @typedef {object} CaptureBarState
 * @property {'idle' | 'processing' | 'asking' | 'done' | 'error'} status
 * @property {string} text the sentence being filed, or the question being asked
 * @property {{ destination: string, route: string, note?: string } | null} receipt
 * @property {string | null} error
 * @property {'capture' | 'ask'} mode
 * @property {AnswerState | null} answer
 *
 * @typedef {
 *   | { type: 'submit', text: string }
 *   | { type: 'receiptReceived', receipt: { destination: string, route: string, note?: string } }
 *   | { type: 'requestFailed', error: string }
 *   | { type: 'dismiss' }
 *   | { type: 'toggleAsk' }
 *   | { type: 'enableAsk' }
 *   | { type: 'submitQuestion', question: string }
 *   | { type: 'answerReceived', result: AnswerResult }
 *   | { type: 'questionFailed', message: string, retryable?: boolean }
 *   | { type: 'retryQuestion' }
 *   | { type: 'closeAnswer' }
 * } CaptureBarAction
 */

/** @type {CaptureBarState} */
export const INITIAL_STATE = {
  status: 'idle',
  text: '',
  receipt: null,
  error: null,
  mode: 'capture',
  answer: null,
};

/**
 * The leading-`?` gesture: with Ask off, a first character of `?` turns it
 * on and is not part of the question, nor is the whitespace after it. A `?`
 * anywhere else is plain text, and with Ask already on a leading `?` is the
 * user's own character, so it stays.
 *
 * @param {'capture' | 'ask'} mode
 * @param {string} draft
 * @returns {{ mode: 'capture' | 'ask', draft: string }}
 */
export function applyAskGesture(mode, draft) {
  if (mode === 'capture' && draft.startsWith('?')) {
    return { mode: 'ask', draft: draft.slice(1).trimStart() };
  }
  return { mode, draft };
}

/** A question or a capture is already on its way: nothing else may start. */
const BUSY = ['processing', 'asking'];

/**
 * @param {CaptureBarState} state
 * @param {CaptureBarAction} action
 * @returns {CaptureBarState}
 */
export function captureBarReducer(state, action) {
  switch (action.type) {
    case 'submit':
      // Already filing or asking one -- the bar's own submit handler should
      // not call dispatch again mid-flight, but the reducer holds the
      // invariant too.
      if (BUSY.includes(state.status)) return state;
      return { ...state, status: 'processing', text: action.text, receipt: null, error: null };
    case 'receiptReceived':
      return { ...state, status: 'done', receipt: action.receipt, error: null };
    case 'requestFailed':
      return { ...state, status: 'error', receipt: null, error: action.error };
    case 'dismiss':
      // Only the receipt or error banner dismisses itself. A question in
      // flight is not a banner, and the answer panel is the user's to close.
      if (state.status !== 'done' && state.status !== 'error') return state;
      return { ...state, status: 'idle', text: '', receipt: null, error: null };
    case 'toggleAsk':
      // Mid-question the mode is not the user's to flip: the answer sends it
      // back to capture on its own.
      if (state.status === 'asking') return state;
      return { ...state, mode: state.mode === 'ask' ? 'capture' : 'ask' };
    case 'enableAsk':
      if (state.status === 'asking' || state.mode === 'ask') return state;
      return { ...state, mode: 'ask' };
    case 'submitQuestion': {
      const question = action.question.trim();
      // The route 400s an empty question; the bar never sends one.
      if (question === '' || BUSY.includes(state.status)) return state;
      // The previous answer goes: it answered a different question, and the
      // panel comes back with this one's.
      return { ...state, status: 'asking', text: question, receipt: null, error: null, mode: 'ask', answer: null };
    }
    case 'answerReceived':
      // Shown even if the panel was closed or the user moved on while it
      // was in flight -- they asked for it. Closing after it arrives is
      // what `closeAnswer` is for.
      return {
        ...state,
        status: 'idle',
        receipt: null,
        error: null,
        mode: 'capture',
        answer: { question: state.text, ...action.result },
      };
    case 'questionFailed':
      return {
        ...state,
        status: 'idle',
        receipt: null,
        error: null,
        mode: 'capture',
        answer: {
          question: state.text,
          outcome: 'failed',
          message: action.message,
          ...(action.retryable === false ? { retryable: false } : {}),
        },
      };
    case 'retryQuestion': {
      // The same question, from the panel, not from the draft.
      if (state.answer?.outcome !== 'failed' || state.answer.retryable === false || BUSY.includes(state.status)) {
        return state;
      }
      return { ...state, status: 'asking', text: state.answer.question, receipt: null, error: null, mode: 'ask', answer: null };
    }
    case 'closeAnswer':
      if (state.answer === null) return state;
      return { ...state, answer: null };
    default:
      return state;
  }
}
