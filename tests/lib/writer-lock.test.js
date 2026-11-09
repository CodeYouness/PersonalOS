/**
 * The lock that keeps `npm run serve` the one writer (ADR 0032): taken when
 * free, refused while its holder lives, taken over when its holder is gone,
 * released on a clean stop.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { acquireLock, checkLock } from '@/lib/writer-lock.js';

/** @type {string} */
let dir;
/** @type {string} */
let file;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'personalos-lock-test-'));
  file = path.join(dir, 'serve.lock');
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const alive = () => true;
const gone = () => false;

describe('the writer lock', () => {
  it('is taken when free, and names its holder in the file', async () => {
    const result = await acquireLock(file, { pid: 4242, isAlive: alive });
    expect(result.acquired).toBe(true);
    expect(JSON.parse(await readFile(file, 'utf8')).pid).toBe(4242);
  });

  it('is refused while its holder lives, naming the holder', async () => {
    await acquireLock(file, { pid: 4242, isAlive: alive });
    const result = await acquireLock(file, { pid: 99, isAlive: alive });
    expect(result).toEqual({ acquired: false, holder: expect.objectContaining({ pid: 4242 }) });
  });

  it('is taken over when its holder is gone', async () => {
    await acquireLock(file, { pid: 4242, isAlive: alive });
    const result = await acquireLock(file, { pid: 99, isAlive: gone });
    expect(result.acquired).toBe(true);
    expect(JSON.parse(await readFile(file, 'utf8')).pid).toBe(99);
  });

  it('is released on a clean stop, and only by its own holder', async () => {
    const first = await acquireLock(file, { pid: 4242, isAlive: alive });
    if (!first.acquired) throw new Error('expected the lock');
    await first.release();
    expect(await checkLock(file, { isAlive: alive })).toBeNull();
    // A stale release must not remove a lock someone else has since taken.
    const second = await acquireLock(file, { pid: 99, isAlive: alive });
    await first.release();
    expect(await checkLock(file, { isAlive: alive })).toEqual(expect.objectContaining({ pid: 99 }));
    expect(second.acquired).toBe(true);
  });

  it('checkLock reports a live holder, and nothing for a stale or missing lock', async () => {
    expect(await checkLock(file, { isAlive: alive })).toBeNull();
    await acquireLock(file, { pid: 4242, isAlive: alive });
    expect(await checkLock(file, { isAlive: alive })).toEqual(expect.objectContaining({ pid: 4242 }));
    expect(await checkLock(file, { isAlive: gone })).toBeNull();
  });

  it('treats an unreadable lock file as stale', async () => {
    await writeFile(file, 'not json');
    expect((await acquireLock(file, { pid: 7, isAlive: alive })).acquired).toBe(true);
  });
});
