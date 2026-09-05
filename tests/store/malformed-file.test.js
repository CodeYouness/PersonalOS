/**
 * A truncated or hand-edited data/personalos.json must fail loudly, naming
 * itself and the missing part -- not surface as "cannot read properties of
 * undefined" three layers up, in a component that never touched the file.
 */

import { mkdtemp, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/adapters/json/file.js')} */
let fileAdapter;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-malformed-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  fileAdapter = await import('@/lib/adapters/json/file.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(fileAdapter.workingPath(), { force: true });
});

describe('a malformed working document', () => {
  it('names the file and the missing collection, instead of returning it as-is', async () => {
    const seed = JSON.parse(await readFile(path.join(sandbox, 'seed.json'), 'utf8'));
    delete seed.tasks;
    await writeFile(fileAdapter.workingPath(), JSON.stringify(seed), 'utf8');

    await expect(fileAdapter.readState()).rejects.toThrow(/tasks/);
    await expect(fileAdapter.readState()).rejects.toThrow(fileAdapter.workingPath());
  });

  it('refuses a document from a schema version newer than this code understands', async () => {
    const seed = JSON.parse(await readFile(path.join(sandbox, 'seed.json'), 'utf8'));
    seed.schemaVersion = 99;
    await writeFile(fileAdapter.workingPath(), JSON.stringify(seed), 'utf8');

    await expect(fileAdapter.readState()).rejects.toThrow(/schema version/i);
  });

  it('rejects a profile that is not an object, rather than passing it through', async () => {
    const seed = JSON.parse(await readFile(path.join(sandbox, 'seed.json'), 'utf8'));
    seed.profile = 'not an object';
    await writeFile(fileAdapter.workingPath(), JSON.stringify(seed), 'utf8');

    await expect(fileAdapter.readState()).rejects.toThrow(/profile/);
  });
});
