/**
 * Every sentence the bot can say (ADR 0064), as fixed text. None has a slot:
 * nothing of the user's data, and nothing of what was sent to the bot, can
 * be put into one.
 */
export const TELEGRAM_TEXTS = Object.freeze({
  /** The acknowledgement of a text, until a text is filed (#292). */
  received: 'Received.',
  /** A voice note, a photo, a file: not taken, and where such things go. */
  notText: 'I only take text here. For anything else, use the Shortcut on the phone.',
  /** The evening reminder (ADR 0068). It says the check-in is open and nothing about it. */
  reminder: "Today's check-in is open.",
  /** A reply to the reminder was kept as that day's open answer. */
  replyFiled: "Filed with that day's check-in.",
  /** A reply to the reminder that the check-in refused. */
  replyNotFiled: 'That could not be filed. Open the app to write it.',
});

/**
 * The reminder as sent: the fixed sentence and, when one is configured, the
 * address of the app on a line of its own. The address is configuration,
 * not data; it is the only thing this takes.
 *
 * @param {string | null} baseUrl
 * @returns {string}
 */
export function reminderText(baseUrl) {
  return baseUrl === null ? TELEGRAM_TEXTS.reminder : TELEGRAM_TEXTS.reminder + '\n' + baseUrl;
}
