/**
 * The evening reminder (#291, ADR 0068): at its slot, when a closed question
 * of today's check-in is still unanswered, one fixed message to the Telegram
 * chat. The message says the check-in is open and nothing about it.
 *
 * The run keeps the day it was about and the id of the message it sent
 * (`about`, `messageId`), so a reply to that message is filed on that day
 * (lib/telegram/handle.js) and a second reminder for the day is never sent.
 *
 * "Is the check-in done" is the read the panel uses (`questionsFor`), which
 * writes nothing; the open question never holds a check-in open, so a day
 * with every closed question answered gets no message whatever was written.
 * Dropping a reminder whose day is over is the schedule's `same-day` rule.
 */

import { RUN_REASONS } from '../../personalos.config.js';
import { toDayKey } from '../domain/dates.js';
import { reminderText } from '../telegram/texts.js';

/**
 * @param {object} options
 * @param {import('../telegram/send.js').TelegramSender | null} options.send
 *   null when the channel is off
 * @param {(day: string) => Promise<boolean>} options.isDone whether that
 *   day's check-in is done
 * @param {string | null} options.baseUrl the app's address, or null for no link
 * @returns {import('./scheduler.js').Job}
 */
export function makeEveningReminderJob({ send, isDone, baseUrl }) {
  return async ({ scheduleId, now, timezone, store }) => {
    if (send === null) return { outcome: 'skipped', reason: RUN_REASONS.notConfigured };

    const day = toDayKey(now, timezone);
    const earlier = await store.getRuns({ schedule: scheduleId });
    if (earlier.some((/** @type {import('../domain/types.js').Run} */ run) => run.outcome === 'ok' && run.about === day)) {
      return { outcome: 'skipped', reason: RUN_REASONS.alreadySent };
    }
    if (await isDone(day)) return { outcome: 'skipped', reason: RUN_REASONS.checkinDone };

    const messageId = await send(reminderText(baseUrl));
    return { outcome: 'ok', about: day, ...(messageId === null ? {} : { messageId }) };
  };
}
