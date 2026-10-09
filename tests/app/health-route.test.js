/**
 * /api/health -- the derived numbers it reports, against the seed in a
 * sandboxed store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/health/route.js')} */
let route;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-health-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/health/route.js');
  const store = await import('@/lib/store.js');
  await store.resetToSeed();
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('reports the seed net worth the seed snapshot records', async () => {
    // The seed snapshot's number, from before the sign of an observation
    // meant anything (#120): writing the car loan as the positive amount
    // owed must not change it.
    const body = await (await route.GET()).json();

    expect(body.status).toBe('ok');
    expect(body.derived.netWorthMinorUnits).toBe(8039000);
  });
});
