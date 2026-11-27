/**
 * What may leave (ADR 0064): every sentence the bot can say is fixed text.
 * This fails the day one of them gains a slot for data.
 */

import { describe, expect, it } from 'vitest';

import { reminderText, TELEGRAM_TEXTS } from '@/lib/telegram/texts.js';

describe('the bot\'s sentences', () => {
  it('are plain strings, never a function of anything', () => {
    for (const [name, text] of Object.entries(TELEGRAM_TEXTS)) {
      expect(typeof text, name).toBe('string');
      expect(text.length, name).toBeGreaterThan(0);
    }
    expect(Object.isFrozen(TELEGRAM_TEXTS)).toBe(true);
  });

  it('hold no placeholder of any kind', () => {
    for (const [name, text] of Object.entries(TELEGRAM_TEXTS)) {
      expect(text, name).not.toMatch(/[{}$%<>\[\]]|\d/);
    }
  });

  it('say of the reminder only that the check-in is open', () => {
    expect(TELEGRAM_TEXTS.reminder).toBe("Today's check-in is open.");
    expect(reminderText(null)).toBe(TELEGRAM_TEXTS.reminder);
  });

  it('add to the reminder nothing but the configured address', () => {
    expect(reminderText('https://personalos.example')).toBe(TELEGRAM_TEXTS.reminder + '\nhttps://personalos.example');
    // One argument, the address: there is nowhere to pass anything else.
    expect(reminderText.length).toBe(1);
  });
});
