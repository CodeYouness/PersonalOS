/**
 * The one gesture: a sentence in, filed for real. The entry point every
 * surface uses -- the capture bar and the phone Shortcut through
 * `POST /api/capture`, the Telegram channel directly (ADR 0069) -- so there
 * is one classifier and one way a sentence is filed, whatever it came
 * through. The caller checks what it was sent; this files it.
 *
 * The capture is written first, `unclassified` (ADR 0037); then classify
 * decides a destination, the capture is marked with it, and this writes a
 * memory entry, the destination record when there is one, the links between
 * them, and an event.
 *
 * Only the capture write is load-bearing, and it happens before any model
 * or rule runs: a classifier that hangs, throws or dies with the process
 * leaves the sentence saved and unclassified, never lost. `task` and
 * `people` file a task (linked to the person the sentence names), `goals`,
 * `appointment` and
 * `nutrition` their own record, `health` a weight when the sentence names
 * one, `finance` a transaction when it names an amount and there is an
 * account to file it on (ADR 0026); `memory` files as capture + memory
 * only, since a fabricated person would be worse than none, and
 * `docs/domain.md` calls "nothing but a memory entry" a valid outcome, not
 * a shortfall. Everything after the capture is enrichment: if it fails
 * partway, the capture the user just said is still there, which is the
 * floor rule 2 sets -- "capture never fails; at worst it files badly".
 */

import { TASK_DESTINATIONS } from '../personalos.config.js';
import { classify } from './classify.js';
import { toDayKey } from './domain/dates.js';
import { formatEuro, formatReceiptLine, formatWeight } from './domain/format.js';
import {
  createAppointment,
  createCaptureOnce,
  getCaptureProducedRecord,
  createGoal,
  createLink,
  createMemoryEntry,
  fileCaptureAsMeal,
  fileCaptureAsTask,
  fileCaptureAsTransaction,
  fileCaptureAsWeight,
  findCaptureByClientId,
  getClassifyContext,
  linkPersonNamedIn,
  recordEvent,
  updateCapture,
} from './store.js';

/**
 * @typedef {object} CaptureReceipt what a capture did, as the bar shows it
 * @property {string} destination
 * @property {string} route `model`, `rules`, or `unclassified` when nothing filed it
 * @property {string | null} recordId the record it produced, when it produced one
 * @property {string | undefined} note what the receipt adds: the weight filed, or that none was
 * @property {string} saidOn the day the sentence was said
 * @property {string} receiptLine the receipt as one line, for a client with no bar
 */

/**
 * @param {object} input already checked by the caller
 * @param {string} input.text the sentence, trimmed and not empty
 * @param {string} input.origin one of CAPTURE_ORIGINS
 * @param {string} [input.chosen] a destination decided up front, one of DESTINATIONS
 * @param {string | null} [input.saidAt] when it was said (ADR 0033), null for now
 * @param {string | null} [input.clientId] the surface's own id for the
 *   sentence (ADR 0033): a second call with the same origin and id files
 *   nothing and answers with the first receipt
 * @returns {Promise<CaptureReceipt>} rejects only when the store refuses the
 *   capture itself
 */
