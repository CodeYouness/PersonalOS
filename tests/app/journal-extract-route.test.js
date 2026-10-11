/**
 * /api/journal/[id]/extract with no model (#161): no key in the
 * environment, so extraction says so and does nothing. Kept apart from
 * journal-extract-route-model.test.js, since the environment is read once
 * at import.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }),
}));

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/journal/[id]/extract/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-journal-extract-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  delete process.env.ANTHROPIC_API_KEY;
  route = await import('@/app/api/journal/[id]/extract/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  mockCreate.mockReset();
});

describe('POST /api/journal/[id]/extract with no model', () => {
  it('says no model is configured, asks nothing and writes nothing', async () => {
    await store.getJournalEntries('2026-01-01', '2026-01-31');
    const before = await readFile(path.join(sandbox, 'personalos.json'), 'utf8');

    const response = await route.POST(
      new Request('http://localhost/api/journal/journal_seed_1/extract', { method: 'POST' }),
      { params: Promise.resolve({ id: 'journal_seed_1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: 'no-model' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await readFile(path.join(sandbox, 'personalos.json'), 'utf8')).toBe(before);
  });
});
