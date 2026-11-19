/**
 * A bank's or a card's own web API, as the browser saved it (a "dump"),
 * converted into the shape an existing format already reads (ADR 0061).
 * Pure: the parsed dump, a month window and a timezone in; rows, left-out
 * movements and problems out. No file, no clock.
 *
 * The dump is what the fetch-statements skill saves, with no logic in the
 * browser: `{ source, fetchedAt, records }`, `records` being the API's own
 * movement objects, untouched. Every rule lives here, so it is tested and the
 * same on every run.
 *
 * - `bybit-card-api` becomes the card JSON `convertBybitJson` reads
 *   (`movimenti[]`), so the card's rules -- pending fuel holds, annulled
 *   authorisations, the merchant identity of earlier files -- stay in one
 *   place, `bybit-json.js`. A declined payment (`displayStatus` 2) moved no
 *   money and is left out here.
 * - `mediolanum-api` becomes `bank-normalised-typed` rows: the bank's
 *   movement id is the stable id.
 * - `credit-agricole-api` becomes `bank-normalised-signed` rows, with the
 *   running balance. This format has no bank id, so the stable id hashes the
 *   row's raw text (ADR 0041): `causale` trimmed and `descrizione` with its
 *   runs of white space made one space and trimmed -- exactly as the files
 *   already imported were written. Do not "clean" either further, or every
 *   movement is imported a second time.
 *
 * Plain Node, relative imports only.
 */

import { monthOf, toDayKey } from '../../../lib/domain/dates.js';
import { formatCsv } from '../../csv.js';
import { bankNormalisedSigned } from '../formats/bank-normalised-signed.js';
import { bankNormalisedTyped } from '../formats/bank-normalised-typed.js';

/** @typedef {'bybit-card-api' | 'mediolanum-api' | 'credit-agricole-api'} DumpSource */

/** @type {readonly DumpSource[]} */
export const DUMP_SOURCES = Object.freeze(['bybit-card-api', 'mediolanum-api', 'credit-agricole-api']);

/**
 * @typedef {object} Window inclusive months, `YYYY-MM`; null: open on that side
 * @property {string | null} from
 * @property {string | null} to
 *
 * @typedef {object} Left a record not converted, on purpose or not
 * @property {number} index its place in `records`, from 1
 * @property {string} day its day, or ''
 * @property {string} text its merchant or description, or ''
 * @property {string} reason
 *
 * @typedef {object} CardExport the JSON `convertBybitJson` reads
 * @property {string} carta
 * @property {string} periodo
 * @property {string} estratto_il
 * @property {Record<string, unknown>[]} movimenti
 *
 * @typedef {object} DumpConversion
 * @property {DumpSource} source
 * @property {'card-json' | 'csv'} output what `toOutput` writes
 * @property {string | null} format the statement format the CSV is for; null for the card JSON
 * @property {Record<string, string>[]} rows bank rows, by column; empty for the card
 * @property {CardExport | null} card the card JSON; null for a bank
 * @property {number} inWindow records inside the window
 * @property {number} outsideWindow records outside it, not converted
 * @property {Left[]} left inside the window, left out on purpose
 * @property {Left[]} problems could not be converted: nothing is written while any is here
 * @property {{ first: string, last: string } | null} range the days converted
 */

/**
 * @param {unknown} dump the parsed file, untrusted
 * @param {Window} window
 * @param {string} timeZone the user's, for the card's instants
 * @returns {DumpConversion}
 */
export function convertDump(dump, window, timeZone) {
  if (!isObject(dump)) throw new Error('the file is not a JSON object');
  const source = dump.source;
  if (typeof source !== 'string' || !DUMP_SOURCES.includes(/** @type {DumpSource} */ (source))) {
    throw new Error('source is not one of ' + DUMP_SOURCES.join(', '));
  }
  if (!Array.isArray(dump.records)) throw new Error('records is not an array');
  checkWindow(window);
  const fetchedAt = typeof dump.fetchedAt === 'string' ? dump.fetchedAt : '';
  if (source === 'bybit-card-api') return convertCard(dump.records, window, timeZone, fetchedAt);
  if (source === 'mediolanum-api') return convertBank(source, dump.records, window, mediolanumRow, bankNormalisedTyped);
  return convertBank(/** @type {DumpSource} */ (source), dump.records, window, creditAgricoleRow, bankNormalisedSigned);
}

/**
 * The file `convertDump`'s result is written as: the card JSON, or the CSV
 * with a byte-order mark and CRLF, as the other converted files are.
 *
 * @param {DumpConversion} result
 * @returns {string}
 */
