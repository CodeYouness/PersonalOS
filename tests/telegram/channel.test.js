/**
 * The Telegram channel (ADR 0064) against a fake transport: one chat, an
 * update handled before it is acknowledged, a redelivery recognised by its
 * update id, a connection that fails without ending the loop. No test here
 * calls Telegram.
 */

import { describe, expect, it } from 'vitest';

import { createTelegramChannel } from '@/lib/telegram/channel.js';
import { TELEGRAM_TEXTS } from '@/lib/telegram/texts.js';

const MINE = 1001;
const OTHER = 2002;

/** @param {number} id @param {Record<string, unknown>} message @param {number} [chat] */
const update = (id, message, chat = MINE) => ({ update_id: id, message: { message_id: id, chat: { id: chat, type: 'private' }, ...message } });

/**
 * A Telegram that holds updates until they are acknowledged: `getUpdates`
 * with an offset drops every update below it, as the real one does.
 *
 * @param {any[]} pending
 */
function fakeTelegram(pending) {
  /** @type {string[]} */
  const calls = [];
  /** @type {{ chatId: number, text: string }[]} */
  const sent = [];
  let queue = [...pending];
  return {
    calls,
    sent,
    pending: () => queue,
    deliver: (/** @type {any} */ next) => { queue.push(next); },
    transport: {
      getUpdates: async (/** @type {{ offset?: number }} */ { offset }) => {
        calls.push('getUpdates:' + (offset ?? 'none'));
        if (offset !== undefined) queue = queue.filter((entry) => entry.update_id >= offset);
        return [...queue];
      },
      sendMessage: async (/** @type {{ chatId: number, text: string }} */ message) => {
        calls.push('send');
        sent.push(message);
      },
    },
  };
}

/** @param {any} telegram @param {Record<string, unknown>} [over] */
function channelOn(telegram, over = {}) {
  return createTelegramChannel({
    transport: telegram.transport, chatId: MINE, pollSeconds: 0, backoff: { minMs: 10, maxMs: 40 },
    handle: async () => TELEGRAM_TEXTS.received, sleep: async () => {}, log: () => {}, ...over,
  });
}

