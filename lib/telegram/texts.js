/**
 * Every sentence the bot can say (ADR 0064, ADR 0069), as fixed text. None
 * has a slot: nothing of the user's data, and nothing of what was sent to
 * the bot, can be put into one.
 *
 * They are in Italian (ADR 0072): the language the chat is written in and
 * the answers come back in. The app's screens stay in English.
 *
 * Two things the bot says are not here, because they are replies to what was
 * just asked in the chat and are built from it: a capture's reply, which
 * names the destination and nothing else ({@link captureReply}), and a
 * question's answer (lib/telegram/handle.js). Neither is ever sent unasked.
 */
export const TELEGRAM_TEXTS = Object.freeze({
  /** A capture the classifier never answered for: kept, and Refile files it by hand. */
  savedNotFiled: 'Salvato, non ancora archiviato.',
  /** A question the data does not answer. */
  notInData: 'Non è nei tuoi dati.',
  /** A question with no model to ask. */
  noModel: 'Nessun modello configurato: non ho chiesto nulla.',
  /** A question over an archive too large to send, even summarised. */
  tooLarge: 'Troppi dati per questa domanda, anche riassunti. Non ho inviato nulla.',
  /** A question the model did not answer. Nothing is filed: it was not a capture. */
  answerFailed: 'Il modello non ha risposto. Riprova.',
  /** A question over the length a question may have. */
  questionTooLong: 'La domanda è troppo lunga.',
  /** Added to an answer one of whose statements was dropped. */
  leftOut: 'Ho tolto una frase: non citava nessun dato tra quelli letti.',
  /** Added to an answer, or to "not in your data", over a summarised archive. */
  summarised: 'I movimenti più vecchi sono stati letti come totali mensili.',
  /** A voice note, a photo, a file: not taken, and where such things go. */
  notText: 'Qui prendo solo testo. Per il resto usa lo Shortcut sul telefono.',
  /** The evening reminder (ADR 0068). It says the check-in is open and nothing about it. */
  reminder: 'Il check-in di oggi è aperto.',
  /** A reply to the reminder was kept as that day's open answer. */
  replyFiled: 'Archiviato nel check-in di quel giorno.',
  /** A reply to the reminder that the check-in refused. */
  replyNotFiled: "Non sono riuscito ad archiviarlo. Apri l'app per scriverlo.",
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
 * How each destination is named in the chat. One for every DESTINATIONS
 * entry; a test fails when one has none.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DESTINATION_NAMES = Object.freeze({
  task: 'attività',
  people: 'persone',
  finance: 'finanze',
  nutrition: 'alimentazione',
  health: 'salute',
  goals: 'obiettivi',
  memory: 'memoria',
  appointment: 'appuntamenti',
});

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
  return route === 'unclassified' ? TELEGRAM_TEXTS.savedNotFiled : 'Archiviato in: ' + (DESTINATION_NAMES[destination] ?? destination) + '.';
}

/**
 * The failure alerts (ADR 0069), one fixed sentence for each schedule: an
 * alert names the schedule by being that schedule's sentence, so nothing is
 * ever put into one. A test fails when a schedule has none.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const ALERT_TEXTS = Object.freeze({
  'prune-runs': 'La pulizia del registro delle esecuzioni è fallita.',
  'nightly-backup': 'Il backup notturno è fallito.',
  'sync-calendar': 'La sincronizzazione del calendario è fallita.',
  'sync-scalable': 'La sincronizzazione del broker è fallita.',
  'evening-reminder': 'Il promemoria serale è fallito.',
});

/**
 * The alert of a schedule that failed because its login expired: the one
 * thing only the user can do, said as such.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const NEEDS_LOGIN_TEXTS = Object.freeze({
  'sync-scalable': 'La sincronizzazione del broker richiede un nuovo accesso.',
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

/**
 * How each part of the question context is named in the chat. One for every
 * CONTEXT_PARTS entry; a test fails when one has none.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const PART_NAMES = Object.freeze({
  life: 'attività e giorni',
  money: 'conti e totali mensili',
  categories: 'totali per categoria',
  transactions: 'singoli movimenti',
  investments: 'investimenti',
});

const MONTH_NAMES = Object.freeze([
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
]);

/** @param {string} month YYYY-MM */
function monthName(month) {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] + ' ' + month.slice(0, 4);
}

/**
 * What was read (ADR 0070), as a line of a reply in the chat: the answer
 * panel's note, in the chat's language. A reply to a question, so it is
 * built from what the question was asked over -- part names from a closed
 * list and months -- and never sent unasked.
 *
 * @param {import('../ai/context/parts.js').Read | null | undefined} read
 * @returns {string | null} null when the whole archive was read
 */
export function readReply(read) {
  if (!read) return null;
  const names = read.parts.map((part) => PART_NAMES[part] ?? part).join(', ');
  const { from, to } = read.months;
  const months = from === to ? 'Mese: ' + monthName(from) : 'Mesi: da ' + monthName(from) + ' a ' + monthName(to);
  return 'Ho letto solo: ' + names + '. ' + months + '.';
}