export function toOutput(result) {
  if (result.card !== null) return JSON.stringify(result.card, null, 2) + '\n';
  const format = result.source === 'mediolanum-api' ? bankNormalisedTyped : bankNormalisedSigned;
  return '\uFEFF' + formatCsv([format.header, ...result.rows.map((row) => format.header.map((column) => row[column] ?? ''))]);
}

/** @type {Record<string, string>} */
const CARD_TYPE = { deduct: 'Purchase', freeze: 'Purchase', unfreeze: 'Purchase', refund: 'Refund' };
/** @type {Record<string, string>} */
const CARD_STATE = { 0: 'In Progress', 1: 'Successful', 3: 'Reversed' };
const CARD_DECLINED = '2';

/**
 * @param {unknown[]} records
 * @param {Window} window
 * @param {string} timeZone
 * @param {string} fetchedAt
 * @returns {DumpConversion}
 */
function convertCard(records, window, timeZone, fetchedAt) {
  /** @type {DumpConversion} */
  const result = blank('bybit-card-api', 'card-json', null);
  /** @type {Record<string, unknown>[]} */
  const movimenti = [];
  /** @type {string[]} */
  const days = [];
  records.forEach((/** @type {unknown} */ item, /** @type {number} */ at) => {
    const index = at + 1;
    if (!isObject(item)) {
      result.problems.push({ index, day: '', text: '', reason: 'is not an object' });
      return;
    }
    const text = typeof item.merchName === 'string' ? item.merchName.trim() : '';
    const instant = Number(item.txnTime);
    if (typeof item.txnTime !== 'string' || !Number.isSafeInteger(instant) || instant <= 0) {
      result.problems.push({ index, day: '', text, reason: 'txnTime is not milliseconds since the epoch' });
      return;
    }
    const when = localTimestamp(instant, timeZone);
    const day = toDayKey(new Date(instant), timeZone);
    if (!inWindow(day, window)) {
      result.outsideWindow += 1;
      return;
    }
    result.inWindow += 1;
    const status = typeof item.displayStatus === 'string' ? item.displayStatus : '';
    if (status === CARD_DECLINED) {
      result.left.push({ index, day, text, reason: 'declined: no money moved' });
      return;
    }
    const type = typeof item.txnType === 'string' ? item.txnType : '';
    const amount = typeof item.totalTransactionAmount === 'string' ? Number(item.totalTransactionAmount) : Number.NaN;
    const reason =
      text === '' ? 'merchName is empty' :
      !(type in CARD_TYPE) ? 'txnType "' + type + '" is not deduct, freeze, unfreeze or refund: its sign is unknown' :
      !(status in CARD_STATE) ? 'displayStatus "' + status + '" is not 0, 1, 2 or 3' :
      !Number.isFinite(amount) || !/^\d+(\.\d{1,2})?$/.test(String(item.totalTransactionAmount)) ? 'totalTransactionAmount "' + String(item.totalTransactionAmount) + '" is not a positive amount' :
      null;
    if (reason !== null) {
      result.problems.push({ index, day, text, reason });
      return;
    }
    const tipo = CARD_TYPE[type];
    /** @type {Record<string, unknown>} */
    const movement = {
      data: when,
      merchant: text,
      tipo,
      // An authorisation released is the annulment of one: the card's rules skip it.
      stato: type === 'unfreeze' ? 'Reversed' : CARD_STATE[status],
      importo_eur: tipo === 'Refund' ? amount : -amount,
    };
    const category = typeof item.merchMccCategoryName === 'string' ? item.merchMccCategoryName.trim() : '';
    const mcc = typeof item.mccCode === 'string' ? item.mccCode.trim() : '';
    if (category !== '') movement.categoria = mcc === '' ? category : category + ' (MCC ' + mcc + ')';
    movimenti.push(movement);
    days.push(day);
  });
  result.card = {
    carta: 'Bybit Card',
    periodo: periodOf(window),
    estratto_il: dayOf(fetchedAt) ?? '',
    movimenti,
  };
  result.range = rangeOf(days);
  return result;
}

/**
 * @typedef {(item: Record<string, unknown>) => { row: Record<string, string> } | { problem: string }} BankRow
 */

/**
 * @param {DumpSource} source
 * @param {unknown[]} records
 * @param {Window} window
 * @param {BankRow} toRow
 * @param {import('../formats/common.js').StatementFormat} format
 * @returns {DumpConversion}
 */
