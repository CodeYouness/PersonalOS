/**
 * The one place a request to Telegram is made (ADR 0064). Two calls of the
 * Bot API over HTTPS: `getUpdates`, a long poll that the server holds open
 * until something arrives, and `sendMessage`.
 *
 * The API wants the token in the address. So no error thrown here carries
 * the address or the cause it came with: a failure says the method, the
 * status and Telegram's own description, and nothing else.
 */

const API = 'https://api.telegram.org';
/** How much longer than the long poll itself a request may take. */
const SLACK_MS = 10_000;

/**
 * @typedef {object} TelegramTransport
 * @property {(options: { offset?: number, timeoutSeconds: number }) => Promise<any[]>} getUpdates
 *   the updates from `offset` on; asking from an offset acknowledges every
 *   update below it
 * @property {(message: { chatId: number, text: string }) => Promise<void>} sendMessage
 */

/** A failed call, with Telegram's status when it answered. */
export class TelegramError extends Error {
  /**
   * @param {string} message
   * @param {number | null} status
   */
  constructor(message, status) {
    super(message);
    this.name = 'TelegramError';
    this.status = status;
  }
}

/**
 * @param {{ token: string, fetch?: typeof globalThis.fetch }} options
 * @returns {TelegramTransport}
 */
export function makeTelegramTransport({ token, fetch = globalThis.fetch }) {
  /**
   * @param {string} method
   * @param {Record<string, unknown>} body
   * @param {number} timeoutMs
   * @returns {Promise<any>} the `result` of the answer
   */
  async function call(method, body, timeoutMs) {
    let response;
    let answer;
    try {
      response = await fetch(API + '/bot' + token + '/' + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      answer = await response.json();
    } catch {
      // The cause names the address, and the address holds the token.
      throw new TelegramError('Telegram ' + method + ' could not be reached', null);
    }
    if (!response.ok || answer?.ok !== true) {
      const said = typeof answer?.description === 'string' ? answer.description : 'no description';
      throw new TelegramError('Telegram ' + method + ' failed (' + response.status + '): ' + said, response.status);
    }
    return answer.result;
  }

  return {
    async getUpdates({ offset, timeoutSeconds }) {
      const result = await call(
        'getUpdates',
        { ...(offset === undefined ? {} : { offset }), timeout: timeoutSeconds, allowed_updates: ['message'] },
        timeoutSeconds * 1000 + SLACK_MS
      );
      if (!Array.isArray(result)) throw new TelegramError('Telegram getUpdates answered something that is not a list', null);
      return result;
    },

    async sendMessage({ chatId, text }) {
      await call('sendMessage', { chat_id: chatId, text }, SLACK_MS);
    },
  };
}
