/**
 * /api/journal/[id]/extract with a model (#161): the SDK is mocked and a
 * key is set before anything is imported, since the environment is read
 * once at import. Kept apart from journal-extract-route.test.js, which
 * relies on there being no model at all.
 */

import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
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

/** The seed's entry, and the memory already drawn from it. */
const ENTRY = 'journal_seed_1';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/app/api/journal/[id]/extract/route.js')} */
let route;
/** @type {typeof import('@/app/api/journal/route.js')} */
let dayRoute;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-journal-extract-model-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  // Three different models, so a call wired to the wrong one fails (ADR 0030).
  process.env.ANTHROPIC_MODEL_CLASSIFY = 'claude-test-classify';
  process.env.ANTHROPIC_MODEL_EXTRACT = 'claude-test-extract';
  process.env.ANTHROPIC_MODEL_ANSWER = 'claude-test-answer';
  route = await import('@/app/api/journal/[id]/extract/route.js');
  dayRoute = await import('@/app/api/journal/route.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL_CLASSIFY;
  delete process.env.ANTHROPIC_MODEL_EXTRACT;
  delete process.env.ANTHROPIC_MODEL_ANSWER;
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

/** @param {unknown[]} proposals what the model answers */
function modelProposes(proposals) {
  mockCreate.mockResolvedValueOnce({ content: [{ type: 'tool_use', input: { proposals } }] });
}

/** @param {string} id */
function extract(id) {
  return route.POST(new Request('http://localhost/api/journal/' + id + '/extract', { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

/** The working file, byte for byte: extraction must write nothing. */
async function workingFile() {
  return readFile(path.join(sandbox, 'personalos.json'), 'utf8');
}

describe('POST /api/journal/[id]/extract with a model', () => {
  it("returns the model's proposals, surest first, with the entry's updatedAt, and writes nothing", async () => {
    await store.getJournalEntries('2026-01-01', '2026-01-31');
    const before = await workingFile();
    modelProposes([
      { type: 'observation', content: 'Exercise in the evening clears a distracted afternoon.', confidence: 0.6 },
      { type: 'fact', content: 'Marta heard the two-phase price and did not object.', confidence: 0.9 },
    ]);

    const response = await extract(ENTRY);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      outcome: 'proposals',
      updatedAt: '2026-01-04T22:35:00.000Z',
      proposals: [
        { type: 'fact', content: 'Marta heard the two-phase price and did not object.', confidence: 0.9 },
        { type: 'observation', content: 'Exercise in the evening clears a distracted afternoon.', confidence: 0.6 },
      ],
    });
    expect(await workingFile()).toBe(before);
  });

  it('keeps the five surest of six', async () => {
    modelProposes(
      [0.5, 0.9, 0.1, 0.7, 0.3, 0.8].map((confidence, index) => ({
        type: 'fact',
        content: 'Proposal ' + index,
        confidence,
      }))
    );

    const { proposals } = await (await extract(ENTRY)).json();

    expect(proposals.map((/** @type {{ content: string }} */ proposal) => proposal.content)).toEqual([
      'Proposal 1',
      'Proposal 5',
      'Proposal 3',
      'Proposal 0',
      'Proposal 4',
    ]);
  });

  it('drops a type outside the memory types, empty content, and a repeat of what was remembered', async () => {
    modelProposes([
      { type: 'feeling', content: 'Tired in the afternoon.', confidence: 0.9 },
      { type: 'fact', content: '   ', confidence: 0.9 },
      { type: 'decision', content: 'going with two-phase pricing rather than a single fee.', confidence: 0.9 },
      { type: 'preference', content: '  Evening gym over morning gym.  ', confidence: 0.4 },
    ]);

    const { proposals } = await (await extract(ENTRY)).json();

    expect(proposals).toEqual([{ type: 'preference', content: 'Evening gym over morning gym.', confidence: 0.4 }]);
  });

  it('clamps a confidence outside 0..1, and reads a missing one as 0', async () => {
    modelProposes([
      { type: 'fact', content: 'Low.', confidence: -2 },
      { type: 'fact', content: 'High.', confidence: 7 },
      { type: 'fact', content: 'None.' },
    ]);

    const { proposals } = await (await extract(ENTRY)).json();

    expect(proposals).toEqual([
      { type: 'fact', content: 'High.', confidence: 1 },
      { type: 'fact', content: 'Low.', confidence: 0 },
      { type: 'fact', content: 'None.', confidence: 0 },
    ]);
  });

  it('answers nothing worth remembering as an empty list', async () => {
    modelProposes([]);

    expect(await (await extract(ENTRY)).json()).toMatchObject({ ok: true, outcome: 'proposals', proposals: [] });
  });

  it('asks the extract model, not the one for filing or answers', async () => {
    modelProposes([]);

    await extract(ENTRY);

    expect(mockCreate.mock.calls[0][0].model).toBe('claude-test-extract');
  });

  it('gives the model the entry and the memories already drawn from it', async () => {
    modelProposes([]);

    await extract(ENTRY);

    const [request] = mockCreate.mock.calls[0];
    expect(request.messages).toEqual([{ role: 'user', content: expect.stringContaining('Gym in the evening fixed it.') }]);
    expect(request.system).toContain('Going with two-phase pricing rather than a single fee.');
  });

  it('turns a model failure into the failed outcome, and writes nothing', async () => {
    await store.getJournalEntries('2026-01-01', '2026-01-31');
    const before = await workingFile();
    mockCreate.mockRejectedValueOnce(new Error('overloaded'));

    const response = await extract(ENTRY);

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ outcome: 'failed' });
    expect(await workingFile()).toBe(before);
  });

  it('answers 404 for an entry that does not exist, without asking the model', async () => {
    expect((await extract('journal_missing')).status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('GET /api/journal with a model', () => {
  it('reads a day without ever asking the model (rule 3)', async () => {
    const response = await dayRoute.GET(new Request('http://localhost/api/journal?date=2026-01-04'));

    expect(response.status).toBe(200);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
