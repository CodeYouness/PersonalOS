/**
 * The lock that keeps `npm run serve` the one writer of the real data
 * (ADR 0032, on top of ADR 0011's in-process queue).
 *
 * A small JSON file next to the data holds the pid of the process that owns
 * it. A lock whose owner is gone is stale and is taken over, so a crash never
 * locks anyone out. Plain Node, relative imports only: scripts use it.
 */

import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * @typedef {{ pid: number, startedAt: string }} LockHolder
 * @typedef {{ pid?: number, isAlive?: (pid: number) => boolean }} LockOptions
 * @typedef {{ acquired: true, release: () => Promise<void> } | { acquired: false, holder: LockHolder }} LockResult
 */

/** Where the lock lives for a data directory. */
export const lockPathFor = (/** @type {string} */ dataDir) => path.join(dataDir, 'serve.lock');

/**
 * Whether a process exists. Signal 0 only checks; EPERM means it exists but
 * belongs to someone else.
 *
 * @param {number} pid
 */
export function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
  }
}

/**
 * @param {string} file
 * @returns {Promise<LockHolder | null>} null when missing or unreadable
 */
async function readHolder(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return Number.isInteger(parsed?.pid) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The live holder of the lock, or null when it is free or stale.
 *
 * @param {string} file
 * @param {{ isAlive?: (pid: number) => boolean }} [options]
 * @returns {Promise<LockHolder | null>}
 */
export async function checkLock(file, { isAlive = processIsAlive } = {}) {
  const holder = await readHolder(file);
  return holder !== null && isAlive(holder.pid) ? holder : null;
}

/**
 * Creates the lock file only if none exists. The content is written to a
 * private file first and hard-linked into place, so the lock is created
 * atomically *and* complete: a reader never meets it half-written and takes
 * it for corrupt. Of any number of racers, exactly one link succeeds.
 *
 * @param {string} file
 * @param {string} content
 * @returns {Promise<boolean>} whether this call created it
 */
async function createExclusive(file, content) {
  const mine = file + '.' + process.pid + '.' + randomUUID();
  await writeFile(mine, content);
  try {
    await link(mine, file);
    return true;
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'EEXIST') return false;
    throw error;
  } finally {
    await rm(mine, { force: true });
  }
}

/** A takeover guard older than this was left by a process that died holding it. */
const GUARD_STALE_MS = 10_000;
const GUARD_WAIT_MS = 20;
const MAX_ATTEMPTS = 100;

/**
 * Takes the lock unless a live process holds it.
 *
 * Creating it is exclusive. Taking over a stale one is serialised behind a
 * short-lived guard directory, so two starts that both find the same dead
 * holder cannot both remove-and-create: the second re-reads under the guard,
 * finds the first one's live lock and is refused.
 *
 * @param {string} file
 * @param {LockOptions} [options]
 * @returns {Promise<LockResult>}
 */
export async function acquireLock(file, { pid = process.pid, isAlive = processIsAlive } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const content = JSON.stringify({ pid, startedAt: new Date().toISOString() });
  const guard = file + '.takeover';
  const acquired = {
    acquired: /** @type {const} */ (true),
    // Only the owner removes it: a stale release must not free a lock taken since.
    release: async () => {
      if ((await readHolder(file))?.pid === pid) await rm(file, { force: true });
    },
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    if (await createExclusive(file, content)) return acquired;

    const holder = await checkLock(file, { isAlive });
    if (holder !== null) return { acquired: false, holder };

    // The lock exists but its holder is gone (or it is unreadable): stale.
    let guarded = false;
    try {
      await mkdir(guard);
      guarded = true;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error;
    }
    if (!guarded) {
      const age = await stat(guard).then((info) => Date.now() - info.mtimeMs, () => 0);
      if (age > GUARD_STALE_MS) await rm(guard, { recursive: true, force: true });
      else await new Promise((resolve) => setTimeout(resolve, GUARD_WAIT_MS));
      continue;
    }
    try {
      const again = await checkLock(file, { isAlive });
      if (again !== null) return { acquired: false, holder: again };
      await rm(file, { force: true });
      if (await createExclusive(file, content)) return acquired;
    } finally {
      await rm(guard, { recursive: true, force: true });
    }
  }
  throw new Error('could not take the writer lock at ' + file);
}
