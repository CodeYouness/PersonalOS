/**
 * Runs the shared contract against the local-path adapter.
 *
 * DATA_DIR is pointed at a throwaway directory before the modules load, so a
 * test run can never touch the real personalos.json. lib/config/env.js reads
 * the environment once at import time, which is why the import is dynamic.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll } from 'vitest';

import { runAdapterContract } from './adapter-contract.js';

/** @type {string} */
let sandbox;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-store-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

runAdapterContract('json', async () => {
  const { jsonAdapter } = await import('@/lib/adapters/json/index.js');
  return jsonAdapter;
});
