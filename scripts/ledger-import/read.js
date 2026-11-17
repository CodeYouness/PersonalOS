/**
 * Reads the hand-kept ledger's three CSV exports (ADR 0042): its movements,
 * its category tree and its accounts. Pure: text in, rows and problems out.
 * Only this module knows the files' columns.
 *
 * A header that is not exactly the expected one is refused loudly, with what
 * is missing and what is unexpected: a file read by the wrong columns would
 * file wrong amounts, not fail. A row that cannot be read is a problem, which
 * blocks the write; nothing is dropped in silence.
 */

import { parseCsvRecords } from '../csv.js';
import { isDayKey } from '../../lib/domain/dates.js';
import { parseMinorUnits } from '../statement-import/money.js';

export const MOVEMENTS_HEADER = Object.freeze([
  'id', 'data', 'inserito_il', 'tipo', 'categoria', 'emoji', 'sottocategoria', 'importo', 'importo_con_segno', 'conto_uscita',
  'conto_entrata', 'note', 'progetto_tag', 'ricorrente', 'conteggiato_in_entrate_uscite',
]);
export const CATEGORIES_HEADER = Object.freeze(['categoria', 'emoji', 'sottocategoria', 'ricorrente', 'n_movimenti']);
export const ACCOUNTS_HEADER = Object.freeze(['conto', 'tipo', 'saldo_iniziale_inserito', 'saldo_attuale_dashboard', 'n_movimenti']);

/**
 * What a ledger row is, and which accounts it names: money out of
 * `conto_uscita`, money into `conto_entrata`, or both for a transfer.
 */
const TYPES = Object.freeze({
  uscita: { from: true, to: false, sign: -1 },
  entrata: { from: false, to: true, sign: 1 },
  trasferimento: { from: true, to: true, sign: 0 },
  investimento: { from: true, to: false, sign: -1 },
  saldo_iniziale: { from: false, to: true, sign: 1 },
});

/**
 * @typedef {keyof typeof TYPES} LedgerType
 *
 * @typedef {object} LedgerMovement
 * @property {number} line
 * @property {string} id the ledger's own id, unique
 * @property {string} date day key
 * @property {string} enteredAt when it was typed in, as the file has it
 * @property {LedgerType} type
 * @property {string} category
 * @property {string} subcategory
 * @property {number} amount minor units, always positive
 * @property {string} from the account money left, or ''
 * @property {string} to the account money reached, or ''
 * @property {string} note
 * @property {string[]} tags the project tag, trimmed and lowercased
 * @property {boolean} recurring
 * @property {boolean} counted whether the ledger counted it in spending or income
 *
 * @typedef {object} LedgerCategory
 * @property {number} line
 * @property {string} category
 * @property {string} subcategory
 * @property {boolean} recurring
 * @property {number | null} uses `n_movimenti`, null when not a number
 *
 * @typedef {object} LedgerAccount
 * @property {number} line
 * @property {string} name
 * @property {string} kind the file's own word for it, free text
 * @property {number | null} opening the opening balance typed in the ledger, minor units
 * @property {number | null} dashboard the balance the ledger's dashboard shows, minor units
 *
 * @typedef {object} Problem
 * @property {'movements' | 'categories' | 'accounts'} file
 * @property {number} line
 * @property {string} reason
 *
 * @typedef {object} ReadLedger
 * @property {LedgerMovement[]} movements in the file's order
 * @property {LedgerCategory[]} categories
 * @property {LedgerAccount[]} accounts
 * @property {Problem[]} problems
 */

/**
 * @param {{ movements: string, categories: string, accounts: string }} texts the three files, whole
 * @returns {ReadLedger}
 */
export function readLedger(texts) {
  /** @type {Problem[]} */
  const problems = [];
  const movements = readMovements(table(texts.movements, MOVEMENTS_HEADER, 'movements', problems), problems);
  const categories = readCategories(table(texts.categories, CATEGORIES_HEADER, 'categories', problems), problems);
  const accounts = readAccounts(table(texts.accounts, ACCOUNTS_HEADER, 'accounts', problems), problems);
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return { movements, categories, accounts, problems };
}

