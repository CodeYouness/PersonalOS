/**
 * The capture bar's one piece of I/O, kept out of the component so it is
 * testable with a mocked `fetch` instead of a browser. Never throws: every
 * outcome, including a network failure, becomes an action the reducer
 * already knows how to handle.
 */

/**
 * @param {string} text
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<import('./captureBarReducer.js').CaptureBarAction>}
 */
export async function submitCapture(text, fetchImpl = fetch) {
  try {
    const response = await fetchImpl('/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
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
