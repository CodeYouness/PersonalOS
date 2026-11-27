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
});
