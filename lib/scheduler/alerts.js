/**
 * Failure alerts (#292, ADR 0069): after a schedule's run is recorded, one
 * fixed message to the Telegram chat when the run failed and the one before
 * it had not. Whether to say anything is `failureAlert`, a derivation over
 * the run log; what is said is a fixed sentence chosen by schedule
 * (lib/telegram/texts.js) -- the run's error stays in the run log.
 *
 * It is the scheduler's `afterRun`, wired in lib/scheduler/start.js, so only
 * the server's own scheduler alerts: a sync run by hand from a script is
 * read on the terminal. With the channel off nothing is sent and the failure
 * is in the run log. It never throws: an alert that cannot be sent is logged
 * and is not sent later.
 */

import { SCHEDULE_IDS } from '../../personalos.config.js';
import { failureAlert } from '../domain/derive/run-alerts.js';
import { errorMessage } from '../domain/error-message.js';
import { alertText } from '../telegram/texts.js';

/**
 * @param {object} options
 * @param {import('../telegram/send.js').TelegramSender | null} options.send
 *   null when the channel is off
 * @param {{ getRuns: (options?: object) => Promise<any[]> }} options.store
 * @param {(message: string, error?: unknown) => void} [options.log]
 * @returns {(run: import('../domain/types.js').Run) => Promise<void>}
 */
export function makeFailureAlerter({ send, store, log = defaultLog }) {
  return async (run) => {
    // A channel's own runs are in the same log and are not a schedule's.
    if (send === null || run.outcome !== 'failed' || !SCHEDULE_IDS.includes(run.schedule)) return;
    try {
      const kind = failureAlert(await store.getRuns({ schedule: run.schedule }));
      const text = kind === null ? null : alertText(run.schedule, kind);
      if (text !== null) await send(text);
    } catch (error) {
      log('the alert for ' + run.schedule + ' could not be sent', error);
    }
  };
}

/**
 * @param {string} message
 * @param {unknown} [error]
 */
function defaultLog(message, error) {
  console.error('[scheduler] ' + message + (error === undefined ? '' : ': ' + errorMessage(error)));
}
