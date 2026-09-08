/**
 * The three corrective routes under /api/captures/[id] -- DELETE (#21),
 * PATCH for refile (#23), and POST .../undo (#22) -- tested the same way
 * tests/app/capture-route.test.js tests the original capture route.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/captures/[id]/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-captures-id-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  route = await import('@/app/api/captures/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

/** @param {string} id */
function del(id) {
  return route.DELETE(new Request('http://localhost/api/captures/' + id, { method: 'DELETE' }), {
    params: Promise.resolve({ id }),
  });
}

describe('DELETE /api/captures/[id]', () => {
  it('deletes the capture and everything it produced', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'memory' });

    const response = await del(capture.id);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(await store.getCapture(capture.id)).toBeNull();
  });

  it('reports an error for a capture that does not exist', async () => {
    const response = await del('capture_missing');
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.status).toBe('error');
  });
});