function convertBank(source, records, window, toRow, format) {
  /** @type {DumpConversion} */
  const result = blank(source, 'csv', format.id);
  /** @type {string[]} */
  const days = [];
  records.forEach((/** @type {unknown} */ item, /** @type {number} */ at) => {
    const index = at + 1;
    if (!isObject(item)) {
      result.problems.push({ index, day: '', text: '', reason: 'is not an object' });
      return;
    }
    const converted = toRow(item);
    if ('problem' in converted) {
      result.problems.push({ index, day: '', text: '', reason: converted.problem });
      return;
    }
    const day = converted.row.data_operazione;
    if (!inWindow(day, window)) {
      result.outsideWindow += 1;
      return;
    }
    result.inWindow += 1;
    result.rows.push(converted.row);
    days.push(day);
  });
  result.range = rangeOf(days);
  return result;
}

/** @type {BankRow} */
function mediolanumRow(item) {
  const day = dayOf(item.dataOperazione);
  if (day === null) return { problem: 'dataOperazione is not an ISO date' };
  if (typeof item.importo !== 'number' || !Number.isFinite(item.importo)) return { problem: 'importo is not a number' };
  const tags = isObject(item.tagAutomatici) ? item.tagAutomatici : {};
  return {
    row: {
      data_operazione: day,
      data_valuta: dayOf(item.dataValuta) ?? '',
      // The bank's own direction. The format checks it against the sign and
      // blocks a row where they disagree: it is never derived here.
      tipo: text(tags.descrizioneTag1),
      importo: String(item.importo),
      valuta: text(item.codiceValuta) || 'EUR',
      controparte: text(tags.descrizioneTag3),
      categoria: text(tags.descrizioneTag4),
      descrizione_breve: text(item.descrizioneBreve),
      descrizione: oneLine(item.descrizione),
      id_movimento: text(item.idMovimento),
    },
  };
}

/** @type {BankRow} */
function creditAgricoleRow(item) {
  const day = dayOf(item.movementDate);
  if (day === null) return { problem: 'movementDate is not an ISO date' };
  if (typeof item.amountEuro !== 'number' || !Number.isFinite(item.amountEuro)) return { problem: 'amountEuro is not a number' };
  return {
    row: {
      data_operazione: day,
      data_valuta: dayOf(item.currencyDate) ?? '',
      importo: String(item.amountEuro),
      valuta: text(item.currency) || 'EUR',
      causale: text(item.cause),
      descrizione: oneLine(item.description),
      saldo_dopo_movimento: typeof item.finalBalance === 'number' && Number.isFinite(item.finalBalance) ? String(item.finalBalance) : '',
    },
  };
}

/**
 * An instant as `YYYY-MM-DD HH:MM:SS` in the timezone, the way the card's
 * earlier files wrote it.
 *
 * @param {number} instant milliseconds
 * @param {string} timeZone
 */
function localTimestamp(instant, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  /** @param {string} type */
  const part = (type) => parts.find((entry) => entry.type === type)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day') + ' ' + part('hour') + ':' + part('minute') + ':' + part('second');
}

/**
 * The day an ISO date-time names, as written: the bank sends local midnight
 * (`2026-11-02T00:00:00+01:00`) or midnight UTC for the same day.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function dayOf(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(T|$)/.exec(value.trim());
  return match === null ? null : match[1];
}

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} value */
function oneLine(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * @param {string} day
 * @param {Window} window
 */
function inWindow(day, window) {
  const month = monthOf(day);
  return (window.from === null || month >= window.from) && (window.to === null || month <= window.to);
}

/** @param {Window} window */
function checkWindow(window) {
  for (const month of [window.from, window.to]) {
    if (month !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('month "' + month + '" is not YYYY-MM');
  }
  if (window.from !== null && window.to !== null && window.from > window.to) throw new Error('--from ' + window.from + ' is after --to ' + window.to);
}

/** @param {Window} window */
function periodOf(window) {
  if (window.from !== null && window.from === window.to) return window.from;
  return (window.from ?? '…') + '..' + (window.to ?? '…');
}

/** @param {string[]} days */
function rangeOf(days) {
  if (days.length === 0) return null;
  const sorted = [...days].sort();
  return { first: sorted[0], last: sorted[sorted.length - 1] };
}

/**
 * @param {DumpSource} source
 * @param {'card-json' | 'csv'} output
 * @param {string | null} format
 * @returns {DumpConversion}
 */
function blank(source, output, format) {
  return { source, output, format, rows: [], card: null, inWindow: 0, outsideWindow: 0, left: [], problems: [], range: null };
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
