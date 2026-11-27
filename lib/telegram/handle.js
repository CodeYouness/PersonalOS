/**
 * What a text from the chat becomes (ADR 0064, ADR 0068). The channel's
 * handler: given a text and the message it replies to, it files through the
 * same paths a screen uses and returns the fixed line to answer with.
 *
 * - **A reply to an evening reminder** is the open answer of the day that
 *   reminder was about, whenever it arrives: `answerCheckin` keeps it as a
 *   journal entry on that day first, then the small model reads it, exactly
 *   as the dashboard's open answer.
 * - **Any other text** is acknowledged and filed nowhere, until #292.
 *
 * Filed once per update: the journal entry carries `telegram:<update id>` as
 * its `clientId`, so an update Telegram delivers again -- after a crash
 * between handling and acknowledging -- is recognised and nothing is filed
 * or read a second time.
 */

import { answerCheckin } from '../checkin/day.js';
import { readOpenAnswer } from '../checkin/interpret.js';
import { findJournalEntryByClientId, getRuns } from '../store.js';
import { TELEGRAM_TEXTS } from './texts.js';

/** The schedule whose runs say which message was a reminder, and of which day. */
const REMINDER = 'evening-reminder';

/**
 * The day the reminder with this message id was about, or null when the
 * message was not a reminder still in the run log.
 *
 * @param {number | null} messageId
 * @returns {Promise<string | null>}
 */
async function reminderDayOf(messageId) {
  if (messageId === null) return null;
  const run = (await getRuns({ schedule: REMINDER })).find((entry) => entry.messageId === messageId);
  return run?.about ?? null;
}

/**
 * @param {import('./channel.js').TelegramMessage} message
 * @returns {Promise<string>} the line to answer with
 */
export async function handleTelegramText({ updateId, text, replyTo }) {
  const day = await reminderDayOf(replyTo);
  if (day === null) return TELEGRAM_TEXTS.received;

  const clientId = 'telegram:' + updateId;
  if ((await findJournalEntryByClientId(clientId)) !== null) return TELEGRAM_TEXTS.replyFiled;

  const { lines } = await answerCheckin(day, [{ questionId: 'open', value: { text } }], { readOpenAnswer, clientId });
  return lines[0]?.status === 'done' ? TELEGRAM_TEXTS.replyFiled : TELEGRAM_TEXTS.replyNotFiled;
}
