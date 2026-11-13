/**
 * The sentence is saved before any tier runs (ADR 0037, rule 2): the capture
 * route writes the capture -- its words, origin and time -- before the
 * classifier is called, so a model that hangs, a classifier that throws, a
 * store that refuses the filing or a process that dies mid-request cannot
 * lose it. The SDK is mocked and a key is set, so the model path runs and a
 * stray call is counted.
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

const TOKEN = 'a-made-up-token-for-tests';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/capture/route.js')} */
let route;
/** @type {typeof import('@/app/api/captures/route.js')} */
let logRoute;
/** @type {typeof import('@/app/api/captures/[id]/route.js')} */
let captureIdRoute;
/** @type {typeof import('@/app/api/captures/[id]/undo/route.js')} */
let undoRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/classify.js')} */
let classifier;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-saved-first-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.PERSONALOS_PHONE_TOKEN = TOKEN;
  route = await import('@/app/api/capture/route.js');
  logRoute = await import('@/app/api/captures/route.js');
  captureIdRoute = await import('@/app/api/captures/[id]/route.js');
  undoRoute = await import('@/app/api/captures/[id]/undo/route.js');
  store = await import('@/lib/store.js');
  classifier = await import('@/lib/classify.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.PERSONALOS_PHONE_TOKEN;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  mockCreate.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** @param {Record<string, unknown>} input what the model answers */
function reply(input) {
  return { content: [{ type: 'tool_use', input }] };
}

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, string>} [headers]
 */
function post(body, headers = {}) {
  return route.POST(
    new Request('http://localhost/api/capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  );
}

/** @param {string} text */
async function captureOf(text) {
  return (await store.getCaptures()).find((capture) => capture.text === text) ?? null;
}

/** Resolves once the mocked model has been asked. */
function modelAsked() {
  return vi.waitFor(() => expect(mockCreate).toHaveBeenCalled());
}

describe('POST /api/capture saves the sentence before the classifier runs', () => {
  it('has written the capture, word for word, by the time the model is asked', async () => {
    /** @type {import('@/lib/domain/types.js').Capture | null | undefined} */
    let seenByTheModel;
    mockCreate.mockImplementation(async () => {
      seenByTheModel = await captureOf('Chiama Marta per il preventivo');
      return reply({ destination: 'task', title: 'Call Marta' });
    });

    // Trimmed at the boundary as before; otherwise exactly what arrived.
    const body = await (await post({ text: '  Chiama Marta per il preventivo ' })).json();

    expect(seenByTheModel).toMatchObject({ text: 'Chiama Marta per il preventivo', origin: 'bar', route: 'unclassified' });
    const saved = await captureOf('Chiama Marta per il preventivo');
    expect(saved).toMatchObject({ origin: 'bar', destination: 'task', route: 'model' });
    expect(body).toMatchObject({ destination: 'task', route: 'model' });
    expect(await store.getTask(body.recordId)).toMatchObject({ title: 'Call Marta' });
  });

  it('keeps the sentence while a model never answers -- a hang, a timeout, a process that dies', async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}));

    // Not awaited: the request is stuck on the model, as it would be when the
    // process is killed mid-call.
    void post({ text: 'remember the boiler code is 4412' });
    await modelAsked();

    const saved = await captureOf('remember the boiler code is 4412');
    expect(saved).toMatchObject({ origin: 'bar', route: 'unclassified' });
    expect(saved?.saidAt).toEqual(expect.any(String));
  });

  it('keeps the sentence, answers 200 and says it is unclassified when the classifier throws', async () => {
    vi.spyOn(classifier, 'classify').mockRejectedValueOnce(new Error('a bug in the classifier'));

    const response = await post({ text: 'the classifier blew up on this one' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ route: 'unclassified', recordId: null });
    expect(body.receiptLine).toContain('not filed');
    const saved = await captureOf('the classifier blew up on this one');
    expect(saved).toMatchObject({ route: 'unclassified', destination: 'memory' });
    // Kept as nothing but a memory, which is the floor rule 2 sets.
    const memory = (await store.getMemoryEntries()).find((entry) => entry.content === saved?.text);
    expect(memory).toBeTruthy();
    // Nothing claims it was filed.
    const events = await store.getEvents({});
    expect(events.some((event) => event.type === 'capture.filed' && event.subject === saved?.id)).toBe(false);
  });

  it('keeps the destination chosen up front on a sentence it could not classify', async () => {
    vi.spyOn(classifier, 'classify').mockRejectedValueOnce(new Error('a bug in the classifier'));

    const body = await (await post({ text: 'pasta al pomodoro', destination: 'nutrition' })).json();

    expect(body).toMatchObject({ destination: 'nutrition', route: 'unclassified', recordId: null });
    expect(await captureOf('pasta al pomodoro')).toMatchObject({ destination: 'nutrition', route: 'unclassified' });
  });

  it('files nothing on a capture the store refused to mark as classified, and keeps it unclassified', async () => {
    mockCreate.mockResolvedValueOnce(reply({ destination: 'task', title: 'Call the plumber' }));
    vi.spyOn(store, 'updateCapture').mockRejectedValueOnce(new Error('disk full'));
    const tasksBefore = (await store.getTasks()).length;

    const response = await post({ text: 'call the plumber' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ route: 'unclassified', recordId: null });
    expect(await captureOf('call the plumber')).toMatchObject({ route: 'unclassified' });
    // A task linked from a capture that says `memory` would be read as the wrong kind of record.
    expect(await store.getTasks()).toHaveLength(tasksBefore);
  });

  it('keeps the classified capture when filing its record is refused', async () => {
    mockCreate.mockResolvedValueOnce(reply({ destination: 'task', title: 'Call the plumber' }));
    vi.spyOn(store, 'fileCaptureAsTask').mockRejectedValueOnce(new Error('disk full'));

    const response = await post({ text: 'call the plumber' });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ destination: 'task', route: 'model', recordId: null });
    expect(await captureOf('call the plumber')).toMatchObject({ destination: 'task', route: 'model' });
  });

  it.each([
    ['an API error', () => mockCreate.mockRejectedValueOnce(new Error('overloaded'))],
    ['a reply cut off at max_tokens', () => mockCreate.mockResolvedValueOnce({ ...reply({ destination: 'task' }), stop_reason: 'max_tokens' })],
    ['junk output', () => mockCreate.mockResolvedValueOnce(reply({ destination: 'shopping' }))],
  ])('files by the rules, once, after %s', async (_label, arrange) => {
    arrange();

    const body = await (await post({ text: 'call the plumber' })).json();

    expect(body).toMatchObject({ destination: 'task', route: 'rules' });
    expect((await store.getCaptures()).filter((capture) => capture.text === 'call the plumber')).toEqual([
      expect.objectContaining({ destination: 'task', route: 'rules' }),
    ]);
  });
});

