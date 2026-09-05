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
 *
 * Access is also serialised. Every mutation is a read-modify-write of the
 * whole document, so two of them overlapping in one process -- the capture
 * bar saving while a card refreshes -- would have the later read miss the
 * earlier write. They queue instead, reads included, because a read can write
 * too: it creates the document from the seed and it runs migrations. See
 * docs/decisions/0011.
 */

import { randomUUID } from 'node:crypto';
import { copyFile, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env.js';
import { CURRENT_SCHEMA_VERSION, assertKnownVersion, migrate, needsMigration } from './migrations.js';

/**
 * The shape of the whole document. It is the JSON adapter's business and
 * nobody else's: a database adapter has no single document, which is exactly
 * why this typedef lives here and not in lib/domain.
 *
 * @typedef {object} PersonalOsState
 * @property {number} schemaVersion
 * @property {import('../../domain/types.js').Profile} profile
 * @property {import('../../domain/types.js').Task[]} tasks
 * @property {import('../../domain/types.js').Person[]} people
 * @property {import('../../domain/types.js').Goal[]} goals
 * @property {import('../../domain/types.js').Link[]} links
 * @property {import('../../domain/types.js').Capture[]} captures
 * @property {import('../../domain/types.js').MemoryEntry[]} memory
 * @property {import('../../domain/types.js').JournalEntry[]} journal
 * @property {import('../../domain/types.js').Event[]} events
 * @property {Record<string, import('../../domain/types.js').DailyLog>} dailyLogs
 * @property {import('../../domain/types.js').FinanceAccount[]} accounts
 * @property {import('../../domain/types.js').FinanceObservation[]} observations
 * @property {import('../../domain/types.js').Transaction[]} transactions
 * @property {import('../../domain/types.js').NetWorthSnapshot[]} snapshots
 * @property {import('../../domain/types.js').SyncState[]} syncStates
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
  const seed = parse(await readFile(seedPath(), 'utf8'), seedPath());
  // The seed ships at the current version. If either of these throws, the
  // seed and the code have drifted apart and one of them is wrong.
  if (needsMigration(seed)) {
    throw new Error(
      'data/seed.json is at schema version ' +
        String(seed.schemaVersion ?? 1) +
        ' but the code expects ' +
        String(CURRENT_SCHEMA_VERSION) +
        '. The seed is versioned with the code and should never be behind it.'
    );
  }
  assertKnownVersion(seed, seedPath());
  assertShape(seed, seedPath());
  return seed;
}

/**
 * The working document, created from the seed the first time it is missing.
 *
 * @returns {Promise<PersonalOsState>}
 */
export async function readState() {
  return enqueue(loadState);
}

/**
 * The read itself, without the queue -- because it can write, and because
 * `updateState` calls it while already holding the queue.
 *
 * Creating the document from the seed and running a migration are both
 * writes, and a write that skipped the queue could land on top of a mutation
 * that had already been saved. On a fresh install that is one page load
 * racing one capture, which is exactly the loss this queue exists to stop.
 *
 * @returns {Promise<PersonalOsState>}
 */
async function loadState() {
  /** @type {PersonalOsState} */
  let state;
  try {
    state = parse(await readFile(workingPath(), 'utf8'), workingPath());
  } catch (error) {
    if (!isMissingFile(error)) throw error;
    const seed = await readSeed();
    await writeState(seed);
    return seed;
  }

  assertKnownVersion(state, workingPath());

  if (!needsMigration(state)) {
    assertShape(state, workingPath());
    return state;
  }

  // A copy of the old document is kept beside the new one before anything is
  // rewritten. Migrations are tested and idempotent, but this file is
  // somebody's life and a backup costs one syscall.
  const target = workingPath();
  await copyFile(target, target + '.v' + String(state.schemaVersion ?? 1) + '.backup');
  const migrated = migrate(state);
  assertShape(migrated, workingPath());
  await writeState(migrated);
  return migrated;
}

/**
 * @param {PersonalOsState} state
 * @returns {Promise<void>}
 */
export async function writeState(state) {
  const target = workingPath();
  // Unique per write, not per process. A name shared by two overlapping
  // writes means one of them renames a path the other has already moved away.
  // A counter would be unique only within one module instance; a uuid is
  // unique across every instance and every process.
  const temporary = target + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', 'utf8');
  try {
    await rename(temporary, target);
  } catch (error) {
    // Unique names mean a failed rename leaves a whole copy of the document
    // behind. Clearing it is best effort: the rename failure is what the
    // caller needs to see, and a failed cleanup must not replace it.
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

/**
 * The tail of the queue, held on globalThis rather than in a module variable.
 *
 * Next.js bundles server code more than once -- the rsc, ssr and route layers
 * each get their own instance of this module, and `next dev` replaces them on
 * every edit. A queue in a module variable would then be one queue per bundle,
 * which serialises nothing. A well-known symbol is the same object for all of
 * them.
 */
const TAIL = Symbol.for('personalos.adapters.json.writeQueue');

/** @type {{ [TAIL]?: Promise<unknown> }} */
const shared = /** @type {any} */ (globalThis);

/**
 * Runs `work` after everything already queued, and never before.
 *
 * This is a queue, not a lock: there is nothing to acquire, nothing to
 * release and nothing to time out, so no path through it can leave the
 * document locked. It serialises this process only -- a second process
 * writing the same file is out of scope, and is the day to move to a
 * database rather than to invent a lock file.
 *
 * @template T
 * @param {() => Promise<T>} work
 * @returns {Promise<T>}
 */
function enqueue(work) {
  const run = (shared[TAIL] ?? Promise.resolve()).then(work);
  // The queue must keep moving after a failed write, and a rejection nobody
  // handles is the caller's to see, not the next writer's.
  shared[TAIL] = run.then(
    () => undefined,
    () => undefined
  );
  return run;
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
  return enqueue(async () => {
    const state = await loadState();
    const result = mutate(state);
    await writeState(state);
    return result;
  });
}

/**
 * Throws the working document away so the next read rebuilds it from seed.
 *
 * The document being thrown away might be a real life, not a demo left over
 * from setup, so it is copied aside first -- the same aside-before-rewriting
 * principle the schema migration already applies. The name differs on
 * purpose: migration backs up once per schema version, but reset can run
 * any number of times, so each call gets its own name -- a second reset
 * must never overwrite the only copy of what the first one protected.
 *
 * @returns {Promise<string | null>} where the backup landed, or null when
 *   there was no working document yet to protect.
 */
export async function resetState() {
  return enqueue(async () => {
    const target = workingPath();
    const backupPath = target + '.reset-' + randomUUID() + '.backup';
    let madeBackup = true;

    try {
      await copyFile(target, backupPath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
      madeBackup = false;
    }

    await writeState(await readSeed());
    return madeBackup ? backupPath : null;
  });
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

/** Every array-shaped collection a current-version document must have. */
const REQUIRED_ARRAY_COLLECTIONS = /** @type {const} */ ([
  'tasks', 'people', 'goals', 'links', 'captures', 'memory', 'journal',
  'events', 'accounts', 'observations', 'transactions', 'snapshots', 'syncStates',
]);

/** Every object-shaped section a current-version document must have. */
const REQUIRED_OBJECT_SECTIONS = /** @type {const} */ (['profile', 'dailyLogs']);

/**
 * Shape, not contents: does this look like a personalos document at all, not
 * whether the tasks inside it are individually well formed. A document
 * missing a piece entirely -- truncated, hand-edited, from the wrong app --
 * fails here, naming the file and the missing part, rather than reaching a
 * card as `undefined` and failing there with no way back to the cause.
 *
 * Only meaningful against a document already at CURRENT_SCHEMA_VERSION:
 * migrate() is what turns an older shape into this one, so this runs after
 * migration, never before.
 *
 * @param {any} state
 * @param {string} source
 * @returns {void}
 */
function assertShape(state, source) {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    throw new Error(source + ' is not a personalos document: expected an object at the top level');
  }
  for (const key of REQUIRED_ARRAY_COLLECTIONS) {
    if (!Array.isArray(state[key])) {
      throw new Error(source + ' is missing its "' + key + '" collection (expected an array)');
    }
  }
  for (const key of REQUIRED_OBJECT_SECTIONS) {
    const value = state[key];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(source + ' is missing its "' + key + '" section (expected an object)');
    }
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
