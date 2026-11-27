/**
 * The Telegram channel (ADR 0064): the loop that listens to the bot, and the
 * only code that decides what is read from an update and what is said back.
 *
 * It owns no transport, no handler and no clock: they are arguments, so a
 * test drives it against a fake Telegram, and the real wiring
 * (lib/telegram/start.js) is the only place that names the token.
 *
 * ## One chat
 *
 * An update is read only as far as its chat id. Anything that is not a
 * message from the one chat is dropped there: no reply, no log line, nothing
 * of its content read or kept. It is still acknowledged, or Telegram would
 * deliver it for ever.
 *
 * ## Handled first, acknowledged after
 *
 * Telegram has no "acknowledge" call: asking for updates from an offset
 * drops every update below it. So an update is handled, and only the next
 * request moves the offset past it. A process that dies in between gets the
 * update again.
 *
 * The update id is therefore the key of a message, and `handle` must be safe
 * to call twice with the same one: whatever it files, it files once per
 * `updateId` (a capture's `clientId`, ADR 0033). Within one process a
 * redelivery is recognised here and not handed over again.
 *
 * A `handle` or a send that fails leaves the update unacknowledged; the poll
 * fails, the loop backs off, and the update comes back.
 *
 * ## What `handle` is
 *
 * `async ({ updateId, text }) => string`: given a text from the chat,
 * returns the line to answer with. Only text reaches it. A message with no
 * text -- a voice note, a photo, a file, with or without a caption -- gets
 * the fixed line that points to the phone Shortcut.
 */

import { errorMessage } from '../domain/error-message.js';
import { TELEGRAM_TEXTS } from './texts.js';

/**
 * @typedef {object} TelegramMessage
 * @property {number} updateId Telegram's id of the update: the key of the message
 * @property {string} text
 */

/**
 * @param {object} options
 * @param {import('./transport.js').TelegramTransport} options.transport
 * @param {number} options.chatId the one chat listened to
 * @param {(message: TelegramMessage) => Promise<string>} options.handle
 * @param {number} options.pollSeconds how long Telegram holds a poll open
 * @param {{ minMs: number, maxMs: number }} options.backoff the wait after a
 *   failed poll: `minMs`, doubled each time up to `maxMs`
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @param {(message: string, error?: unknown) => void} [options.log]
 */
export function createTelegramChannel({ transport, chatId, handle, pollSeconds, backoff, sleep = defaultSleep, log = defaultLog }) {
  /** @type {number | undefined} the first update not yet acknowledged */
  let offset;
  /** The newest update handled by this process, so a redelivery is not handled again. */
  let lastHandled = -Infinity;
  let stopped = false;

  /** @param {any} update */
  async function handleOne(update) {
    // Read as far as the chat, and no further unless it is the one.
    if (update?.message?.chat?.id !== chatId) return;
    const text = update.message.text;
    const reply = typeof text === 'string' && text.trim() !== ''
      ? await handle({ updateId: update.update_id, text })
      : TELEGRAM_TEXTS.notText;
    await transport.sendMessage({ chatId, text: reply });
  }

  /**
   * One request for updates, each handled in order. Rejects when the request,
   * a handler or a send fails; what was not handled stays with Telegram.
   *
   * @returns {Promise<void>}
   */
  async function pollOnce() {
    const updates = await transport.getUpdates({ offset, timeoutSeconds: pollSeconds });
    for (const update of updates) {
      const id = update?.update_id;
      if (!Number.isInteger(id)) continue;
      if (id > lastHandled) {
        await handleOne(update);
        lastHandled = id;
      }
      offset = id + 1;
    }
  }

  return {
    pollOnce,

    /**
     * Polls until stopped. Never rejects: a lost connection, a refused
     * request or a failing handler is logged, waited out and tried again.
     *
     * @returns {Promise<void>}
     */
    async run() {
      let wait = backoff.minMs;
      while (!stopped) {
        try {
          await pollOnce();
          wait = backoff.minMs;
        } catch (error) {
          log('poll failed, trying again in ' + wait + ' ms', error);
          await sleep(wait);
          wait = Math.min(wait * 2, backoff.maxMs);
        }
      }
    },

    /** Ends the loop after the poll in flight. */
    stop() {
      stopped = true;
    },
  };
}

/** @param {number} ms */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}

/**
 * @param {string} message
 * @param {unknown} [error]
 */
function defaultLog(message, error) {
  console.error('[telegram] ' + message + (error === undefined ? '' : ': ' + errorMessage(error)));
}