/**
 * A file's rows as values by column, its header checked against the
 * expected one. A row with the wrong number of fields is a problem.
 *
 * @param {string} text
 * @param {readonly string[]} expected
 * @param {Problem['file']} file
 * @param {Problem[]} problems
 * @returns {{ line: number, values: Record<string, string> }[]}
 */
function table(text, expected, file, problems) {
  const records = parseCsvRecords(text);
  if (records.length === 0) throw new Error('the ' + file + ' file is empty');
  const header = records[0].cells.map((cell) => cell.trim());
  const missing = expected.filter((name) => !header.includes(name));
  const unexpected = header.filter((name) => !expected.includes(name));
  const duplicate = header.find((name, at) => header.indexOf(name) !== at);
  if (missing.length > 0 || unexpected.length > 0 || duplicate !== undefined) {
    throw new Error(
      'the ' + file + " file's header is not the ledger's" +
        (missing.length > 0 ? '; missing: ' + missing.join(', ') : '') +
        (unexpected.length > 0 ? '; not expected: ' + unexpected.join(', ') : '') +
        (duplicate !== undefined ? '; twice: ' + duplicate : '') +
        '. Expected: ' + expected.join(',')
    );
  }
  /** @type {{ line: number, values: Record<string, string> }[]} */
  const rows = [];
  for (const record of records.slice(1)) {
    if (record.cells.length !== header.length) {
      problems.push({ file, line: record.line, reason: 'has ' + record.cells.length + ' fields, the header has ' + header.length });
      continue;
    }
    /** @type {Record<string, string>} */
    const values = {};
    header.forEach((name, at) => {
      values[name] = record.cells[at].trim();
    });
    rows.push({ line: record.line, values });
  }
  return rows;
}

/**
 * @param {{ line: number, values: Record<string, string> }[]} rows
 * @param {Problem[]} problems
 * @returns {LedgerMovement[]}
 */
function readMovements(rows, problems) {
  /** @type {LedgerMovement[]} */
  const movements = [];
  /** @type {Map<string, number>} */
  const ids = new Map();
  for (const { line, values } of rows) {
    /** @param {string} reason */
    const problem = (reason) => problems.push({ file: 'movements', line, reason });
    const reasons = [];
    const id = values.id;
    if (id === '') reasons.push('has no id');
    else if (ids.has(id)) reasons.push('the id ' + id + ' is also on line ' + ids.get(id));
    else ids.set(id, line);

    const date = values.data;
    if (!isDayKey(date)) reasons.push('data is not a YYYY-MM-DD day: "' + date + '"');
    const type = values.tipo;
    const shape = Object.hasOwn(TYPES, type) ? TYPES[/** @type {LedgerType} */ (type)] : undefined;
    if (shape === undefined) reasons.push('tipo is not one of ' + Object.keys(TYPES).join(', ') + ': "' + type + '"');

    const amount = parseMinorUnits(values.importo);
    if (amount === null || amount <= 0) reasons.push('importo is not a positive amount with a dot: "' + values.importo + '"');

    if (values.categoria === '' || values.sottocategoria === '') reasons.push('has no categoria or sottocategoria');

    const from = values.conto_uscita;
    const to = values.conto_entrata;
    if (shape !== undefined) {
      if (shape.from && from === '') reasons.push('a ' + type + ' needs conto_uscita');
      if (!shape.from && from !== '') reasons.push('a ' + type + ' has no conto_uscita, found "' + from + '"');
      if (shape.to && to === '') reasons.push('a ' + type + ' needs conto_entrata');
      if (!shape.to && to !== '') reasons.push('a ' + type + ' has no conto_entrata, found "' + to + '"');
      if (from !== '' && from === to) reasons.push('moves money from "' + from + '" to itself');
      // The signed amount must agree with the type: a row whose sign says
      // otherwise was typed wrong, and guessing which column is right would
      // file it the wrong way round.
      if (values.importo_con_segno !== '' && amount !== null && shape.sign !== 0) {
        const signed = parseMinorUnits(values.importo_con_segno);
        if (signed !== shape.sign * amount) {
          reasons.push('importo_con_segno ' + values.importo_con_segno + ' does not agree with a ' + type + ' of ' + values.importo);
        }
      }
    }

    const counted = yesNo(values.conteggiato_in_entrate_uscite);
    if (counted === null) reasons.push('conteggiato_in_entrate_uscite is not si or no: "' + values.conteggiato_in_entrate_uscite + '"');
    const recurring = values.ricorrente === '' ? false : yesNo(values.ricorrente);
    if (recurring === null) reasons.push('ricorrente is not Sì, No or empty: "' + values.ricorrente + '"');

    if (reasons.length > 0) {
      for (const reason of reasons) problem(reason);
      continue;
    }
    movements.push({
      line,
      id,
      date,
      enteredAt: values.inserito_il,
      type: /** @type {LedgerType} */ (type),
      category: values.categoria,
      subcategory: values.sottocategoria,
      amount: /** @type {number} */ (amount),
      from,
      to,
      note: values.note,
      tags: tagsOf(values.progetto_tag),
      recurring: /** @type {boolean} */ (recurring),
      counted: /** @type {boolean} */ (counted),
    });
  }
  return movements;
}

