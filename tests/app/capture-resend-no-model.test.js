/**
 * A resent capture is answered without a model call (ADR 0033): the
 * (origin, clientId) pair is looked up before the classifier runs. The SDK is
 * mocked and a key is set, so a stray call is counted.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
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
/** @type {typeof import('@/app/api/capture/route.js')} */
let route;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-resend-model-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  route = await import('@/app/api/capture/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  mockCreate.mockReset();
});

/** @param {Record<string, unknown>} extra */
function post(extra) {
  return route.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'call Marta', origin: 'shortcut', clientId: 'resend-m', ...extra }),
    })
  );
}

describe('POST /api/capture resend', () => {
  it('makes no model call for a repeat, and answers the first receipt', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', input: { destination: 'task', title: 'Call Marta' } }],
    });
    const first = await (await post({})).json();
    expect(mockCreate).toHaveBeenCalledTimes(1);

    const again = await post({});

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(await again.json()).toEqual(first);
  });
});
