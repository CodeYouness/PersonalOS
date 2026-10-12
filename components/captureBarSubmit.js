/**
 * The capture bar's one piece of I/O, kept out of the component so it is
 * testable with a mocked `fetch` instead of a browser. Never throws: every
 * outcome, including a network failure, becomes an action the reducer
 * already knows how to handle.
 */

import { limits } from '@/personalos.config.js';

/**
 * @param {string} text
 * @param {typeof fetch} [fetchImpl]
 * @param {string} [destination] chosen up front, skipping classification --
 *   the Nutrition card's box sends `nutrition`
 * @returns {Promise<import('./captureBarReducer.js').CaptureBarAction>}
 */
export async function submitCapture(text, fetchImpl = fetch, destination) {
  try {
    const response = await fetchImpl('/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, destination }),
    });
    const body = await response.json();
    if (!response.ok) {
      return { type: 'requestFailed', error: body.error ?? 'Something went wrong' };
    }
    return { type: 'receiptReceived', receipt: body };
  } catch {
    return { type: 'requestFailed', error: 'Could not reach the server' };
  }
}

/** What a 200 from the questions route may say; anything else is not trusted. */
const ANSWER_OUTCOMES = ['answer', 'not-in-data', 'no-model'];

const FAILED_MESSAGE = "The model didn't answer.";
const TIMEOUT_MESSAGE = 'The model took too long to answer.';

/**
 * Why a question cannot be sent, or null. Only its length: the bar never
 * judges what a question says. Checked before anything is sent, so a draft
 * that is too long stays in the input to be shortened, not lost behind a
 * panel whose retry would fail the same way.
 *
 * @param {string} question trimmed
 * @returns {string | null}
 */
export function questionProblem(question) {
  return question.length > limits.questionMaxChars
    ? 'That question is too long: at most ' + limits.questionMaxChars + ' characters.'
    : null;
}

/**
 * Ask the questions route. Called only in Ask mode -- the bar picks this or
 * `submitCapture` by mode, never by what the sentence says, and never both.
 * Every failure (the model, a 400, the network, a body that is not JSON)
 * becomes `questionFailed`, which the panel offers to retry.
 *
 * Gives up after `timeoutMs`: the bar is locked while a question is in
 * flight, so one that never settles must end as a failure, not a wedge.
 *
 * @param {string} question
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [timeoutMs]
 * @returns {Promise<import('./captureBarReducer.js').CaptureBarAction>}
 */
export async function submitQuestion(question, fetchImpl = fetch, timeoutMs = limits.questionTimeoutMs) {
  try {
    const response = await fetchImpl('/api/questions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.json();
    if (!response.ok) {
      const message = stringOr(body?.message, FAILED_MESSAGE);
      // A 400 says the question itself was refused: sending it again repeats it.
      return response.status === 400
        ? { type: 'questionFailed', message, retryable: false }
        : { type: 'questionFailed', message };
    }
    if (!ANSWER_OUTCOMES.includes(body?.outcome)) {
      return { type: 'questionFailed', message: FAILED_MESSAGE };
    }
    if (body.outcome !== 'answer') {
      return { type: 'answerReceived', result: { outcome: body.outcome } };
    }
    if (!Array.isArray(body.statements)) {
      return { type: 'questionFailed', message: FAILED_MESSAGE };
    }
    return {
      type: 'answerReceived',
      result: { outcome: 'answer', statements: body.statements, leftOut: body.leftOut === true },
    };
  } catch (caught) {
    // A network failure rejects fetch; a body that is not JSON rejects json();
    // the timeout aborts either one with a TimeoutError.
    const timedOut = caught instanceof Error && caught.name === 'TimeoutError';
    return {
      type: 'questionFailed',
      message: timedOut ? TIMEOUT_MESSAGE : caught instanceof TypeError ? 'Could not reach the server' : FAILED_MESSAGE,
    };
  }
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @returns {string}
 */
function stringOr(value, fallback) {
  return typeof value === 'string' && value !== '' ? value : fallback;
}
