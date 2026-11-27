/**
 * What the guided setup (`npm run telegram:setup`, scripts/telegram-setup.js)
 * works out by itself. No request and no file here: the script asks
 * Telegram, and the human writes `.env.local`.
 */

/** The shape of a token as BotFather gives it: the bot's id, a colon, 35 characters. */
const TOKEN_SHAPE = /^\d{6,12}:[A-Za-z0-9_-]{35}$/;

/**
 * @param {string} value
 * @returns {boolean}
 */
export function looksLikeToken(value) {
  return TOKEN_SHAPE.test(value.trim());
}

/**
 * The private chats that wrote to the bot, each once, in the order they
 * first wrote. A group is never offered: the channel listens to one person.
 *
 * @param {any[]} updates as `getUpdates` returns them
 * @returns {{ id: number, name: string }[]}
 */
export function chatsIn(updates) {
  /** @type {Map<number, string>} */
  const chats = new Map();
  for (const update of updates) {
    const chat = update?.message?.chat;
    if (chat?.type !== 'private' || !Number.isInteger(chat.id) || chats.has(chat.id)) continue;
    chats.set(chat.id, typeof chat.first_name === 'string' ? chat.first_name : '');
  }
  return [...chats].map(([id, name]) => ({ id, name }));
}

/**
 * The two lines for `.env.local`.
 *
 * @param {string} token
 * @param {number} chatId
 * @returns {string[]}
 */
export function envLines(token, chatId) {
  return ['TELEGRAM_BOT_TOKEN=' + token.trim(), 'TELEGRAM_CHAT_ID=' + chatId];
}
