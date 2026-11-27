/**
 * Sending a message the system starts (ADR 0064): from a schedule, to the
 * one chat, with the same transport as the loop. No route and no page
 * imports this (the lint rule on lib/telegram/).
 */

import { env } from '../config/env.js';
import { makeTelegramTransport } from './transport.js';

/**
 * @typedef {(text: string) => Promise<number | null>} TelegramSender sends
 *   one text to the chat and resolves with the id of the message sent
 */

/**
 * A sender to the one chat, or null when the channel is off: with the token
 * or the chat id missing no transport is made.
 *
 * @param {{ token: string | null, chatId: number | null, makeTransport?: (options: { token: string }) => import('./transport.js').TelegramTransport }} options
 * @returns {TelegramSender | null}
 */
export function makeTelegramSender({ token, chatId, makeTransport = makeTelegramTransport }) {
  if (token === null || chatId === null) return null;
  const transport = makeTransport({ token });
  return (text) => transport.sendMessage({ chatId, text });
}

/**
 * The sender for this process's configuration, or null with the channel off.
 *
 * @returns {TelegramSender | null}
 */
export function telegramSender() {
  return makeTelegramSender({ token: env.telegramBotToken, chatId: env.telegramChatId });
}
