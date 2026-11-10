/**
 * Reads DEGIRO's transactions export (Italian headers, decimal commas,
 * `DD-MM-YYYY` dates) into typed rows. Pure: text in, rows and problems out.
 * Money is never a float: amounts become integer cents, quantities integer
 * units (10^-8), by decimal-string arithmetic.
 *
 * A product name that wraps becomes a row of its own with no date; it is
 * joined to the row above. A row that cannot be read is a problem, never a
 * guess: the import is blocked until the file is fixed.
 *
 * @typedef {object} DegiroRow
 * @property {number} line the record's position in the file, header = 1
 * @property {string} date day key
 * @property {string} time HH:MM, for ordering within a day
 * @property {string} name
 * @property {string} isin
 * @property {number} units signed, 10^-8: negative is a sell
 * @property {number} value signed `Valore EUR` in cents
 * @property {number} fee |AutoFX| + |transaction costs| in cents
 * @property {string | null} orderId
 * @property {string} content the fields that identify the row, for a stable id
 *
 * @typedef {{ line: number, reason: string }} Problem
 */

import { isDayKey } from '../../lib/domain/dates.js';

const REQUIRED = {
  date: 'data',
  time: 'ora',
  name: 'prodotto',
  isin: 'isin',
  quantity: 'quantità',
  value: 'valore eur',
  autoFx: 'commissione autofx',
  costs: 'costi di transazione',
  orderId: 'id ordine',
};

const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/**
 * RFC 4180 records: quoted fields, doubled quotes, commas and newlines inside quotes.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let record = [];
  let field = '';
  let quoted = false;
  const source = text.codePointAt(0) === 0xfeff ? text.slice(1) : text;
  for (let at = 0; at < source.length; at += 1) {
    const char = source[at];
    if (quoted) {
      if (char === '"' && source[at + 1] === '"') {
        field += '"';
        at += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[at + 1] === '\n') at += 1;
      record.push(field);
      field = '';
      records.push(record);
      record = [];
    } else field += char;
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/**
 * A decimal with a comma ("1.234,56", "-12,5", "7") as an integer in
 * 10^-decimals, rounded half up in size. Null when it is not a number.
 *
 * @param {string} text
 * @param {number} decimals
 * @returns {number | null}
 */
export function parseScaled(text, decimals) {
  let clean = text.trim();
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(clean)) clean = clean.replaceAll('.', '');
  const match = /^(-?)(\d+)(?:[,.](\d+))?$/.exec(clean);
  if (match === null) return null;
  const fraction = match[3] ?? '';
  const kept = BigInt(match[2] + fraction.slice(0, decimals).padEnd(decimals, '0'));
  const roundUp = fraction.length > decimals && fraction[decimals] >= '5';
  const size = kept + (roundUp ? 1n : 0n);
  const value = Number(match[1] === '-' ? -size : size);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * @param {string} text `DD-MM-YYYY`
 * @returns {string | null} day key
 */
export function parseItalianDate(text) {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text.trim());
  if (match === null) return null;
  const key = match[3] + '-' + match[2] + '-' + match[1];
  return isDayKey(key) ? key : null;
}

/**
 * @param {string} text the whole export
 * @returns {{ rows: DegiroRow[], problems: Problem[] }}
 */
export function parseDegiro(text) {
  const records = parseCsv(text);
  if (records.length === 0) throw new Error('the export is empty');
  const header = records[0].map((cell) => cell.trim().toLowerCase());
  /** @type {Record<string, number>} */
  const at = {};
  for (const [key, name] of Object.entries(REQUIRED)) {
    const found = header.findIndex((cell) => cell === name || (key === 'costs' && cell.startsWith(name)));
    if (found === -1) throw new Error('this is not a DEGIRO transactions export: no "' + name + '" header');
    at[key] = found;
  }

  /** @type {DegiroRow[]} */
  const rows = [];
  /** @type {Problem[]} */
  const problems = [];
  records.slice(1).forEach((record, index) => {
    const line = index + 2;
    const cell = (/** @type {string} */ key) => (record[at[key]] ?? '').trim();
    if (cell('date') === '' && cell('isin') === '') {
      const others = record.filter((value, column) => column !== at.name && value.trim() !== '');
      const previous = rows.at(-1);
      if (others.length > 0 || cell('name') === '') problems.push({ line, reason: 'a row with no date that is not a wrapped product name' });
      else if (previous === undefined) problems.push({ line, reason: 'a wrapped product name with no row above it' });
      else previous.name += ' ' + cell('name');
      return;
    }
    const date = parseItalianDate(cell('date'));
    const units = parseScaled(cell('quantity'), 8);
    const value = parseScaled(cell('value'), 2);
    const autoFx = cell('autoFx') === '' ? 0 : parseScaled(cell('autoFx'), 2);
    const costs = cell('costs') === '' ? 0 : parseScaled(cell('costs'), 2);
    const isin = cell('isin');
    const reason =
      date === null ? 'the date "' + cell('date') + '" is not DD-MM-YYYY' :
      !ISIN_SHAPE.test(isin) ? 'the ISIN is not an ISIN' :
      units === null || units === 0 ? 'the quantity is not a non-zero number' :
      value === null ? 'the EUR value is not a number' :
      autoFx === null ? 'the AutoFX commission is not a number' :
      costs === null ? 'the transaction costs are not a number' :
      null;
    if (reason !== null || date === null || units === null || value === null || autoFx === null || costs === null) {
      problems.push({ line, reason: reason ?? 'unreadable' });
      return;
    }
    rows.push({
      line,
      date,
      time: cell('time'),
      name: cell('name'),
      isin,
      units,
      value,
      fee: Math.abs(autoFx) + Math.abs(costs),
      orderId: cell('orderId') === '' ? null : cell('orderId'),
      content: [date, cell('time'), isin, units, value, autoFx, costs].join('|'),
    });
  });
  return { rows, problems };
}
