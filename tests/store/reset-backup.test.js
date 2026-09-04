/**
 * The safety net around `npm run data:reset`.
 *
 * Resetting throws the working document away and rebuilds it from the seed.
 * Until now that had no backup: a real document and the demo seed became
 * indistinguishable the moment you ran it once, which is how a real user
 * lost real data. This is the regression test for that gap.
 */

import { mkdtemp, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/adapters/json/file.js')} */
let fileAdapter;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-reset-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  fileAdapter = await import('@/lib/adapters/json/file.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await fileAdapter.resetState();
});

describe('resetState backup', () => {
  it('backs up a real working document before overwriting it with the seed', async () => {
    await fileAdapter.updateState((state) => {
      state.profile.focus = 'Something distinctly not seed data';
    });

    const backupPath = await fileAdapter.resetState();

    expect(backupPath).not.toBeNull();
    const backedUp = JSON.parse(await readFile(/** @type {string} */ (backupPath), 'utf8'));
    expect(backedUp.profile.focus).toBe('Something distinctly not seed data');

    const restored = JSON.parse(await readFile(fileAdapter.workingPath(), 'utf8'));
    expect(restored.profile.focus).not.toBe('Something distinctly not seed data');
  });

  it('keeps a separate backup for each reset, so a second run cannot erase the first', async () => {
    await fileAdapter.updateState((state) => {
      state.profile.focus = 'First';
    });
    const firstBackup = await fileAdapter.resetState();

    await fileAdapter.updateState((state) => {
      state.profile.focus = 'Second';
    });
    const secondBackup = await fileAdapter.resetState();

    expect(firstBackup).not.toBe(secondBackup);
    const first = JSON.parse(await readFile(/** @type {string} */ (firstBackup), 'utf8'));
    expect(first.profile.focus).toBe('First');
  });

  it('does not attempt a backup when there is no working file yet', async () => {
    await rm(fileAdapter.workingPath(), { force: true });

    const backupPath = await fileAdapter.resetState();

    expect(backupPath).toBeNull();
  });
});