describe('the Telegram channel', () => {
  it('handles a text from my chat once, answers it, and acknowledges it only after', async () => {
    const telegram = fakeTelegram([update(7, { text: 'hello' })]);
    /** @type {any[]} */
    const handled = [];
    const channel = channelOn(telegram, {
      handle: async (/** @type {any} */ message) => { telegram.calls.push('handle'); handled.push(message); return TELEGRAM_TEXTS.received; },
    });

    await channel.pollOnce();
    await channel.pollOnce();

    expect(handled).toEqual([{ updateId: 7, text: 'hello', replyTo: null }]);
    expect(telegram.sent).toEqual([{ chatId: MINE, text: TELEGRAM_TEXTS.received }]);
    // Asked with no offset, handled, answered, and only then asked from 8 on.
    expect(telegram.calls).toEqual(['getUpdates:none', 'handle', 'send', 'getUpdates:8']);
    expect(telegram.pending()).toEqual([]);
  });

  it('tells the handler which message a text replies to', async () => {
    const telegram = fakeTelegram([update(7, { text: 'done', reply_to_message: { message_id: 55, text: 'not read' } })]);
    /** @type {any[]} */
    const handled = [];
    const channel = channelOn(telegram, { handle: async (/** @type {any} */ message) => { handled.push(message); return TELEGRAM_TEXTS.received; } });

    await channel.pollOnce();

    expect(handled).toEqual([{ updateId: 7, text: 'done', replyTo: 55 }]);
  });

  it('handles an update delivered twice once', async () => {
    const twice = update(7, { text: 'hello' });
    let handled = 0;
    const telegram = fakeTelegram([twice]);
    // A Telegram that ignores the acknowledgement and delivers it again.
    telegram.transport.getUpdates = async () => [twice];
    const channel = channelOn(telegram, { handle: async () => { handled += 1; return TELEGRAM_TEXTS.received; } });

    await channel.pollOnce();
    await channel.pollOnce();

    expect(handled).toBe(1);
    expect(telegram.sent).toHaveLength(1);
  });

  it('neither loses nor duplicates a message when the process dies between handling and acknowledging', async () => {
    const telegram = fakeTelegram([update(7, { text: 'remember this' })]);
    // What a handler that files does: one record per update id, whoever asks.
    /** @type {Map<number, string>} */
    const filed = new Map();
    const handle = async (/** @type {{ updateId: number, text: string }} */ { updateId, text }) => {
      if (!filed.has(updateId)) filed.set(updateId, text);
      return TELEGRAM_TEXTS.received;
    };

    // Handled, then the process dies before the next request acknowledges it.
    await channelOn(telegram, { handle }).pollOnce();
    expect(telegram.pending()).toHaveLength(1);

    // A new process remembers nothing: Telegram delivers the update again.
    const restarted = channelOn(telegram, { handle });
    await restarted.pollOnce();
    await restarted.pollOnce();

    expect([...filed]).toEqual([[7, 'remember this']]);
    expect(telegram.pending()).toEqual([]);
  });

  it('leaves an update unacknowledged when handling it fails, and handles it on the next poll', async () => {
    const telegram = fakeTelegram([update(7, { text: 'first' }), update(8, { text: 'second' })]);
    let attempts = 0;
    /** @type {number[]} */
    const done = [];
    const channel = channelOn(telegram, {
      handle: async (/** @type {{ updateId: number }} */ { updateId }) => {
        attempts += 1;
        if (attempts === 1) throw new Error('the disk is full');
        done.push(updateId);
        return TELEGRAM_TEXTS.received;
      },
    });

    await expect(channel.pollOnce()).rejects.toThrow('the disk is full');
    expect(telegram.sent).toEqual([]);
    await channel.pollOnce();

    expect(done).toEqual([7, 8]);
  });

  it('drops an update from another chat: nothing sent, nothing handled, nothing said of it, and it is not asked for again', async () => {
    const telegram = fakeTelegram([update(7, { text: 'who is this', from: { first_name: 'Someone' } }, OTHER)]);
    let handled = 0;
    /** @type {unknown[]} */
    const logged = [];
    const channel = channelOn(telegram, {
      handle: async () => { handled += 1; return TELEGRAM_TEXTS.received; },
      log: (/** @type {unknown[]} */ ...args) => { logged.push(...args); },
    });

    await channel.pollOnce();
    await channel.pollOnce();

    expect(handled).toBe(0);
    expect(telegram.sent).toEqual([]);
    expect(JSON.stringify(logged)).not.toMatch(/who is this|Someone|2002/);
    expect(telegram.calls).toEqual(['getUpdates:none', 'getUpdates:8']);
  });

  it('drops an update that is not a message, and one with no chat', async () => {
    const telegram = fakeTelegram([{ update_id: 7, edited_message: { chat: { id: MINE }, text: 'edited' } }, { update_id: 8, message: { text: 'no chat' } }]);
    let handled = 0;
    const channel = channelOn(telegram, { handle: async () => { handled += 1; return TELEGRAM_TEXTS.received; } });

    await channel.pollOnce();

    expect(handled).toBe(0);
    expect(telegram.sent).toEqual([]);
  });

  it('answers a voice note, a photo and a file with the line that points to the Shortcut, and hands none to the handler', async () => {
    const telegram = fakeTelegram([
      update(7, { voice: { file_id: 'v', duration: 3 } }),
      update(8, { photo: [{ file_id: 'p' }], caption: 'a caption is not a sentence said to the bot' }),
      update(9, { document: { file_id: 'd', file_name: 'statement.pdf' } }),
    ]);
    let handled = 0;
    const channel = channelOn(telegram, { handle: async () => { handled += 1; return TELEGRAM_TEXTS.received; } });

    await channel.pollOnce();

    expect(handled).toBe(0);
    expect(telegram.sent).toEqual([7, 8, 9].map(() => ({ chatId: MINE, text: TELEGRAM_TEXTS.notText })));
    expect(TELEGRAM_TEXTS.notText).toMatch(/Shortcut/);
  });

  it('backs off and retries when the connection is lost, without ending the loop, and starts over once it is back', async () => {
    const telegram = fakeTelegram([]);
    /** @type {number[]} */
    const slept = [];
    let polls = 0;
    /** @type {{ stop: () => void, run: () => Promise<void> }} */
    let channel;
    telegram.transport.getUpdates = async () => {
      polls += 1;
      // Down for four polls, back for one, down again, then the test ends it.
      if (polls <= 4 || polls === 6) throw new Error('fetch failed');
      if (polls === 7) channel.stop();
      return [];
    };
    channel = channelOn(telegram, { sleep: async (/** @type {number} */ ms) => { slept.push(ms); } });

    await channel.run();

    // 10, doubled to the cap of 40; then from 10 again after a good poll.
    expect(slept).toEqual([10, 20, 40, 40, 10]);
    expect(polls).toBe(7);
  });
});
