#!/usr/bin/env node
/**
 * Converts what the fetch-statements skill saved from a bank's or a card's
 * own web API (a "dump") into the file the next step reads (ADR 0061): a
 * bank's into a CSV for `npm run data:import-statement`, the Bybit card's
 * into the card JSON for `npm run data:convert-bybit`. The rules are in
 * `scripts/statement-import/convert/api-dump.js`.
 *
 *   npm run data:convert-dump -- <dump.json> [--from YYYY-MM] [--to YYYY-MM] [--out <file>]
 *
 * `--from` and `--to` keep the months asked for, both included; without them
 * every movement in the dump is kept. Without `--out` it prints the report
 * and writes nothing. With `--out` it writes the file, refusing to overwrite
 * one that exists. Any problem writes nothing and exits 1. It reads and
 * writes files only: never your data. The dump and what it becomes are
 * personal: keep them out of the repository.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { env } from '../lib/config/env.js';
import { convertDump, toOutput } from './statement-import/convert/api-dump.js';

/**
 * @typedef {object} DumpOptions
 * @property {string} dumpPath
 * @property {string | null} from
 * @property {string | null} to
 * @property {string | null} out where to write; null: a dry run
 * @property {string} [timeZone] the user's; the configured one when absent
 * @property {(line: string) => void} [print]
 */

/**
 * @param {DumpOptions} options
 * @returns {Promise<{ ok: boolean, written: boolean }>}
 */
export async function convertDumpFile({ dumpPath, from, to, out, timeZone = env.timezone, print = (line) => console.log(line) }) {
  /** @type {unknown} */
  let json;
  try {
    json = JSON.parse(await readFile(dumpPath, 'utf8'));
  } catch (error) {
    throw new Error(dumpPath + ' is not readable JSON: ' + (error instanceof Error ? error.message : String(error)), { cause: error });
  }
  const result = convertDump(json, { from, to }, timeZone);
  const ok = result.problems.length === 0;

  let written = false;
  if (ok && out !== null) {
    try {
      await writeFile(out, toOutput(result), { flag: 'wx' });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'EEXIST') throw new Error(out + ' already exists: name a new file', { cause: error });
      throw error;
    }
    written = true;
  }
  const outcome = written ? 'written to ' + out + '.' : out === null ? 'dry run: nothing was written.' : 'refused: nothing was written.';
  for (const line of describeDump(result, { from, to }, outcome)) print(line);
  return { ok, written };
}

/**
 * The report, line by line. Printed to the terminal only: it holds your
 * merchants and descriptions.
 *
 * @param {import('./statement-import/convert/api-dump.js').DumpConversion} result
 * @param {import('./statement-import/convert/api-dump.js').Window} window
 * @param {string} outcome
 * @returns {string[]}
 */
export function describeDump(result, window, outcome) {
  const converted = result.card === null ? result.rows.length : result.card.movimenti.length;
  const what = result.card === null ? 'a CSV in the ' + result.format + ' format, for data:import-statement' : 'the card JSON, for data:convert-bybit';
  const lines = [
    result.source + ' to ' + what + ' -- ' + outcome,
    '',
    'Months: ' + (window.from ?? 'from the first') + ' to ' + (window.to ?? 'the last') +
      (result.range === null ? ' -- nothing in them' : ' -- movements from ' + result.range.first + ' to ' + result.range.last),
    'Records: ' + result.inWindow + ' in the months, ' + result.outsideWindow + ' outside -- ' +
      converted + ' converted, ' + result.left.length + ' left out, ' + result.problems.length + ' problem(s)',
  ];
  /** @param {import('./statement-import/convert/api-dump.js').Left} row */
  const where = (row) => '#' + row.index + '  ' + (row.day || '(no day)') + '  ' + (row.text || '(no text)') + ' -- ' + row.reason;
  section(lines, 'Left out', result.left.map(where));
  section(lines, 'Problems -- nothing is written until these are resolved', result.problems.map(where));
  if (result.card !== null) {
    lines.push('', 'Next: npm run data:convert-bybit -- <this file> --known <every earlier Bybit CSV> --out <new.csv>');
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
 * @returns {DumpOptions}
 */
export function parseArgs(args) {
  /** @type {string[]} */
  const paths = [];
  /** @type {Record<'--from' | '--to' | '--out', string | null>} */
  const named = { '--from': null, '--to': null, '--out': null };
  for (let at = 0; at < args.length; at += 1) {
    const arg = args[at];
    if (arg === '--from' || arg === '--to' || arg === '--out') {
      const next = args[at + 1];
      if (next === undefined || next.startsWith('--')) throw new Error(arg + ' needs a value');
      if (named[arg] !== null) throw new Error(arg + ' is named twice');
      named[arg] = next;
      at += 1;
    } else if (arg.startsWith('--')) throw new Error('unknown option ' + arg);
    else paths.push(arg);
  }
  if (paths.length !== 1) throw new Error('name one dump file');
  return { dumpPath: paths[0], from: named['--from'], to: named['--to'], out: named['--out'] };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error((error instanceof Error ? error.message : String(error)) + '\n');
    console.error('usage: npm run data:convert-dump -- <dump.json> [--from YYYY-MM] [--to YYYY-MM] [--out <file>]');
    process.exit(1);
  }
  try {
    const { ok } = await convertDumpFile(options);
    if (!ok) process.exit(1);
  } catch (error) {
    console.error('conversion refused: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