/**
 * @param {{ line: number, values: Record<string, string> }[]} rows
 * @param {Problem[]} problems
 * @returns {LedgerCategory[]}
 */
function readCategories(rows, problems) {
  /** @type {LedgerCategory[]} */
  const categories = [];
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const { line, values } of rows) {
    if (values.categoria === '' || values.sottocategoria === '') {
      problems.push({ file: 'categories', line, reason: 'has no categoria or sottocategoria' });
      continue;
    }
    const key = pairKey(values.categoria, values.sottocategoria);
    if (seen.has(key)) {
      problems.push({ file: 'categories', line, reason: '"' + pairLabel(values.categoria, values.sottocategoria) + '" is also on line ' + seen.get(key) });
      continue;
    }
    seen.set(key, line);
    const recurring = values.ricorrente === '' ? false : yesNo(values.ricorrente);
    if (recurring === null) {
      problems.push({ file: 'categories', line, reason: 'ricorrente is not Sì, No or empty: "' + values.ricorrente + '"' });
      continue;
    }
    const uses = /^\d+$/.test(values.n_movimenti) ? Number(values.n_movimenti) : null;
    categories.push({ line, category: values.categoria, subcategory: values.sottocategoria, recurring, uses });
  }
  return categories;
}

/**
 * @param {{ line: number, values: Record<string, string> }[]} rows
 * @param {Problem[]} problems
 * @returns {LedgerAccount[]}
 */
function readAccounts(rows, problems) {
  /** @type {LedgerAccount[]} */
  const accounts = [];
  for (const { line, values } of rows) {
    if (values.conto === '') {
      problems.push({ file: 'accounts', line, reason: 'has no conto' });
      continue;
    }
    if (accounts.some((account) => account.name === values.conto)) {
      problems.push({ file: 'accounts', line, reason: 'the account "' + values.conto + '" is listed twice' });
      continue;
    }
    accounts.push({
      line,
      name: values.conto,
      kind: values.tipo,
      opening: values.saldo_iniziale_inserito === '' ? null : parseMinorUnits(values.saldo_iniziale_inserito),
      dashboard: values.saldo_attuale_dashboard === '' ? null : parseMinorUnits(values.saldo_attuale_dashboard),
    });
  }
  return accounts;
}

/**
 * `si`, `sì`, `no` in any case; null for anything else.
 *
 * @param {string} text
 * @returns {boolean | null}
 */
function yesNo(text) {
  const word = text.trim().toLowerCase();
  if (word === 'si' || word === 'sì') return true;
  if (word === 'no') return false;
  return null;
}

/**
 * The project tag as the store keeps tags: trimmed, lowercased, each once. A
 * cell holding several, separated by commas, gives several.
 *
 * @param {string} text
 * @returns {string[]}
 */
function tagsOf(text) {
  return [...new Set(text.split(',').map((tag) => tag.trim().toLowerCase()).filter((tag) => tag !== ''))];
}

/**
 * The key of a category > subcategory pair: the same subcategory name under
 * two categories is two pairs.
 *
 * @param {string} category
 * @param {string} subcategory
 * @returns {string}
 */
export function pairKey(category, subcategory) {
  return category + '\u001f' + subcategory;
}

/**
 * @param {string} category
 * @param {string} subcategory
 * @returns {string}
 */
export function pairLabel(category, subcategory) {
  return category + ' > ' + subcategory;
}
