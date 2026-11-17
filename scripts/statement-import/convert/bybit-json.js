/**
 * A card's JSON export -- Bybit's, as the user hands it over -- converted into
 * the rows the `card-normalised` format reads. Pure: parsed JSON and the rows
 * of earlier CSVs in, rows, skipped movements and problems out. No file, no
 * clock.
 *
 * The rules (`.claude/skills/update-finances/SKILL.md`, step 3):
 *
 * - `Purchase` is `Addebito`, `Refund` is `Rimborso`; any other `tipo` is a
 *   problem, since its sign is unknown.
 * - `Reversed` is an annulled authorisation: skipped, whatever its sign.
 * - `Successful` is `Completata` at its amount. `In Progress` with a booked
 *   amount (`importo_contabilizzato_eur`, a fuel pump's hold the usual case)
 *   is `Completata` at the booked amount; a pending refund with none is
 *   already in the balance and is `Completata` at its amount; a pending
 *   purchase with none is left out and said. Any other `stato` is a problem.
 * - The amount used must be negative for a purchase and positive for a
 *   refund, a number with at most two decimals, not zero; the timestamp
 *   `YYYY-MM-DD HH:MM:SS`. Otherwise a problem: a sign or an amount is never
 *   guessed.
 * - **The merchant identity.** The importer's stable id hashes
 *   `commerciante`, so a movement once written with the network's raw name
 *   and once with a cleaned one would be imported twice. An earlier CSV row
 *   at the same timestamp -- any row, an authorisation included -- gives the
 *   merchant, the clean name and the categories; with none, the JSON's name
 *   is used as given and the row is listed.
 *
 * Plain Node, relative imports only.
 */

import { formatCsv, parseCsvRecords } from '../../csv.js';
import { parseLocalTimestamp } from '../formats/common.js';
import { cardNormalised } from '../formats/card-normalised.js';
import { headerDifference } from '../formats/index.js';

/** The columns written, the format's header exactly. */
export const CARD_COLUMNS = cardNormalised.header;

/**
 * @typedef {object} CardCsvRow one line of the CSV, by column
 * @property {string} data_ora
 * @property {string} commerciante
 * @property {string} nome_pulito
 * @property {string} importo
 * @property {string} valuta
 * @property {string} tipo
 * @property {string} stato
 * @property {string} categoria
 * @property {string} sottocategoria
 * @property {string} commissione_estero
 * @property {string} cashback
 *
 * @typedef {Pick<CardCsvRow, 'data_ora' | 'commerciante' | 'nome_pulito' | 'tipo' | 'categoria' | 'sottocategoria'>} KnownRow
 *   a row of an earlier card-normalised CSV, the columns the identity reads
 *
 * @typedef {object} Report a movement that was not converted, or one to note
 * @property {number | null} index the movement's place in `movimenti`, from
 *   1; null for the file itself
 * @property {string} at its timestamp as given, or ''
 * @property {string} merchant its merchant as given, or ''
 * @property {string} reason
 *
 * @typedef {object} Conversion
 * @property {CardCsvRow[]} rows in the JSON's order
 * @property {Report[]} skipped not movements, or not yet: left out on purpose
 * @property {Report[]} problems could not be converted: nothing is written while any is here
 * @property {Omit<Report, 'reason'>[]} fromGivenName rows whose merchant is
 *   the JSON's name, no earlier row having the timestamp
 * @property {{ amount: number, on: string | null } | null} balance the
 *   available balance the JSON states, in minor units, and the day it was read
 */

/** @type {Record<string, string>} */
const TYPE = { Purchase: 'Addebito', Refund: 'Rimborso' };
const MOVEMENT_TYPES = new Set(Object.values(TYPE));

/**
 * @param {unknown} json the parsed file, untrusted
 * @param {readonly KnownRow[]} known the rows of earlier card-normalised CSVs
 * @returns {Conversion}
 */
