/**
 * /api/questions with no model and a context over the size budget (#175):
 * nothing is asked, so nothing is refused -- no model wins over too large.
 * Kept apart from questions-route-budget.test.js, which sets a key: the
 * environment is read once at import.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/personalos.config.js', async (importOriginal) => {
  const original = /** @type {typeof import('@/personalos.config.js')} */ (await importOriginal());
  // One character: whatever the archive holds is over it, and nothing can be summarised enough.
  return { ...original, limits: { ...original.limits, contextMaxChars: 1, contextRecentMonths: 0 } };
});

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }),
}));

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/questions/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-questions-budget-nomodel-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  delete process.env.ANTHROPIC_API_KEY;
  route = await import('@/app/api/questions/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  mockCreate.mockReset();
});

describe('POST /api/questions with no model and too much data', () => {
  it('says there is no model, not that the data is too large: nothing was asked', async () => {
    const response = await route.POST(
      new Request('http://localhost/api/questions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: 'What does Marta prefer?' }),
      })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: 'no-model' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
