#!/usr/bin/env node
/**
 * Converts a card's JSON export (Bybit's, as the user hands it over) into a
 * CSV in the `card-normalised` statement format, ready for
 * `npm run data:import-statement`. The rules are in
 * `scripts/statement-import/convert/bybit-json.js`.
 *
 *   npm run data:convert-bybit -- <file.json> [--known <earlier.csv> ...] [--out <file.csv>]
 *
 * `--known` names an earlier card-normalised CSV of the same card, as many
 * times as needed: a movement at a timestamp one of them has takes its
 * merchant, clean name and categories from it, so the importer's stable id
 * does not change between a raw and a cleaned-up name.
 *
 * Without `--out` it prints the report and writes nothing. With `--out` it
 * writes the CSV, refusing to overwrite a file that exists. Any problem row
 * writes nothing and exits 1. It reads and writes files only: never your
 * data. The export and the CSV are personal: keep them out of the repository.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { convertBybitJson, readKnownRows, toCardCsv } from './statement-import/convert/bybit-json.js';
import { formatMinor } from './statement-import/money.js';

/**
 * @typedef {object} ConvertOptions
 * @property {string} jsonPath
 * @property {string[]} known paths of earlier card-normalised CSVs
 * @property {string | null} out where to write the CSV; null: a dry run
 * @property {(line: string) => void} [print]
 */

/**
 * @param {ConvertOptions} options
 * @returns {Promise<{ ok: boolean, written: boolean }>}
 */
export async function convertBybit({ jsonPath, known, out, print = (line) => console.log(line) }) {
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(await readFile(jsonPath, 'utf8'));
  } catch (error) {
    throw new Error(jsonPath + ' is not readable JSON: ' + (error instanceof Error ? error.message : String(error)), { cause: error });
  }
  /** @type {import('./statement-import/convert/bybit-json.js').KnownRow[]} */
  const knownRows = [];
  for (const file of known) {
    try {
      knownRows.push(...readKnownRows(await readFile(file, 'utf8')));
    } catch (error) {
      throw new Error(file + ': ' + (error instanceof Error ? error.message : String(error)), { cause: error });
    }
  }
  const result = convertBybitJson(json, knownRows);
  const ok = result.problems.length === 0;

  let written = false;
  if (ok && out !== null) {
    try {
      await writeFile(out, toCardCsv(result.rows), { flag: 'wx' });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error(out + ' already exists: name a new file', { cause: error });
      throw error;
    }
    written = true;
  }
  const outcome = written ? 'written to ' + out + '.' : out === null ? 'dry run: nothing was written.' : 'refused: nothing was written.';
  for (const line of describeConversion(result, outcome)) print(line);
  return { ok, written };
}

/**
 * The report, line by line. Printed to the terminal only: it holds your
 * merchants and amounts.
 *
 * @param {import('./statement-import/convert/bybit-json.js').Conversion} result
 * @param {string} outcome
 * @returns {string[]}
 */
export function describeConversion(result, outcome) {
  const total = result.rows.length + result.skipped.length + result.problems.filter((problem) => problem.index !== null).length;
  const lines = [
    'Card JSON to card-normalised CSV -- ' + outcome,
    '',
    'Movements: ' + total + ' -- ' + result.rows.length + ' converted, ' + result.skipped.length + ' skipped, ' + result.problems.length + ' problem(s)',
  ];
  /** @param {{ index: number | null, at: string, merchant: string }} row */
  const where = (row) => (row.index === null ? 'the file' : (row.at || '(no timestamp)') + '  ' + (row.merchant || '(no merchant)'));
  section(lines, 'Skipped', result.skipped.map((row) => where(row) + ' -- ' + row.reason));
  section(lines, 'Problems -- nothing is written until these are resolved', result.problems.map((row) => where(row) + ' -- ' + row.reason));
  section(lines, 'Identity from the name as given (no earlier row at the timestamp; note them)', result.fromGivenName.map(where));
  if (result.balance !== null) {
    lines.push(
      '',
      'Balance: the export says ' + formatMinor(result.balance.amount) + ' EUR available' +
        (result.balance.on === null ? '' : ' on ' + result.balance.on) + ' -- record it on the account.'
    );
  }
  return lines;
}

/**
 * @param {string[]} lines
 * @param {string} title
 * @param {string[]} entries
 */
function section(lines, title, entries) {
  if (entries.length === 0) return;
  lines.push('', title + ':');
  for (const entry of entries) lines.push('  ' + entry);
}

/**
 * The command line, read strictly: an unknown flag or a missing value is an
 * error, never ignored.
 *
 * @param {string[]} args
 * @returns {ConvertOptions}
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const paths = [];
  /** @type {string[]} */
  const known = [];
  /** @type {string | null} */
  let out = null;
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    const value = () => {
      const next = args[at + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(arg + ' needs a value');
      at += 1;
      return next;
    };
    if (arg === '--known') known.push(value());
    else if (arg === '--out') {
      if (out !== null) throw new Error('--out is named twice');
      out = value();
    } else if (arg.startsWith('--')) throw new Error('unknown option ' + arg);
    else paths.push(arg);
  }
  if (paths.length !== 1) throw new Error('name one JSON file');
  return { jsonPath: paths[0], known, out };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error instanceof Error ? error.message : String(error)) + '\n');
    console.error('usage: npm run data:convert-bybit -- <file.json> [--known <earlier.csv> ...] [--out <file.csv>]');
    process.exit(1);
  }
  try {
    const { ok } = await convertBybit(options);
    if (!ok) process.exit(1);
  } catch (error) {
    console.error('conversion refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