export function convertBybitJson(json, known) {
  if (!isObject(json)) throw new Error('the file is not a JSON object');
  if (!Array.isArray(json.movimenti)) throw new Error('movimenti is not an array');

  /** @type {Conversion} */
  const result = { rows: [], skipped: [], problems: [], fromGivenName: [], balance: null };
  readBalance(json, result);

  /** @type {Map<string, KnownRow[]>} */
  const byTimestamp = new Map();
  for (const row of known) {
    const at = row.data_ora.trim();
    byTimestamp.set(at, [...(byTimestamp.get(at) ?? []), row]);
  }

  json.movimenti.forEach((/** @type {unknown} */ item, /** @type {number} */ at) => {
    const index = at + 1;
    if (!isObject(item)) {
      result.problems.push({ index, at: '', merchant: '', reason: 'is not an object' });
      return;
    }
    const converted = convertMovement(item, byTimestamp);
    const where = { index, at: typeof item.data === 'string' ? item.data : '', merchant: typeof item.merchant === 'string' ? item.merchant : '' };
    if ('problem' in converted) result.problems.push({ ...where, reason: converted.problem });
    else if ('skip' in converted) result.skipped.push({ ...where, reason: converted.skip });
    else {
      result.rows.push(converted.row);
      if (converted.fromGivenName) result.fromGivenName.push(where);
    }
  });
  return result;
}

/**
 * One movement: a row, a reason to skip it, or a problem.
 *
 * @param {Record<string, unknown>} item
 * @param {Map<string, KnownRow[]>} byTimestamp
 * @returns {{ row: CardCsvRow, fromGivenName: boolean } | { skip: string } | { problem: string }}
 */
function convertMovement(item, byTimestamp) {
  for (const field of ['data', 'merchant', 'tipo', 'stato']) {
    if (typeof item[field] !== 'string') return { problem: field + ' is not text' };
  }
  if (item.categoria !== undefined && item.categoria !== null && typeof item.categoria !== 'string') return { problem: 'categoria is not text' };
  const data = /** @type {string} */ (item.data);
  const merchant = /** @type {string} */ (item.merchant).trim();
  const type = /** @type {string} */ (item.tipo).trim();
  const state = /** @type {string} */ (item.stato).trim();

  if (state === 'Reversed') return { skip: 'annulled authorisation' };
  const at = parseLocalTimestamp(data);
  if (at === null) return { problem: 'data "' + data + '" is not YYYY-MM-DD HH:MM:SS' };
  if (merchant === '') return { problem: 'merchant is empty' };
  const tipo = TYPE[type];
  if (tipo === undefined) return { problem: 'tipo "' + type + '" is neither Purchase nor Refund: its sign is unknown' };
  if (state !== 'Successful' && state !== 'In Progress') return { problem: 'stato "' + state + '" is not Successful, In Progress or Reversed' };

  const hasBooked = item.importo_contabilizzato_eur !== undefined && item.importo_contabilizzato_eur !== null;
  const booked = hasBooked ? readCents(item.importo_contabilizzato_eur, 'importo_contabilizzato_eur') : null;
  if (booked !== null && 'problem' in booked) return booked;

  /** @type {{ cents: number, field: string, value: unknown }} */
  let used;
  if (state === 'In Progress' && booked !== null) {
    used = { cents: booked.cents, field: 'importo_contabilizzato_eur', value: item.importo_contabilizzato_eur };
  } else if (state === 'In Progress' && type === 'Purchase') {
    return { skip: 'pending, no booked amount' };
  } else {
    const amount = readCents(item.importo_eur, 'importo_eur');
    if ('problem' in amount) return amount;
    if (booked !== null && booked.cents !== amount.cents) {
      return { problem: 'Successful, yet importo_contabilizzato_eur ' + String(item.importo_contabilizzato_eur) + ' differs from importo_eur ' + String(item.importo_eur) };
    }
    used = { cents: amount.cents, field: 'importo_eur', value: item.importo_eur };
  }
  if (type === 'Purchase' && used.cents > 0) return { problem: used.field + ' ' + String(used.value) + ' is not negative, as a Purchase is' };
  if (type === 'Refund' && used.cents < 0) return { problem: used.field + ' ' + String(used.value) + ' is not positive, as a Refund is' };

  const identity = identityAt(at.when, byTimestamp);
  if ('problem' in identity) return identity;
  return {
    row: {
      data_ora: at.when,
      commerciante: identity.known?.commerciante.trim() ?? merchant,
      nome_pulito: identity.known?.nome_pulito.trim() ?? '',
      importo: formatCents(Math.abs(used.cents)),
      valuta: 'EUR',
      tipo,
      stato: 'Completata',
      categoria: identity.known?.categoria.trim() ?? withoutMcc(typeof item.categoria === 'string' ? item.categoria : ''),
      sottocategoria: identity.known?.sottocategoria.trim() ?? '',
      commissione_estero: '0',
      cashback: '0',
    },
    fromGivenName: identity.known === null,
  };
}

/**
 * The earlier row a timestamp names, if any. Several that disagree on the
 * merchant are a problem; when they agree, a movement row (`Addebito`,
 * `Rimborso`) is preferred over an authorisation, since it carries the clean
 * name and the categories the import kept.
 *
 * @param {string} when
 * @param {Map<string, KnownRow[]>} byTimestamp
 * @returns {{ known: KnownRow | null } | { problem: string }}
 */
