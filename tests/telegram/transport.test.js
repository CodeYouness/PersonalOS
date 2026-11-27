/**
 * The one place a request to Telegram is made, against a fake `fetch`. The
 * token is part of the address Telegram's API wants, so nothing this module
 * throws or logs may carry the address.
 */

import { describe, expect, it } from 'vitest';

import { makeTelegramTransport } from '@/lib/telegram/transport.js';

const TOKEN = 'not-a-real-token';

/** @param {(url: string, init: any) => any} respond */
function fakeFetch(respond) {
  /** @type {{ url: string, body: any }[]} */
  const requests = [];
  /** @type {any} */
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
    requests.push({ url, body: JSON.parse(init.body) });
    const answer = await respond(url, init);
    return { ok: answer.status === undefined || answer.status < 400, status: answer.status ?? 200, json: async () => answer.body };
  };
  return { fetch, requests };
}

describe('the Telegram transport', () => {
  it('asks for message updates from an offset, waiting as long as it is told', async () => {
    const { fetch, requests } = fakeFetch(() => ({ body: { ok: true, result: [{ update_id: 7 }] } }));
    const transport = makeTelegramTransport({ token: TOKEN, fetch });

    expect(await transport.getUpdates({ offset: 7, timeoutSeconds: 50 })).toEqual([{ update_id: 7 }]);
    expect(requests).toEqual([{
      url: 'https://api.telegram.org/bot' + TOKEN + '/getUpdates',
      body: { offset: 7, timeout: 50, allowed_updates: ['message'] },
    }]);
  });

  it('leaves the offset out when there is none yet', async () => {
    const { fetch, requests } = fakeFetch(() => ({ body: { ok: true, result: [] } }));
    await makeTelegramTransport({ token: TOKEN, fetch }).getUpdates({ timeoutSeconds: 0 });
    expect(requests[0].body).toEqual({ timeout: 0, allowed_updates: ['message'] });
  });

  it('sends a plain text to a chat', async () => {
    const { fetch, requests } = fakeFetch(() => ({ body: { ok: true, result: { message_id: 3 } } }));
    const messageId = await makeTelegramTransport({ token: TOKEN, fetch }).sendMessage({ chatId: 1001, text: 'Received.' });
    expect(messageId).toBe(3);
    expect(requests).toEqual([{ url: 'https://api.telegram.org/bot' + TOKEN + '/sendMessage', body: { chat_id: 1001, text: 'Received.' } }]);
  });

  it('fails with the method, the status and what Telegram said, and never with the token', async () => {
    const refused = fakeFetch(() => ({ status: 409, body: { ok: false, error_code: 409, description: 'Conflict: terminated by other getUpdates request' } }));
    const error = await makeTelegramTransport({ token: TOKEN, fetch: refused.fetch }).getUpdates({ timeoutSeconds: 0 }).catch((caught) => caught);
    expect(error.message).toBe('Telegram getUpdates failed (409): Conflict: terminated by other getUpdates request');
    expect(error.status).toBe(409);

    /** @type {any} */
    const down = async (/** @type {string} */ url) => { throw new Error('request to ' + url + ' failed'); };
    const lost = await makeTelegramTransport({ token: TOKEN, fetch: down }).sendMessage({ chatId: 1, text: 'x' }).catch((caught) => caught);
    expect(lost.message).toBe('Telegram sendMessage could not be reached');
    expect(String(lost.stack) + JSON.stringify(lost)).not.toContain(TOKEN);
  });

  it('refuses an answer that is not a list of updates', async () => {
    const { fetch } = fakeFetch(() => ({ body: { ok: true, result: 'nope' } }));
    await expect(makeTelegramTransport({ token: TOKEN, fetch }).getUpdates({ timeoutSeconds: 0 })).rejects.toThrow('Telegram getUpdates answered something that is not a list');
  });
});
