/**
 * The capture route and Refile with a model: the SDK is mocked and a key is
 * set before anything is imported, since the environment is read once at
 * import. Kept apart from capture-route.test.js, whose every test relies on
 * there being no model at all.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function MockAnthropic() {
    return { messages: { create: mockCreate } };
  }),
}));

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/capture/route.js')} */
let route;
/** @type {typeof import('@/app/api/captures/[id]/route.js')} */
let captureIdRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-capture-model-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  route = await import('@/app/api/capture/route.js');
  captureIdRoute = await import('@/app/api/captures/[id]/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  mockCreate.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {Record<string, unknown>} input what the model answers */
function modelSays(input) {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input }] });
}

/** @param {string} text */
async function post(text) {
  const response = await route.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  );
  return response.json();
}

describe('POST /api/capture with a model', () => {
  it('files an estimated meal with numbers, today, at the moment it was said', async () => {
    modelSays({ destination: 'nutrition', title: 'Carbonara', calories: 720, protein: 28, carbs: 82, fat: 30 });

    const body = await post('had a carbonara for lunch');

    expect(await store.getMeal(body.recordId)).toMatchObject({
      name: 'Carbonara', time: '12:00', calories: 720, protein: 28, carbs: 82, fat: 30, estimated: true,
    });
    expect((await store.getDailyLog('2026-09-24')).meals).toHaveLength(1);
  });

  it('files "last night" on yesterday, with no time rather than an invented one', async () => {
    modelSays({ destination: 'nutrition', title: 'Pizza', calories: 900, protein: 35, carbs: 110, fat: 32, date: '2026-09-23' });

    const body = await post('last night I had pizza');

    expect((await store.getDailyLog('2026-09-23')).meals).toEqual([
      expect.objectContaining({ id: body.recordId, name: 'Pizza', time: null }),
    ]);
  });

  it('keeps a time the sentence said', async () => {
    modelSays({ destination: 'nutrition', title: 'Porridge', calories: 380, protein: 12, carbs: 62, fat: 9, time: '08:30' });

    const body = await post('porridge at half past eight');

    expect((await store.getMeal(body.recordId))?.time).toBe('08:30');
  });

  it('stores a number out of range as unknown, and keeps the others', async () => {
    modelSays({ destination: 'nutrition', title: 'Pizza', calories: 90000, protein: 35, carbs: 110, fat: 32 });

    const body = await post('had a pizza');

    expect(await store.getMeal(body.recordId)).toMatchObject({ calories: null, protein: 35, estimated: true });
  });
});

describe('Refile into nutrition with a model', () => {
  it('files an estimated meal', async () => {
    const capture = await store.createCapture({ text: 'had a carbonara for lunch', destination: 'memory' });
    modelSays({ destination: 'nutrition', title: 'Carbonara', calories: 720, protein: 28, carbs: 82, fat: 30 });

    const response = await captureIdRoute.PATCH(
      new Request('http://localhost/api/captures/' + capture.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination: 'nutrition' }),
      }),
      { params: Promise.resolve({ id: capture.id }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(await store.getMeal(body.recordId)).toMatchObject({ name: 'Carbonara', calories: 720, estimated: true });
  });
});
