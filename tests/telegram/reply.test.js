/**
 * A reply to the evening reminder is the open answer of the day the reminder
 * was about (#291, ADR 0068): kept as a journal entry first, then read by
 * the small model, once per update id. The model is stubbed at the provider
 * seam; the store is the seed in a throwaway DATA_DIR with the clock pinned.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const callTool = vi.hoisted(() => vi.fn());

vi.mock('@/lib/ai/provider.js', () => ({ callTool }));

/** The reminder went out on Thursday 24 September 2026, 21:30 in Rome. */
const REMINDER_DAY = '2026-09-24';
const SAME_EVENING = new Date('2026-09-24T20:00:00Z');
/** 00:40 in Rome on the 25th. */
const AFTER_MIDNIGHT = new Date('2026-09-24T22:40:00Z');
const NEXT_DAY = '2026-09-25';
const REMINDER_MESSAGE = 4242;
const SENTENCE = 'Giornata lunga, ho camminato mezz\'ora';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {(message: { updateId: number, text: string, replyTo: number | null }) => Promise<string>} */
let handle;
/** @type {typeof import('@/lib/telegram/texts.js').TELEGRAM_TEXTS} */
let TEXTS;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-telegram-reply-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  process.env.ANTHROPIC_MODEL_CHECKIN = 'claude-test-checkin';
  store = await import('@/lib/store.js');
  ({ TELEGRAM_TEXTS: TEXTS } = await import('@/lib/telegram/texts.js'));
  ({ handleTelegramText: handle } = await import('@/lib/telegram/handle.js'));
});

afterAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL_CHECKIN;
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  callTool.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SAME_EVENING);
  await store.recordRun({
    schedule: 'evening-reminder', startedBy: 'schedule', engine: 'script', startedAt: '2026-09-24T19:30:00.000Z',
    durationMs: 300, outcome: 'ok', about: REMINDER_DAY, messageId: REMINDER_MESSAGE,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/** @param {string} day */
const journalOf = async (day) => (await store.getJournalEntries(day, day)).map((entry) => entry.text);

/** @param {unknown} actions */
function modelFiles(actions) {
  callTool.mockResolvedValueOnce({ input: { actions }, stopReason: 'tool_use', usage: null });
}

describe('a reply to the evening reminder', () => {
  it('is kept as a journal entry on the reminder\'s day, then read as the open answer, and confirmed with a neutral line', async () => {
    callTool.mockImplementationOnce(async () => {
      // The sentence is already saved when the model is asked.
      expect(await journalOf(REMINDER_DAY)).toContain(SENTENCE);
      return { input: { actions: [{ action: 'habit.set', params: { habitId: 'habit_move', value: true } }] }, stopReason: 'tool_use', usage: null };
    });

    const reply = await handle({ updateId: 9001, text: SENTENCE, replyTo: REMINDER_MESSAGE });

    expect(reply).toBe(TEXTS.replyFiled);
    expect(await journalOf(REMINDER_DAY)).toEqual([SENTENCE]);
    expect((await store.getDailyLog(REMINDER_DAY)).habits.habit_move).toBe(true);
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('is filed on the reminder\'s day when it arrives after midnight, not on today', async () => {
    vi.setSystemTime(AFTER_MIDNIGHT);
    modelFiles([]);

    await handle({ updateId: 9002, text: SENTENCE, replyTo: REMINDER_MESSAGE });

    expect(await journalOf(REMINDER_DAY)).toEqual([SENTENCE]);
    expect(await journalOf(NEXT_DAY)).toEqual([]);
  });

  it('keeps the journal entry when the model fails, and still confirms', async () => {
    callTool.mockRejectedValueOnce(new Error('overloaded'));

    const reply = await handle({ updateId: 9003, text: SENTENCE, replyTo: REMINDER_MESSAGE });

    expect(reply).toBe(TEXTS.replyFiled);
    expect(await journalOf(REMINDER_DAY)).toEqual([SENTENCE]);
  });

  it('is filed once when Telegram delivers the same update again, and the model is not asked twice', async () => {
    modelFiles([]);

    await handle({ updateId: 9004, text: SENTENCE, replyTo: REMINDER_MESSAGE });
    const again = await handle({ updateId: 9004, text: SENTENCE, replyTo: REMINDER_MESSAGE });

    expect(again).toBe(TEXTS.replyFiled);
    expect(await journalOf(REMINDER_DAY)).toEqual([SENTENCE]);
    expect(callTool).toHaveBeenCalledTimes(1);
  });

  it('files two different replies to the same reminder as two entries', async () => {
    modelFiles([]);
    modelFiles([]);

    await handle({ updateId: 9005, text: 'first thought', replyTo: REMINDER_MESSAGE });
    await handle({ updateId: 9006, text: 'second thought', replyTo: REMINDER_MESSAGE });

    expect((await journalOf(REMINDER_DAY)).sort()).toEqual(['first thought', 'second thought']);
  });
});

describe('any other text', () => {
  it.each([
    ['a text that replies to nothing', null],
    ['a reply to a message that was not a reminder', 1],
  ])('%s is acknowledged and filed nowhere, with no model asked', async (_what, replyTo) => {
    const reply = await handle({ updateId: 9007, text: SENTENCE, replyTo });

    expect(reply).toBe(TEXTS.received);
    expect(await journalOf(REMINDER_DAY)).toEqual([]);
    expect(callTool).not.toHaveBeenCalled();
  });
});
