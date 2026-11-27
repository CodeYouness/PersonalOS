/**
 * What a text from the chat becomes (ADR 0064, ADR 0068, ADR 0069). The
 * channel's handler: given a text and the message it replies to, it files
 * or answers through the same paths a screen uses and returns the line to
 * answer with.
 *
 * - **A reply to an evening reminder** is the open answer of the day that
 *   reminder was about, whenever it arrives: `answerCheckin` keeps it as a
 *   journal entry on that day first, then the small model reads it, exactly
 *   as the dashboard's open answer.
 * - **A text that ends with a question mark** is a question: answered as the
 *   capture bar's Ask mode answers, and stored nowhere. The bar has a mode
 *   to say "this is a question"; a chat has the question mark.
 * - **Any other text** is a capture: filed through the capture bar's entry
 *   point (`fileCapture`) with origin `telegram`.
 *
 * Filed once per update: the capture, or the journal entry, carries
 * `telegram:<update id>` as its `clientId`, so an update Telegram delivers
 * again -- after a crash between handling and acknowledging -- is recognised
 * and nothing is filed or read a second time. A question files nothing, so a
 * redelivered one is asked again.
 */

import { limits } from '../../personalos.config.js';
import { readNote } from '../ai/context/parts.js';
import { ask } from '../answer.js';
import { fileCapture } from '../capture.js';
import { answerCheckin } from '../checkin/day.js';
import { readOpenAnswer } from '../checkin/interpret.js';
import { findJournalEntryByClientId, getRuns } from '../store.js';
import { captureReply, TELEGRAM_TEXTS } from './texts.js';

/** The surface, as a capture's `origin` names it (CAPTURE_ORIGINS). */
const ORIGIN = 'telegram';

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
 * The answer to a question, as lines of text: the statements that survived
 * the check, then what the reader must know about them. It may carry data:
 * it was asked for, in this chat.
 *
 * @param {string} question
 * @returns {Promise<string>}
 */
async function answer(question) {
  if (question.length > limits.questionMaxChars) return TELEGRAM_TEXTS.questionTooLong;

  const result = await ask(question);
  if (result.outcome === 'failed') return TELEGRAM_TEXTS.answerFailed;
  if (result.outcome === 'no-model') return TELEGRAM_TEXTS.noModel;
  if (result.outcome === 'too-large') return TELEGRAM_TEXTS.tooLarge;

  const lines = result.outcome === 'answer' ? result.statements.map((statement) => statement.text) : [];
  // Every statement dropped leaves nothing to say but that.
  if (lines.length === 0) lines.push(TELEGRAM_TEXTS.notInData);
  if (result.outcome === 'answer' && result.leftOut && result.statements.length > 0) lines.push(TELEGRAM_TEXTS.leftOut);
  if (result.summarised !== null) lines.push(TELEGRAM_TEXTS.summarised);
  // Asked over part of the archive (ADR 0070): say which, so "not in your
  // data" over a part is not read as one over everything.
  const read = readNote(result.read);
  if (read !== null) lines.push(read);
  return lines.join('\n');
}

/**
 * @param {import('./channel.js').TelegramMessage} message
 * @returns {Promise<string>} the line to answer with
 */
export async function handleTelegramText({ updateId, text, replyTo }) {
  const clientId = ORIGIN + ':' + updateId;
  const day = await reminderDayOf(replyTo);
  if (day !== null) {
    if ((await findJournalEntryByClientId(clientId)) !== null) return TELEGRAM_TEXTS.replyFiled;
    const { lines } = await answerCheckin(day, [{ questionId: 'open', value: { text } }], { readOpenAnswer, clientId });
    return lines[0]?.status === 'done' ? TELEGRAM_TEXTS.replyFiled : TELEGRAM_TEXTS.replyNotFiled;
  }

  const sentence = text.trim();
  if (sentence.endsWith('?')) return answer(sentence);

  const receipt = await fileCapture({ text: sentence, origin: ORIGIN, clientId });
  return captureReply(receipt.destination, receipt.route);
}