function identityAt(when, byTimestamp) {
  const rows = byTimestamp.get(when) ?? [];
  if (rows.length === 0) return { known: null };
  const merchants = [...new Set(rows.map((row) => row.commerciante.trim()))];
  if (merchants.length > 1) {
    return { problem: 'the earlier rows at this timestamp disagree on the merchant: ' + merchants.map((name) => '"' + name + '"').join(', ') };
  }
  return { known: rows.find((row) => MOVEMENT_TYPES.has(row.tipo.trim())) ?? rows[0] };
}

/**
 * The file's available balance, when it states one.
 *
 * @param {Record<string, unknown>} json
 * @param {Conversion} result
 */
function readBalance(json, result) {
  if (json.saldo_disponibile_eur === undefined || json.saldo_disponibile_eur === null) return;
  const amount = readCents(json.saldo_disponibile_eur, 'saldo_disponibile_eur', true);
  if ('problem' in amount) {
    result.problems.push({ index: null, at: '', merchant: '', reason: amount.problem });
    return;
  }
  result.balance = { amount: amount.cents, on: typeof json.estratto_il === 'string' ? json.estratto_il : null };
}

/**
 * A JSON number of euros as integer cents, converted once. More than two
 * decimals is a problem, never rounded away: `String` gives the shortest
 * text that reads back as the same float, so it shows the decimals the file
 * wrote.
 *
 * @param {unknown} value
 * @param {string} field
 * @param {boolean} [zeroAllowed]
 * @returns {{ cents: number } | { problem: string }}
 */
function readCents(value, field, zeroAllowed = false) {
  if (value === undefined || value === null) return { problem: field + ' is missing' };
  if (typeof value !== 'number' || !Number.isFinite(value)) return { problem: field + ' is not a number' };
  if (!/^-?\d+(\.\d{1,2})?$/.test(String(value))) return { problem: field + ' ' + String(value) + ' has more than two decimals' };
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) return { problem: field + ' ' + String(value) + ' is too large' };
  if (cents === 0 && !zeroAllowed) return { problem: field + ' is zero' };
  return { cents: cents === 0 ? 0 : cents };
}

/**
 * Cents as the CSV writes them: "1234.50", no thousands separator. Integer
 * arithmetic only.
 *
 * @param {number} cents
 * @returns {string}
 */
function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const magnitude = Math.abs(cents);
  return sign + String(Math.floor(magnitude / 100)) + '.' + String(magnitude % 100).padStart(2, '0');
}

/**
 * The category text without a trailing merchant category code.
 *
 * @param {string} text
 */
function withoutMcc(text) {
  return text.replace(/\s*\(MCC \d{4}\)\s*$/, '').trim();
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The rows of an earlier card-normalised CSV, every one -- an authorisation
 * as much as a charge -- for the merchant identity. A header that is not the
 * format's, or a line with the wrong number of fields, is refused.
 *
 * @param {string} text
 * @returns {KnownRow[]}
 */
export function readKnownRows(text) {
  const records = parseCsvRecords(text);
  if (records.length === 0) return [];
  const header = records[0].cells.map((cell) => cell.trim());
  const { missing, unexpected } = headerDifference(cardNormalised, header);
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error('the header does not match the card-normalised header: ' + header.join(','));
  }
  return records.slice(1).map((record) => {
    if (record.cells.length !== header.length) {
      throw new Error('line ' + record.line + ' has ' + record.cells.length + ' fields, the header has ' + header.length);
    }
    /** @param {string} name */
    const cell = (name) => record.cells[header.indexOf(name)];
    return {
      data_ora: cell('data_ora'),
      commerciante: cell('commerciante'),
      nome_pulito: cell('nome_pulito'),
      tipo: cell('tipo'),
      categoria: cell('categoria'),
      sottocategoria: cell('sottocategoria'),
    };
  });
}

/**
 * The rows as the CSV file: a byte-order mark, as the hand-made files have,
 * then RFC 4180 with CRLF (`formatCsv`), which `parseCsvRecords` reads back.
 *
 * @param {readonly CardCsvRow[]} rows
 * @returns {string}
 */
export function toCardCsv(rows) {
  return '\uFEFF' + formatCsv([CARD_COLUMNS, ...rows.map((row) => CARD_COLUMNS.map((column) => row[/** @type {keyof CardCsvRow} */ (column)]))]);
}
