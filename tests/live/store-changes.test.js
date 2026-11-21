/**
 * Live updates (#293): the store announces a change after each successful
 * write, and only then. The signal carries no data.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-changes-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
  await store.resetToSeed();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('onStoreChange', () => {
  it('signals once for one write, with no argument', async () => {
    const calls = /** @type {unknown[][]} */ ([]);
    const stop = store.onStoreChange((...args) => calls.push(args));

    await store.updateProfile({ name: 'A made-up name' });
    stop();

    expect(calls).toEqual([[]]);
  });

  it('signals nothing for a read', async () => {
    let signals = 0;
    const stop = store.onStoreChange(() => signals++);

    await store.getTasks();
    await store.getCaptures();
    stop();

    expect(signals).toBe(0);
  });

  it('signals nothing for a write that failed', async () => {
    let signals = 0;
    const stop = store.onStoreChange(() => signals++);
    const { updateState } = await import('@/lib/adapters/json/file.js');

    await expect(
      updateState(() => {
        throw new Error('refused');
      })
    ).rejects.toThrow('refused');
    stop();

    expect(signals).toBe(0);
  });

  it('stops signalling a listener that unsubscribed', async () => {
    let signals = 0;
    const stop = store.onStoreChange(() => signals++);
    stop();

    await store.updateProfile({ name: 'Another made-up name' });

    expect(signals).toBe(0);
  });
});
