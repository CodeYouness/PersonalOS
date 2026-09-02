/**
 * Reading and writing the single JSON document behind the local path.
 *
 * Two files, and the second one is the point: data/seed.json is the starting
 * state and is never written to, data/personalos.json is your life. Deleting
 * the second restores the first, which gives you a reliable undo without a
 * line of undo logic. That property is worth protecting -- nothing here ever
 * writes to the seed.
 *
 * Writes are atomic: a temporary file in the same directory, then a rename.
 * A crash halfway through leaves the previous document intact instead of a
 * truncated one, and on a system that holds your net worth "half written" is
 * not an acceptable state.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env.js';

/**
 * The shape of the whole document. It is the JSON adapter's business and
 * nobody else's: a database adapter has no single document, which is exactly
 * why this typedef lives here and not in lib/domain.
 *
 * @typedef {object} PersonalOsState
 * @property {number} version
 * @property {import('../../domain/types.js').Profile} profile
 * @property {import('../../domain/types.js').Task[]} tasks
 * @property {import('../../domain/types.js').Person[]} people
 * @property {import('../../domain/types.js').Capture[]} captures
 * @property {import('../../domain/types.js').MemoryEntry[]} memory
 * @property {Record<string, import('../../domain/types.js').DailyLog>} dailyLogs
 * @property {import('../../domain/types.js').Goals} goals
 * @property {import('../../domain/types.js').ActivityEntry[]} activity
 */

const SEED_FILE = 'seed.json';
const WORKING_FILE = 'personalos.json';

/** @returns {string} */
export function seedPath() {
  return path.resolve(process.cwd(), env.dataDir, SEED_FILE);
}

/** @returns {string} */
export function workingPath() {
  return path.resolve(process.cwd(), env.dataDir, WORKING_FILE);
}

/**
 * The pristine starting state. Read-only by contract.
 *
 * @returns {Promise<PersonalOsState>}
 */
export async function readSeed() {
  return parse(await readFile(seedPath(), 'utf8'), seedPath());
}

/**
 * The working document, created from the seed the first time it is missing.
 *
 * @returns {Promise<PersonalOsState>}
 */
export async function readState() {
  try {
    return parse(await readFile(workingPath(), 'utf8'), workingPath());
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    const seed = await readSeed();
    await writeState(seed);
    return seed;
  }
}

/**
 * @param {PersonalOsState} state
 * @returns {Promise<void>}
 */
export async function writeState(state) {
  const target = workingPath();
  const temporary = target + '.' + process.pid + '.tmp';
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await rename(temporary, target);
}

/**
 * Read, transform, write. Every mutation in the JSON adapter goes through
 * here, which keeps the read-modify-write window as small as one function.
 *
 * @template T
 * @param {(state: PersonalOsState) => T} mutate returns what the caller needs
 * @returns {Promise<T>}
 */
export async function updateState(mutate) {
  const state = await readState();
  const result = mutate(state);
  await writeState(state);
  return result;
}

/**
 * Throws the working document away so the next read rebuilds it from seed.
 *
 * @returns {Promise<void>}
 */
export async function resetState() {
  await writeState(await readSeed());
}

/**
 * @param {string} contents
 * @param {string} source
 * @returns {PersonalOsState}
 */
function parse(contents, source) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(source + ' is not valid JSON: ' + reason);
  }
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
function isMissingFile(error) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    /** @type {{ code?: unknown }} */ (error).code === 'ENOENT'
  );
}
