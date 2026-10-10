/**
 * Reads the spreadsheet's xlsx download into plain rows (#139). Only this
 * module knows the workbook's layout -- a form-fed personal finance
 * template, whose tab and column names are generic, not personal.
 *
 * - Movements, tab "Log Entrate/Uscite": header row 1, columns found by
 *   their header text, rows not sorted, reading stops at the first row with
 *   no date. The per-category columns are ignored: "Sottocategoria" holds
 *   their value.
 * - Trades, tab "Log Transazioni": header row 2, data from row 3, the left
 *   block only. A negative quantity is a sell.
 *
 * A tab is found by its name with punctuation ignored: an xlsx cannot hold
 * "/" in a sheet name, so an export may spell it differently.
 */

import readXlsxFile from 'read-excel-file/node';

/**
 * One movement as the sheet wrote it.
 *
 * @typedef {object} MovementRow
 * @property {number} line the row's number in the sheet, for the report
 * @property {string | null} timestamp ISO instant to the second, from the
 *   form's Timestamp
 * @property {string} date day key
 * @property {string} category "Categoria"
 * @property {string} subcategory "Sottocategoria"
 * @property {number | null} amount "Importo", in euros, always positive;
 *   null when the cell is empty or not a number
 * @property {string} note "Note"
 * @property {string} from "Da", the account money left, or ''
 * @property {string} to "A", the account money reached, or ''
 * @property {boolean} counted false when "Tracciamento in Entrate/Uscite" is "No"
 * @property {string[]} tags "Tag", split on commas
 */

/**
 * One line of the trades log.
 *
 * @typedef {object} TradeRow
 * @property {number} line
 * @property {string} date day key
 * @property {string} ticker
 * @property {number | null} quantity units, negative for a sell; null when
 *   not a number
 * @property {number | null} price per unit, in euros; null when not a number
 * @property {number | null} fee in euros; 0 when empty, null when not a number
 */

const MOVEMENTS_TAB = 'Log Entrate/Uscite';
const TRADES_TAB = 'Log Transazioni';

const MOVEMENT_COLUMNS = /** @type {const} */ ({
  timestamp: 'Timestamp',
  date: 'Informazioni cronologiche',
  category: 'Categoria',
  subcategory: 'Sottocategoria',
  amount: 'Importo',
  note: 'Note',
  from: 'Da',
  to: 'A',
  counted: 'Tracciamento in Entrate/Uscite',
  tags: 'Tag',
});

const TRADE_COLUMNS = /** @type {const} */ ({
  date: 'Data',
  ticker: 'Ticker',
  quantity: 'Quantità',
  price: "Prezzo d'acquisto",
  fee: 'Commissioni',
});

/**
 * @param {string} xlsxPath
 * @returns {Promise<{ movements: MovementRow[], trades: TradeRow[] }>}
 */
export async function readWorkbook(xlsxPath) {
  const sheets = await readXlsxFile(xlsxPath);
  return {
    movements: readMovements(findSheet(sheets, MOVEMENTS_TAB)),
    trades: readTrades(findSheet(sheets, TRADES_TAB)),
  };
}

/**
 * @param {{ sheet: string, data: unknown[][] }[]} sheets
 * @param {string} name
 * @returns {unknown[][]}
 */
function findSheet(sheets, name) {
  const key = squash(name);
  const found = sheets.find((sheet) => squash(sheet.sheet) === key);
  if (found === undefined) {
    throw new Error('the workbook has no "' + name + '" tab; it has ' + sheets.map((sheet) => '"' + sheet.sheet + '"').join(', '));
  }
  return found.data;
}

/** @param {string} text */
function squash(text) {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The column of each header in a header row, refusing a missing one.
 *
 * @template {Record<string, string>} T
 * @param {unknown[] | undefined} header
 * @param {T} columns
 * @param {string} tab
 * @returns {Record<keyof T, number>}
 */
function locate(header, columns, tab) {
  const names = (header ?? []).map((cell) => (typeof cell === 'string' ? cell.trim() : ''));
  /** @type {Record<string, number>} */
  const found = {};
  for (const [key, title] of Object.entries(columns)) {
    const index = names.indexOf(title);
    if (index === -1) throw new Error('the "' + tab + '" tab has no "' + title + '" column');
    found[key] = index;
  }
  return /** @type {Record<keyof T, number>} */ (found);
}

/**
 * @param {unknown[][]} data
 * @returns {MovementRow[]}
 */
function readMovements(data) {
  const column = locate(data[0], MOVEMENT_COLUMNS, MOVEMENTS_TAB);
  /** @type {MovementRow[]} */
  const rows = [];
  for (let index = 1; index < data.length; index += 1) {
    const cells = data[index];
    const date = dayKeyOf(cells[column.date]);
    if (date === null) break;
    const timestamp = cells[column.timestamp];
    rows.push({
      line: index + 1,
      timestamp: timestamp instanceof Date ? toTheSecond(timestamp) : null,
      date,
      category: text(cells[column.category]),
      subcategory: text(cells[column.subcategory]),
      amount: number(cells[column.amount]),
      note: text(cells[column.note]),
      from: text(cells[column.from]),
      to: text(cells[column.to]),
      counted: text(cells[column.counted]).toLowerCase() !== 'no',
      tags: text(cells[column.tags])
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== ''),
    });
  }
  return rows;
}

/**
 * @param {unknown[][]} data
 * @returns {TradeRow[]}
 */
function readTrades(data) {
  const column = locate(data[1], TRADE_COLUMNS, TRADES_TAB);
  /** @type {TradeRow[]} */
  const rows = [];
  for (let index = 2; index < data.length; index += 1) {
    const cells = data[index];
    const date = dayKeyOf(cells[column.date]);
    if (date === null) break;
    rows.push({
      line: index + 1,
      date,
      ticker: text(cells[column.ticker]),
      quantity: number(cells[column.quantity]),
      price: number(cells[column.price]),
      fee: isBlank(cells[column.fee]) ? 0 : number(cells[column.fee]),
    });
  }
  return rows;
}

/** @param {unknown} cell */
function text(cell) {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

/**
 * A number cell, or null when it is empty or holds something else -- never
 * 0, so a mistyped cell is reported rather than imported as nothing.
 *
 * @param {unknown} cell
 * @returns {number | null}
 */
function number(cell) {
  return typeof cell === 'number' && Number.isFinite(cell) ? cell : null;
}

/** @param {unknown} cell */
function isBlank(cell) {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
}

/**
 * A date cell as the day it shows. The xlsx stores a wall-clock serial and
 * the reader hands it back as that wall clock in UTC, so the UTC parts are
 * the day -- no timezone is involved.
 *
 * @param {unknown} cell
 * @returns {string | null}
 */
function dayKeyOf(cell) {
  if (!(cell instanceof Date) || Number.isNaN(cell.getTime())) return null;
  const pad = (/** @type {number} */ value) => String(value).padStart(2, '0');
  return cell.getUTCFullYear() + '-' + pad(cell.getUTCMonth() + 1) + '-' + pad(cell.getUTCDate());
}

/**
 * A timestamp rounded to the second: a serial loses a millisecond on the
 * way back, and the import keys on this.
 *
 * @param {Date} instant
 * @returns {string}
 */
function toTheSecond(instant) {
  return new Date(Math.round(instant.getTime() / 1000) * 1000).toISOString();
}
