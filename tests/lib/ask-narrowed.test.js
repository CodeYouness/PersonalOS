/**
 * A question over an archive too large to send whole (ADR 0070): the small
 * model chooses which parts and months the question needs, and the question
 * is asked over those instead of being refused. An archive that fits is
 * asked whole, with one call, as before. The model is stubbed at the
 * provider seam; the store is the seed in a throwaway DATA_DIR.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/provider.js', () => ({ callTool }));

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const QUESTION = 'what is due tomorrow?';
const LIFE = { parts: ['life'], months: { from: '2026-07', to: '2026-09' } };

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/answer.js')} */
let answer;
/** @type {typeof import('@/lib/ai/context/index.js')} */
let contexts;
/** A budget the whole seed does not fit and its life part does. */
let tight = 0;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-ask-narrowed-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_MODEL_CLASSIFY = 'claude-test-classify';
  process.env.ANTHROPIC_MODEL_ANSWER = 'claude-test-answer';
  store = await import('@/lib/store.js');
  contexts = await import('@/lib/ai/context/index.js');
  answer = await import('@/lib/answer.js');
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL_CLASSIFY;
  delete process.env.ANTHROPIC_MODEL_ANSWER;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  callTool.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  const whole = contexts.serializeContext(await contexts.buildContext('question')).length;
  const life = contexts.serializeContext(await contexts.buildContext('question', { read: LIFE })).length;
  tight = life + 2000;
  expect(tight).toBeLessThan(whole);
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {unknown} input what the model answers with */
function modelSays(input) {
  callTool.mockResolvedValueOnce({ input, stopReason: 'tool_use', usage: null });
}

/** The context block of the nth call, parsed. @param {number} call */
function contextSent(call) {
  const text = callTool.mock.calls[call][0].messages[0].content[1].text;
  return JSON.parse(text.slice(text.indexOf('<context>\n') + 10, text.lastIndexOf('\n</context>')));
}

describe('a question over an archive that fits', () => {
  it('is asked whole, with one call, and says nothing of parts', async () => {
    modelSays({ statements: [], notInData: true });

    const result = await answer.ask(QUESTION);

    expect(result).toEqual({ outcome: 'not-in-data', summarised: null, read: null });
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].model).toBe('claude-test-answer');
    expect(contextSent(0)).not.toHaveProperty('read');
  });
});

describe('a question over an archive too large to send whole', () => {
  it('asks the small model which parts it needs, then asks the question over those', async () => {
    modelSays({ parts: ['life'] });
    modelSays({ statements: [{ text: 'One thing.', citations: ['task_seed_1'] }], notInData: false });

    const result = await answer.ask(QUESTION, { maxChars: tight });

    expect(callTool).toHaveBeenCalledTimes(2);
    const [choosing, asking] = callTool.mock.calls.map(([request]) => request);
    // The choice is made from the question alone: none of the data goes with it.
    expect(choosing.model).toBe('claude-test-classify');
    expect(JSON.stringify(choosing.messages)).toContain(QUESTION);
    expect(JSON.stringify(choosing)).not.toContain('task_seed_1');
    expect(asking.model).toBe('claude-test-answer');

    const sent = contextSent(1);
    expect(sent.read).toEqual(LIFE);
    const types = new Set(sent.items.map((/** @type {any} */ item) => item.type));
    expect(types.has('task')).toBe(true);
    expect(types.has('transaction')).toBe(false);
    expect(types.has('account')).toBe(false);
    // The model is told that what it was not sent is unknown, not absent.
    expect(asking.messages[0].content[1].text).toContain('was not read');

    expect(result).toMatchObject({ outcome: 'answer', read: LIFE });
    expect(result.outcome === 'answer' && result.statements.map((statement) => statement.text)).toEqual(['One thing.']);
  });

  it('says what was read with "not in your data", so a wrong choice shows', async () => {
    modelSays({ parts: ['life'] });
    modelSays({ statements: [], notInData: true });

    expect(await answer.ask(QUESTION, { maxChars: tight })).toEqual({ outcome: 'not-in-data', summarised: null, read: LIFE });
  });

  it('drops a statement that cites a record of a part that was not sent', async () => {
    modelSays({ parts: ['life'] });
    modelSays({ statements: [{ text: 'From memory.', citations: ['transaction_seed_5'] }], notInData: false });

    const result = await answer.ask(QUESTION, { maxChars: tight });

    expect(result).toMatchObject({ outcome: 'answer', statements: [], leftOut: true });
  });

  it('reads the months the small model named', async () => {
    modelSays({ parts: ['life'], from: '2026-01', to: '2026-02' });
    modelSays({ statements: [], notInData: true });

    const result = await answer.ask(QUESTION, { maxChars: tight });

    expect(result).toMatchObject({ read: { parts: ['life'], months: { from: '2026-01', to: '2026-02' } } });
  });

  it.each([
    ['the small model does not answer', () => callTool.mockRejectedValueOnce(new Error('overloaded'))],
    ['it names no part that is one', () => modelSays({ parts: ['everything'] })],
    ['its reply was cut off', () => callTool.mockResolvedValueOnce({ input: { parts: ['life'] }, stopReason: 'max_tokens', usage: null })],
  ])('is refused as too large when %s, and the question is not asked', async (_what, arrange) => {
    arrange();

    expect(await answer.ask(QUESTION, { maxChars: tight })).toEqual({ outcome: 'too-large' });
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('is refused as too large when the chosen parts do not fit either', async () => {
    modelSays({ parts: ['life', 'money', 'categories', 'transactions', 'investments'], from: '2020-01', to: '2026-12' });

    expect(await answer.ask(QUESTION, { maxChars: tight })).toEqual({ outcome: 'too-large' });
    expect(callTool).toHaveBeenCalledTimes(1);
  });
});
