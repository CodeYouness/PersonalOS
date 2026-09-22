/**
 * A capture filed as `people`. Only the model ever answers `people` -- the
 * rules have no keyword for it -- so this file configures a key and mocks
 * the SDK, the one boundary the capture path crosses, and otherwise runs
 * the real capture and correction routes against a sandboxed store.
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
let captureRoute;
/** @type {typeof import('@/app/api/captures/[id]/route.js')} */
let captureIdRoute;
/** @type {typeof import('@/app/api/captures/[id]/undo/route.js')} */
let undoRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-capture-people-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  captureRoute = await import('@/app/api/capture/route.js');
  captureIdRoute = await import('@/app/api/captures/[id]/route.js');
  undoRoute = await import('@/app/api/captures/[id]/undo/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  mockCreate.mockReset();
  await store.resetToSeed();
});

/**
 * @param {string} text
 * @param {object} modelAnswer what the model's tool call returns
 */
async function capture(text, modelAnswer) {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: modelAnswer }] });
  const response = await captureRoute.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  );
  return response.json();
}

/** @param {string} text */
async function captureNamed(text) {
  return (await store.getCaptures()).find((entry) => entry.text === text);
}

describe('a capture filed as people', () => {
  it('files a task, with the model’s title, linked to the person it names', async () => {
    const text = 'Marta is waiting for the revised quote';
    const body = await capture(text, { destination: 'people', title: 'Send Marta the revised quote' });

    expect(body.destination).toBe('people');
    const task = await store.getTask(body.recordId);
    expect(task?.title).toBe('Send Marta the revised quote');
    expect(task?.source).toBe('capture');

    const filed = await captureNamed(text);
    const about = await store.getLinks({ from: filed?.id, rel: 'about' });
    expect(about.map((link) => link.to)).toEqual([body.recordId]);

    const involves = await store.getLinks({ from: body.recordId, rel: 'involves' });
    expect(involves.map((link) => link.to)).toEqual(['person_seed_1']);
  });

  it('files the task with no person when the name is ambiguous or unknown', async () => {
    await store.createPerson({ name: 'Marta Rossi' });
    const peopleBefore = (await store.getPeople()).length;

    const ambiguous = await capture('Marta is waiting for the quote', { destination: 'people' });
    const unknown = await capture('Federico is waiting for the quote', { destination: 'people' });

    for (const body of [ambiguous, unknown]) {
      expect(await store.getTask(body.recordId)).not.toBeNull();
      expect(await store.getLinks({ from: body.recordId, rel: 'involves' })).toHaveLength(0);
    }
    expect(await store.getPeople()).toHaveLength(peopleBefore);
  });

  it('can be undone: the task and its links go, the capture and its memory stay', async () => {
    const text = 'Tom is waiting for the syllabus';
    const body = await capture(text, { destination: 'people' });
    const filed = await captureNamed(text);
    if (!filed) throw new Error('capture not written');

    const response = await undoRoute.POST(
      new Request('http://localhost/api/captures/' + filed.id + '/undo', { method: 'POST' }),
      { params: Promise.resolve({ id: filed.id }) }
    );

    expect(response.status).toBe(200);
    expect(await store.getTask(body.recordId)).toBeNull();
    expect(await store.getLinks({ from: body.recordId })).toHaveLength(0);
    expect(await store.getLinks({ from: filed.id, rel: 'about' })).toHaveLength(0);
    expect(await store.getCapture(filed.id)).not.toBeNull();
    const memory = (await store.getMemoryEntries()).find((entry) => entry.content === text);
    expect(memory).toBeTruthy();
  });

  it('refiled from people elsewhere, takes its task and person link with it', async () => {
    const text = 'Tom is waiting for the budget';
    const body = await capture(text, { destination: 'people' });
    const filed = await captureNamed(text);
    if (!filed) throw new Error('capture not written');

    const response = await captureIdRoute.PATCH(
      new Request('http://localhost/api/captures/' + filed.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination: 'memory' }),
      }),
      { params: Promise.resolve({ id: filed.id }) }
    );

    expect(response.status).toBe(200);
    expect(await store.getTask(body.recordId)).toBeNull();
    expect(await store.getLinks({ from: body.recordId })).toHaveLength(0);
    expect((await store.getCapture(filed.id))?.destination).toBe('memory');
  });

  it('refiled into people from elsewhere, files a task linked to the person', async () => {
    const text = 'Tom mentioned the Helix budget';
    await capture(text, { destination: 'memory' });
    const filed = await captureNamed(text);
    if (!filed) throw new Error('capture not written');

    const response = await captureIdRoute.PATCH(
      new Request('http://localhost/api/captures/' + filed.id, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ destination: 'people' }),
      }),
      { params: Promise.resolve({ id: filed.id }) }
    );
    const { recordId } = await response.json();

    expect(response.status).toBe(200);
    expect((await store.getTask(recordId))?.title).toBe(text);
    const involves = await store.getLinks({ from: recordId, rel: 'involves' });
    expect(involves.map((link) => link.to)).toEqual(['person_seed_2']);
  });
});
