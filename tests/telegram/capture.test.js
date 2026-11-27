/**
 * A text that is not a reply to a reminder (#292, ADR 0069): filed through
 * the capture bar's entry point with origin `telegram`, or, when it ends
 * with a question mark, answered as the bar's Ask mode answers. The model is
 * stubbed at the provider seam; the store is the seed in a throwaway
 * DATA_DIR with the clock pinned.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/provider.js', () => ({ callTool }));

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const SENTENCE = 'call the plumber';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {(message: { updateId: number, text: string, replyTo: number | null }) => Promise<string>} */
let handle;
/** @type {typeof import('@/lib/telegram/texts.js')} */
let texts;
/** @type {typeof import('@/lib/ai/context/index.js').buildContext} */
let buildContext;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-telegram-capture-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_MODEL_CLASSIFY = 'claude-test-classify';
  process.env.ANTHROPIC_MODEL_ANSWER = 'claude-test-answer';
  store = await import('@/lib/store.js');
  texts = await import('@/lib/telegram/texts.js');
  ({ buildContext } = await import('@/lib/ai/context/index.js'));
  ({ handleTelegramText: handle } = await import('@/lib/telegram/handle.js'));
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
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {Record<string, unknown>} input what the model answers */
function modelSays(input) {
  callTool.mockResolvedValueOnce({ input, stopReason: 'tool_use', usage: null });
}

/** The captures that came through Telegram, oldest first. */
async function telegramCaptures() {
  return (await store.getCaptures()).filter((capture) => capture.origin === 'telegram');
}

describe('a sentence sent to the bot', () => {
  it('is filed as the bar would file it, with origin telegram, and the reply names the destination only', async () => {
    modelSays({ destination: 'task', title: 'Call the plumber' });
    const before = (await store.getTasks()).length;

    const reply = await handle({ updateId: 7001, text: SENTENCE, replyTo: null });

    expect(reply).toBe(texts.captureReply('task', 'model'));
    expect(reply).toContain('task');
    expect(reply).not.toContain('plumber');
    expect(await telegramCaptures()).toEqual([
      expect.objectContaining({ text: SENTENCE, origin: 'telegram', destination: 'task', route: 'model', clientId: 'telegram:7001' }),
    ]);
    const tasks = await store.getTasks();
    expect(tasks).toHaveLength(before + 1);
    expect(tasks.map((task) => task.title)).toContain('Call the plumber');
    expect(callTool.mock.calls[0][0].model).toBe('claude-test-classify');
  });

  it('is still filed, by the rules, when the model is unavailable, and the reply says where', async () => {
    callTool.mockRejectedValueOnce(new Error('overloaded'));

    const reply = await handle({ updateId: 7002, text: 'spent €12 on lunch', replyTo: null });

    const [capture] = await telegramCaptures();
    expect(capture).toMatchObject({ text: 'spent €12 on lunch', route: 'rules', destination: 'finance' });
    expect(reply).toBe(texts.captureReply('finance', 'rules'));
    // The destination only: no amount leaves, even in a reply to a capture.
    expect(reply).not.toMatch(/\d/);
  });

  it('files nothing new when Telegram delivers the same update again, and asks no model twice', async () => {
    modelSays({ destination: 'task', title: 'Call the plumber' });

    const first = await handle({ updateId: 7003, text: SENTENCE, replyTo: null });
    const again = await handle({ updateId: 7003, text: SENTENCE, replyTo: null });

    expect(again).toBe(first);
    expect(await telegramCaptures()).toHaveLength(1);
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('is filed as a capture when it replies to a message that was not a reminder', async () => {
    modelSays({ destination: 'memory' });

    const reply = await handle({ updateId: 7004, text: 'the plumber is called Aldo', replyTo: 1 });

    expect(reply).toBe(texts.captureReply('memory', 'model'));
    expect(await telegramCaptures()).toHaveLength(1);
  });
});

describe('a question sent to the bot', () => {
  it('gets its answer in the chat, from the answer model, and is filed nowhere', async () => {
    const context = await buildContext('question');
    const cited = context.items[0];
    modelSays({ statements: [{ text: 'You have one thing due today.', citations: [cited.id] }] });

    const reply = await handle({ updateId: 7101, text: 'what is due today?', replyTo: null });

    expect(reply).toBe('You have one thing due today.');
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0].model).toBe('claude-test-answer');
    expect(await telegramCaptures()).toEqual([]);
  });

  it('says so when the data does not hold the answer', async () => {
    modelSays({ notInData: true });

    expect(await handle({ updateId: 7102, text: 'how tall is the moon?', replyTo: null })).toBe(texts.TELEGRAM_TEXTS.notInData);
  });

  it('says the model did not answer, and files nothing', async () => {
    callTool.mockRejectedValueOnce(new Error('overloaded'));

    expect(await handle({ updateId: 7103, text: 'what is due today?', replyTo: null })).toBe(texts.TELEGRAM_TEXTS.answerFailed);
    expect(await telegramCaptures()).toEqual([]);
  });

  it('says a statement was left out when the model cited nothing it was shown', async () => {
    const context = await buildContext('question');
    modelSays({ statements: [
      { text: 'Kept.', citations: [context.items[0].id] },
      { text: 'Invented.', citations: ['task_does_not_exist'] },
    ] });

    const reply = await handle({ updateId: 7104, text: 'what is due today?', replyTo: null });

    // What the reader must know about the answer stands apart from it.
    expect(reply).toBe('Kept.\n\n' + texts.TELEGRAM_TEXTS.leftOut);
  });

  it('lists several statements as points, one to a line', async () => {
    const context = await buildContext('question');
    const [first, second] = context.items;
    modelSays({ statements: [
      { text: 'Nothing is set for tomorrow.', citations: [first.id] },
      { text: 'One thing is overdue.', citations: [second.id] },
    ] });

    const reply = await handle({ updateId: 7106, text: 'what is due tomorrow?', replyTo: null });

    expect(reply).toBe('• Nothing is set for tomorrow.\n• One thing is overdue.');
  });

  it('asks for an answer short enough for a chat, and the capture bar does not', async () => {
    const { ask, CHAT_BRIEF } = await import('@/lib/answer.js');
    modelSays({ notInData: true });
    modelSays({ notInData: true });

    await handle({ updateId: 7107, text: 'what is due tomorrow?', replyTo: null });
    await ask('what is due tomorrow?');

    const [fromChat, fromBar] = callTool.mock.calls.map(([request]) => request.messages[0].content[0].text);
    expect(fromChat).toContain('what is due tomorrow?');
    expect(fromChat).toContain(CHAT_BRIEF);
    expect(fromBar).not.toContain(CHAT_BRIEF);
    // Said with the question, so the instructions every question shares stay as measured (ADR 0030).
    expect(callTool.mock.calls[0][0].system).toBe(callTool.mock.calls[1][0].system);
  });

  it('refuses a question that is too long without asking the model', async () => {
    const reply = await handle({ updateId: 7105, text: 'a'.repeat(1001) + '?', replyTo: null });

    expect(reply).toBe(texts.TELEGRAM_TEXTS.questionTooLong);
    expect(callTool).not.toHaveBeenCalled();
  });
});
