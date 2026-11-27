/**
 * Every sentence the bot can say (ADR 0064, ADR 0069), as fixed text. None
 * has a slot: nothing of the user's data, and nothing of what was sent to
 * the bot, can be put into one.
 *
 * Two things the bot says are not here, because they are replies to what was
 * just asked in the chat and are built from it: a capture's reply, which
 * names the destination and nothing else ({@link captureReply}), and a
 * question's answer (lib/telegram/handle.js). Neither is ever sent unasked.
 */
export const TELEGRAM_TEXTS = Object.freeze({
  /** A capture the classifier never answered for: kept, and Refile files it by hand. */
  savedNotFiled: 'Saved, not filed yet.',
  /** A question the data does not answer. */
  notInData: 'That is not in your data.',
  /** A question with no model to ask. */
  noModel: 'No model configured, so nothing was asked.',
  /** A question over an archive too large to send, even summarised. */
  tooLarge: 'Too much data to ask over, even summarised. Nothing was sent.',
  /** A question the model did not answer. Nothing is filed: it was not a capture. */
  answerFailed: "The model didn't answer. Ask again.",
  /** A question over the length a question may have. */
  questionTooLong: 'That question is too long.',
  /** Added to an answer one of whose statements was dropped. */
  leftOut: 'Something was left out: a statement cited nothing the system was shown.',
  /** Added to an answer, or to "not in your data", over a summarised archive. */
  summarised: 'Older transactions were read as monthly totals.',
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

/**
 * A capture's reply: where the sentence went, and nothing of what it said
 * or of what was filed from it -- no title, no amount, no weight. The
 * destination is one of DESTINATIONS, a closed list.
 *
 * @param {string} destination
 * @param {string} route the capture's; `unclassified` when nothing filed it
 * @returns {string}
 */
export function captureReply(destination, route) {
  return route === 'unclassified' ? TELEGRAM_TEXTS.savedNotFiled : 'Filed under ' + destination + '.';
}

/**
 * The failure alerts (ADR 0069), one fixed sentence for each schedule: an
 * alert names the schedule by being that schedule's sentence, so nothing is
 * ever put into one. A test fails when a schedule has none.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ALERT_TEXTS = Object.freeze({
  'prune-runs': 'Pruning the run log failed.',
  'nightly-backup': 'The nightly backup failed.',
  'sync-calendar': 'The calendar sync failed.',
  'sync-scalable': 'The broker sync failed.',
  'evening-reminder': 'The evening reminder failed.',
});

/**
 * The alert of a schedule that failed because its login expired: the one
 * thing only the user can do, said as such.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const NEEDS_LOGIN_TEXTS = Object.freeze({
  'sync-scalable': 'The broker sync needs a new login.',
});

/**
 * The alert for a schedule, chosen by its id and the kind of failure and by
 * nothing else: there is nowhere to pass the run or its error.
 *
 * @param {string} scheduleId
 * @param {import('../domain/derive/run-alerts.js').AlertKind} kind
 * @returns {string | null} null for an id with no alert
 */
export function alertText(scheduleId, kind) {
  const text = (kind === 'needs-login' ? NEEDS_LOGIN_TEXTS[scheduleId] : undefined) ?? ALERT_TEXTS[scheduleId];
  return text ?? null;
}
