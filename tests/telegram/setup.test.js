/**
 * What the guided setup script (`npm run telegram:setup`) works out by
 * itself: whether a token looks like one, and which chats wrote to the bot.
 */

import { describe, expect, it } from 'vitest';

import { chatsIn, envLines, looksLikeToken } from '@/lib/telegram/setup.js';

// Made here so no token-shaped string is ever in the repository.
const SHAPED = '1'.repeat(9) + ':' + 'a'.repeat(35);

describe('looksLikeToken', () => {
  it('takes the shape BotFather gives and refuses anything else', () => {
    expect(looksLikeToken(SHAPED)).toBe(true);
    expect(looksLikeToken(' ' + SHAPED + '\n')).toBe(true);
    expect(looksLikeToken('hello')).toBe(false);
    expect(looksLikeToken(SHAPED.slice(0, -1))).toBe(false);
    expect(looksLikeToken('')).toBe(false);
  });
});

describe('chatsIn', () => {
  it('lists each private chat that wrote once, with the name its sender shows', () => {
    const updates = [
      { update_id: 1, message: { chat: { id: 1001, type: 'private', first_name: 'A' }, text: 'hi' } },
      { update_id: 2, message: { chat: { id: 1001, type: 'private', first_name: 'A' }, text: 'again' } },
      { update_id: 3, message: { chat: { id: -500, type: 'group', title: 'G' }, text: 'x' } },
      { update_id: 4, message: { chat: { id: 2002, type: 'private' }, text: 'x' } },
      { update_id: 5, edited_message: { chat: { id: 3003, type: 'private' } } },
    ];
    expect(chatsIn(updates)).toEqual([{ id: 1001, name: 'A' }, { id: 2002, name: '' }]);
  });

  it('is empty when nobody wrote', () => {
    expect(chatsIn([])).toEqual([]);
  });
});

describe('envLines', () => {
  it('gives the two lines for .env.local', () => {
    expect(envLines(SHAPED, 1001)).toEqual(['TELEGRAM_BOT_TOKEN=' + SHAPED, 'TELEGRAM_CHAT_ID=1001']);
  });
});
