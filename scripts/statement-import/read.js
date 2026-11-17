/**
 * Reads a statement: the CSV, the header checked against the declared format
 * (or the one format it matches, when none is declared), and the format's
 * parse. Pure: text in, rows, skipped lines and problems out.
 *
 * A header that does not match the declared format is refused loudly, with
 * what is missing and what is unexpected: a file read with the wrong format
 * would import wrong signs, not fail.
 */

import { parseCsvRecords } from '../csv.js';
import { FORMATS, formatById, headerDifference } from './formats/index.js';

/**
 * @typedef {object} ReadStatement
 * @property {import('./formats/common.js').StatementFormat} format
 * @property {boolean} detected true when no format was declared and the header chose it
 * @property {number} lineCount data lines read, the header not counted
 * @property {import('./formats/common.js').StatementRow[]} rows
 * @property {import('./formats/common.js').Skip[]} skipped
 * @property {import('./formats/common.js').Problem[]} problems
 */

/**
 * @param {string} text the whole file
 * @param {string | null} formatId what `--format` named, or null to detect
 * @returns {ReadStatement}
 */
export function readStatement(text, formatId) {
  const records = parseCsvRecords(text);
  if (records.length === 0) throw new Error('the file is empty');
  const header = records[0].cells.map((cell) => cell.trim());
  const duplicate = header.find((name, at) => header.indexOf(name) !== at);
  if (duplicate !== undefined) throw new Error('the header names the column "' + duplicate + '" twice');

  const format = chooseFormat(header, formatId);
  const detected = formatId === null;

  /** @type {import('./formats/common.js').RawRow[]} */
  const raw = [];
  /** @type {import('./formats/common.js').Problem[]} */
  const fieldProblems = [];
  for (const record of records.slice(1)) {
    if (record.cells.length !== header.length) {
      fieldProblems.push({ line: record.line, reason: 'has ' + record.cells.length + ' fields, the header has ' + header.length });
      continue;
    }
    /** @type {Record<string, string>} */
    const values = {};
    header.forEach((name, at) => {
      values[name] = record.cells[at];
    });
    raw.push({ line: record.line, values });
  }
  const parsed = format.parse(raw);
  return {
    format,
    detected,
    lineCount: records.length - 1,
    rows: parsed.rows,
    skipped: parsed.skipped,
    problems: [...fieldProblems, ...parsed.problems].sort((a, b) => a.line - b.line),
  };
}

/**
 * @param {string[]} header
 * @param {string | null} formatId
 * @returns {import('./formats/common.js').StatementFormat}
 */
function chooseFormat(header, formatId) {
  const ids = FORMATS.map((format) => format.id).join(', ');
  if (formatId !== null) {
    const format = formatById(formatId);
    if (format === undefined) throw new Error('no format "' + formatId + '"; the formats are ' + ids);
    const { missing, unexpected } = headerDifference(format, header);
    if (missing.length > 0 || unexpected.length > 0) {
      throw new Error(
        'the header does not match the format "' + format.id + '"' +
          (missing.length > 0 ? '; missing: ' + missing.join(', ') : '') +
          (unexpected.length > 0 ? '; not expected: ' + unexpected.join(', ') : '') +
          '. Header found: ' + header.join(',')
      );
    }
    return format;
  }
  const matching = FORMATS.filter((format) => {
    const { missing, unexpected } = headerDifference(format, header);
    return missing.length === 0 && unexpected.length === 0;
  });
  if (matching.length !== 1) {
    throw new Error('no format matches this header (' + header.join(',') + '); name one with --format: ' + ids);
  }
  return matching[0];
}