export async function fileCapture({ text, origin, chosen, saidAt = null, clientId = null }) {
  const saidOn = toDayKey(saidAt === null ? new Date() : new Date(saidAt));

  // A resend is answered before the classifier runs: a repeat must cost no
  // model call. `createCaptureOnce` below stays the guard against two
  // overlapping resends that both get past this look.
  if (clientId !== null) {
    const earlier = await findCaptureByClientId(origin, clientId);
    if (earlier !== null) return receiptOf(earlier);
  }

  // The sentence is saved before any tier runs (ADR 0037): from here on no
  // model, no classifier and no refused write can lose it. Saved as
  // `unclassified`, in the destination chosen up front or `memory`, until the
  // classifier answers. A store that refuses this one write is the only
  // failure the client is told about, and it keeps the sentence to resend.
  const { capture, created } = await createCaptureOnce({
    text,
    origin,
    destination: chosen ?? 'memory',
    route: 'unclassified',
    saidAt: saidAt ?? undefined,
    clientId: clientId ?? undefined,
  });
  // A resend: the store held this (origin, clientId) already and wrote
  // nothing. Answer with the first receipt, rebuilt from what was filed --
  // or, while the first is still being classified, that it is saved.
  if (!created) return receiptOf(capture);

  /** @type {import('./classify.js').Classification | null} null when it stays unclassified */
  let classification = null;
  try {
    // Your categories are enrichment: a store read that fails here files
    // with none.
    const context = await getClassifyContext().catch((error) => {
      console.error('[capture] could not read the categories for the classifier:', error);
      return {};
    });
    const answer = await classify(text, chosen, saidOn, context);
    // Marked before anything is filed: a record linked from a capture that
    // still says `memory` would be read back as the wrong kind of record.
    await updateCapture(capture.id, { destination: answer.destination, route: answer.route });
    classification = answer;
  } catch (error) {
    console.error('[capture] saved the sentence but could not classify it; it stays unclassified:', error);
  }

  if (classification === null) {
    // Kept as nothing but a memory, the floor rule 2 sets; the capture log
    // shows it unclassified, and Refile files it by hand.
    await rememberCapture(capture, false);
    return {
      destination: capture.destination,
      route: capture.route,
      recordId: null,
      note: undefined,
      saidOn,
      receiptLine: receiptLineFor(capture.destination, capture.route, text, undefined, saidOn),
    };
  }
  const { destination, route, fields } = classification;

  let recordId = null;
  /** @type {string | undefined} what the receipt adds: the weight filed, or that none was */
  let note;
  try {
    if (TASK_DESTINATIONS.includes(destination)) {
      const task = await fileCaptureAsTask(capture, fields.title ?? text);
      recordId = task.id;
      await linkPersonNamedIn(task.id, text);
    } else if (destination === 'goals') {
      const goal = await createGoal({ name: fields.title ?? text, source: 'capture' });
      recordId = goal.id;
      await createLink({ from: capture.id, to: goal.id, rel: 'about' });
    } else if (destination === 'appointment') {
      const appointment = await createAppointment({
        title: fields.title ?? text,
        date: fields.date,
        startTime: fields.startTime,
        endTime: fields.endTime ?? null,
        source: 'capture',
      });
      recordId = appointment.id;
      await createLink({ from: capture.id, to: appointment.id, rel: 'about' });
      await recordEvent({ type: 'appointment.created', subject: appointment.id, source: 'capture' });

      await linkPersonNamedIn(appointment.id, text);
    } else if (destination === 'nutrition') {
      const meal = await fileCaptureAsMeal(capture, fields);
      recordId = meal.id;
    } else if (destination === 'health') {
      const weight = await fileCaptureAsWeight(capture, fields);
      recordId = weight?.id ?? null;
      note = weight === null ? 'no weight filed' : formatWeight(weight.value) + ' ' + weight.unit;
    } else if (destination === 'finance') {
      const transaction = await fileCaptureAsTransaction(capture, fields);
      recordId = transaction?.id ?? null;
      note = transaction === null ? 'no transaction filed' : formatEuro(transaction.amount, { cents: true });
    }
  } catch (error) {
    // The capture already landed above. A card or a link failing after that
    // must not read to the user as the capture having failed -- that is
    // exactly the confusing half-state rule 2 exists to prevent -- nor keep
    // the sentence out of memory, which comes next either way.
    console.error('[capture] filed the capture but its record failed:', error);
  }

  await rememberCapture(capture, true);

  // A health sentence with no weight to believe -- none said, or one nobody
  // weighs -- is kept, and the receipt says so instead of implying a number.
  // `receiptLine` is the receipt as the bar words it, for a client with no bar.
  return { destination, route, recordId, note, saidOn, receiptLine: receiptLineFor(destination, route, text, note, saidOn) };
}

/**
 * The memory entry every capture gets, and the `capture.filed` event when
 * the classifier filed it -- never for one it did not. Neither failing reads
 * to the user as the capture having failed: it is already saved.
 *
 * @param {import('./domain/types.js').Capture} capture
 * @param {boolean} filed
 */
async function rememberCapture(capture, filed) {
  try {
    // createMemoryEntry links the memory back to the capture itself
    // (derived_from) -- the provenance a memory must always be able to give.
    await createMemoryEntry({
      type: 'fact',
      content: capture.text,
      source: 'capture',
      derivedFrom: capture.id,
    });
    if (filed) await recordEvent({ type: 'capture.filed', subject: capture.id, source: 'capture' });
  } catch (error) {
    console.error('[capture] saved the capture but its memory or event failed:', error);
  }
}

/**
 * The response a capture got when it was filed, rebuilt from the stored
 * capture and the record it produced, for a client that sent it twice. The
 * destination, route and day are on the capture; the record is its `about`
 * link; the note is read back from that record.
 *
 * @param {import('./domain/types.js').Capture} capture
 */
async function receiptOf(capture) {
  const record = await getCaptureProducedRecord(capture);
  /** @type {string | undefined} */
  let note;
  if (capture.route === 'unclassified') {
    // Saved, still being classified or never classified: no note claims
    // what was or was not filed.
  } else if (capture.destination === 'health') {
    const weight = /** @type {import('./domain/types.js').Measurement | null} */ (record);
    note = weight === null ? 'no weight filed' : formatWeight(weight.value) + ' ' + weight.unit;
  } else if (capture.destination === 'finance') {
    const transaction = /** @type {import('./domain/types.js').Transaction | null} */ (record);
    note = transaction === null ? 'no transaction filed' : formatEuro(transaction.amount, { cents: true });
  }
  const saidOn = toDayKey(new Date(capture.saidAt));
  return {
    destination: capture.destination,
    route: capture.route,
    recordId: record?.id ?? null,
    note,
    saidOn,
    receiptLine: receiptLineFor(capture.destination, capture.route, capture.text, note, saidOn),
  };
}

/**
 * The receipt line, naming the day when the sentence was said on another one
 * (a flushed queue). A same-day capture reads exactly as the bar words it.
 *
 * @param {string} destination
 * @param {string} route
 * @param {string} text
 * @param {string | undefined} note
 * @param {string} saidOn
 */
function receiptLineFor(destination, route, text, note, saidOn) {
  const line = formatReceiptLine(destination, text, note, route);
  return saidOn === toDayKey(new Date()) ? line : line + ' · said ' + saidOn;
}
