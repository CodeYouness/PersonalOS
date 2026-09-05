/**
 * The capture bar's state machine, kept separate from the component that
 * renders it so the transitions are testable without a DOM.
 *
 * Four states, matching design/mockup.html's data-state values minus
 * "listening" -- voice input is out of scope this pass, text only. `error`
 * is not in the mockup (an idealised comp has no failure states); it exists
 * so a request that never lands still tells the user something, per the
 * rule that capture must never look like it silently vanished.
 *
 *   idle --submit--> processing --receiptReceived--> done --dismiss--> idle
 *                        \--requestFailed--> error --dismiss--> idle
 */

/**
 * @typedef {object} CaptureBarState
 * @property {'idle' | 'processing' | 'done' | 'error'} status
 * @property {string} text
 * @property {{ destination: string, route: string } | null} receipt
 * @property {string | null} error
 *
 * @typedef {
 *   | { type: 'submit', text: string }
 *   | { type: 'receiptReceived', receipt: { destination: string, route: string } }
 *   | { type: 'requestFailed', error: string }
 *   | { type: 'dismiss' }
 * } CaptureBarAction
 */

/** @type {CaptureBarState} */
export const INITIAL_STATE = { status: 'idle', text: '', receipt: null, error: null };

/**
 * @param {CaptureBarState} state
 * @param {CaptureBarAction} action
 * @returns {CaptureBarState}
 */
export function captureBarReducer(state, action) {
  switch (action.type) {
    case 'submit':
      // Already filing one -- the bar's own submit handler should not call
      // dispatch again mid-flight, but the reducer holds the invariant too.
      if (state.status === 'processing') return state;
      return { status: 'processing', text: action.text, receipt: null, error: null };
    case 'receiptReceived':
      return { status: 'done', text: state.text, receipt: action.receipt, error: null };
    case 'requestFailed':
      return { status: 'error', text: state.text, receipt: null, error: action.error };
    case 'dismiss':
      return INITIAL_STATE;
    default:
      return state;
  }
}
