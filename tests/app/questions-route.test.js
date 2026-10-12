/**
 * /api/questions with no model (#172, ADR 0028): no key in the environment,
 * so a question says so and nothing answers it -- no rule-based fallback.
 * Kept apart from questions-route-model.test.js, since the environment is
 * read once at import.
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
/** @type {typeof import('@/app/api/questions/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-questions-'));
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

/** @param {unknown} body */
function post(body) {
  return route.POST(
    new Request('http://localhost/api/questions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/questions with no model', () => {
  it('says no model is configured, asks nothing and writes nothing', async () => {
    await store.getTasks();
    const before = await readFile(path.join(sandbox, 'personalos.json'), 'utf8');

    const response = await post({ question: 'What does Marta prefer?' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, outcome: 'no-model' });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await readFile(path.join(sandbox, 'personalos.json'), 'utf8')).toBe(before);
  });

  it('still refuses an empty question as a 400', async () => {
    const response = await post({ question: '   ' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ status: 'error' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