describe('the phone path, saved first', () => {
  const PHONE = { 'x-forwarded-for': '100.64.0.7', authorization: 'Bearer ' + TOKEN };

  it('saves a queued sentence with its origin, clientId and the time it was said before the model is asked', async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}));

    void post({ text: 'buy milk', origin: 'shortcut', clientId: 'saved-first-1', saidAt: '2026-11-12T07:30:00Z' }, PHONE);
    await modelAsked();

    expect(await captureOf('buy milk')).toMatchObject({
      origin: 'shortcut',
      clientId: 'saved-first-1',
      saidAt: '2026-11-12T07:30:00.000Z',
      route: 'unclassified',
    });
  });

  it('answers a resend that arrives while the first is still being classified, without a second model call', async () => {
    mockCreate.mockImplementation(() => new Promise(() => {}));
    const sentence = { text: 'buy oat milk', origin: 'shortcut', clientId: 'saved-first-2' };

    void post(sentence, PHONE);
    await modelAsked();
    const again = await post(sentence, PHONE);

    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ route: 'unclassified', recordId: null });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect((await store.getCaptures()).filter((capture) => capture.clientId === 'saved-first-2')).toHaveLength(1);
  });

  it('still refuses a proxied capture without the token, and writes nothing', async () => {
    const before = (await store.getCaptures()).length;

    const response = await post({ text: 'buy milk', origin: 'shortcut' }, { 'x-forwarded-for': '100.64.0.7' });

    expect(response.status).toBe(401);
    expect(await store.getCaptures()).toHaveLength(before);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('correcting a capture filed saved-first', () => {
  /** @param {string} id */
  const params = (id) => ({ params: Promise.resolve({ id }) });

  it('Undo removes the record it was filed as and keeps the sentence', async () => {
    mockCreate.mockResolvedValueOnce(reply({ destination: 'task', title: 'Call the plumber' }));
    const body = await (await post({ text: 'call the plumber' })).json();
    const capture = await captureOf('call the plumber');

    const response = await undoRoute.POST(new Request('http://localhost'), params(/** @type {string} */ (capture?.id)));

    expect(response.status).toBe(200);
    expect(await store.getTask(body.recordId)).toBeNull();
    expect(await captureOf('call the plumber')).not.toBeNull();
  });

  it('Delete removes the capture and the record it was filed as', async () => {
    mockCreate.mockResolvedValueOnce(reply({ destination: 'task', title: 'Call the plumber' }));
    const body = await (await post({ text: 'call the plumber' })).json();
    const capture = await captureOf('call the plumber');

    await captureIdRoute.DELETE(new Request('http://localhost'), params(/** @type {string} */ (capture?.id)));

    expect(await store.getTask(body.recordId)).toBeNull();
    expect(await captureOf('call the plumber')).toBeNull();
  });

  it('Refile files an unclassified capture by hand, and its route stays unclassified', async () => {
    vi.spyOn(classifier, 'classify').mockRejectedValueOnce(new Error('a bug in the classifier'));
    await post({ text: 'call the plumber' });
    const capture = /** @type {import('@/lib/domain/types.js').Capture} */ (await captureOf('call the plumber'));

    const response = await captureIdRoute.PATCH(
      new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ destination: 'task' }) }),
      params(capture.id)
    );
    const { recordId } = await response.json();

    expect(await store.getTask(recordId)).toMatchObject({ title: 'call the plumber' });
    expect(await captureOf('call the plumber')).toMatchObject({ destination: 'task', route: 'unclassified' });
  });
});

describe('the capture log shows an unclassified capture, and reads no model', () => {
  it('lists it as unclassified, with nothing produced, and Refile is open to it', async () => {
    const stuck = await store.createCapture({ text: 'the one the model never answered', route: 'unclassified' });

    const response = await logRoute.GET(new Request('http://localhost/api/captures'));
    const rows = (await response.json()).captures;

    expect(rows[0]).toMatchObject({ id: stuck.id, route: 'unclassified', destination: 'memory', produced: null, locked: false });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('the route a capture records', () => {
  it('is written once: a classified capture refuses another', async () => {
    const capture = await store.createCapture({ text: 'call the plumber', destination: 'task', route: 'model' });

    await expect(store.updateCapture(capture.id, { route: 'rules' })).rejects.toThrow(/route/);
  });

  it('is never set back to unclassified', async () => {
    const capture = await store.createCapture({ text: 'call the plumber', route: 'unclassified' });

    await expect(store.updateCapture(capture.id, { route: 'unclassified' })).rejects.toThrow(/route/);
  });
});
