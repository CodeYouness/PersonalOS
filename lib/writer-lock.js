/**
 * The lock that keeps `npm run serve` the one writer of the real data
 * (ADR 0032, on top of ADR 0011's in-process queue).
 *
 * A small JSON file next to the data holds the pid of the process that owns
 * it. A lock whose owner is gone is stale and is taken over, so a crash never
 * locks anyone out. Plain Node, relative imports only: scripts use it.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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
 * Takes the lock unless a live process holds it.
 *
 * @param {string} file
 * @param {LockOptions} [options]
 * @returns {Promise<LockResult>}
 */
export async function acquireLock(file, { pid = process.pid, isAlive = processIsAlive } = {}) {
  const holder = await checkLock(file, { isAlive });
  if (holder !== null) return { acquired: false, holder };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ pid, startedAt: new Date().toISOString() }));
  return {
    acquired: true,
    // Only the owner removes it: a stale release must not free a lock taken since.
    release: async () => {
      if ((await readHolder(file))?.pid === pid) await rm(file, { force: true });
    },
  };
}
