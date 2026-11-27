/**
 * What may leave (ADR 0064): every sentence the bot can say is fixed text.
 * This fails the day one of them gains a slot for data.
 */

import { describe, expect, it } from 'vitest';

import { ALERT_TEXTS, alertText, captureReply, NEEDS_LOGIN_TEXTS, reminderText, TELEGRAM_TEXTS } from '@/lib/telegram/texts.js';
import { DESTINATIONS, SCHEDULE_IDS } from '@/personalos.config.js';

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

  it('answer a capture with its destination and nothing else', () => {
    for (const destination of DESTINATIONS) {
      expect(captureReply(destination, 'model')).toBe('Filed under ' + destination + '.');
    }
    expect(captureReply('memory', 'unclassified')).toBe(TELEGRAM_TEXTS.savedNotFiled);
    // The destination and the route: there is nowhere to pass a sentence.
    expect(captureReply.length).toBe(2);
  });
});

describe('the messages the system starts on its own', () => {
  /** Every unsolicited template: the reminder and the alerts. */
  const unsolicited = Object.entries({
    reminder: TELEGRAM_TEXTS.reminder,
    ...Object.fromEntries(Object.entries(ALERT_TEXTS).map(([id, text]) => ['alert ' + id, text])),
    ...Object.fromEntries(Object.entries(NEEDS_LOGIN_TEXTS).map(([id, text]) => ['needs-login ' + id, text])),
  });

  it('are fixed strings with no slot for data', () => {
    expect(Object.isFrozen(ALERT_TEXTS)).toBe(true);
    expect(Object.isFrozen(NEEDS_LOGIN_TEXTS)).toBe(true);
    for (const [name, text] of unsolicited) {
      expect(typeof text, name).toBe('string');
      expect(text.length, name).toBeGreaterThan(0);
      expect(text, name).not.toMatch(/[{}$%<>\[\]]|\d/);
    }
  });

  it('have one alert for every schedule, each its own sentence', () => {
    expect(Object.keys(ALERT_TEXTS).sort()).toEqual([...SCHEDULE_IDS].sort());
    expect(new Set(Object.values(ALERT_TEXTS)).size).toBe(SCHEDULE_IDS.length);
  });

  it('are chosen by schedule and kind only: an alert takes nothing of the run', () => {
    expect(alertText('sync-scalable', 'failed')).toBe(ALERT_TEXTS['sync-scalable']);
    expect(alertText('sync-scalable', 'needs-login')).toBe(NEEDS_LOGIN_TEXTS['sync-scalable']);
    // A schedule with no login of its own says it failed.
    expect(alertText('nightly-backup', 'needs-login')).toBe(ALERT_TEXTS['nightly-backup']);
    expect(alertText('not-a-schedule', 'failed')).toBeNull();
    expect(alertText.length).toBe(2);
  });
});
