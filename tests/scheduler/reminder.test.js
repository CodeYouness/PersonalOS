/**
 * The evening reminder (#291, ADR 0068): one fixed message when a closed
 * question of today's check-in is still open, never two for a day, sent late
 * only while it is still that day. A fake sender; no test calls Telegram.
 */

import { describe, expect, it } from 'vitest';

import { makeEveningReminderJob } from '@/lib/scheduler/reminder.js';
import { createScheduler } from '@/lib/scheduler/scheduler.js';
import { TELEGRAM_TEXTS } from '@/lib/telegram/texts.js';
import { RUN_REASONS, SCHEDULES } from '@/personalos.config.js';

const ROME = 'Europe/Rome';
const REMINDER = /** @type {any} */ (SCHEDULES.find((schedule) => schedule.id === 'evening-reminder'));

function fakeStore() {
  /** @type {any[]} */
  const runs = [];
  return {
    runs,
    getRuns: async (/** @type {{ schedule?: string }} */ { schedule } = {}) => [...runs].reverse().filter((run) => schedule === undefined || run.schedule === schedule),
    recordRun: async (/** @type {any} */ run) => { runs.push(run); return run; },
  };
}

/** @param {{ done?: boolean, off?: boolean, baseUrl?: string | null }} [options] */
function reminder({ done = false, off = false, baseUrl = null } = {}) {
  /** @type {string[]} */
  const sent = [];
  /** @type {string[]} */
  const asked = [];
  let nextId = 500;
  const job = makeEveningReminderJob({
    send: off ? null : async (text) => { sent.push(text); nextId += 1; return nextId; },
    isDone: async (day) => { asked.push(day); return done; },
    baseUrl,
  });
  return { job, sent, asked };
}

/** @param {any} job @param {string} iso @param {any} [store] */
const runAt = (job, iso, store = fakeStore()) => job({ scheduleId: 'evening-reminder', startedBy: 'schedule', now: new Date(iso), timezone: ROME, store });

describe('the declared reminder', () => {
  it('is at 21:30 every day and is dropped once its day is over', () => {
    expect(REMINDER).toMatchObject({ time: '21:30', days: [1, 2, 3, 4, 5, 6, 7], engine: 'script', catchUp: 'same-day' });
  });
});

describe('the evening reminder job', () => {
  it('sends one fixed message when a closed question is open, and says which day and which message', async () => {
    const { job, sent, asked } = reminder();

    // 21:30 in Rome on 15 June.
    const result = await runAt(job, '2026-06-15T19:30:00Z');

    expect(sent).toEqual([TELEGRAM_TEXTS.reminder]);
    expect(asked).toEqual(['2026-06-15']);
    expect(result).toEqual({ outcome: 'ok', about: '2026-06-15', messageId: 501 });
  });

  it('sends nothing when every closed question is answered, and is skipped saying so', async () => {
    const { job, sent } = reminder({ done: true });
    expect(await runAt(job, '2026-06-15T19:30:00Z')).toEqual({ outcome: 'skipped', reason: RUN_REASONS.checkinDone });
    expect(sent).toEqual([]);
  });

  it('is skipped with nothing sent and nothing read when the channel is off', async () => {
    const { job, sent, asked } = reminder({ off: true });
    expect(await runAt(job, '2026-06-15T19:30:00Z')).toEqual({ outcome: 'skipped', reason: RUN_REASONS.notConfigured });
    expect(sent).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('never sends a second reminder for a day that has one, however it is started', async () => {
    const { job, sent } = reminder();
    const store = fakeStore();
    store.runs.push({ schedule: 'evening-reminder', outcome: 'ok', about: '2026-06-15', messageId: 77 });

    expect(await runAt(job, '2026-06-15T20:00:00Z', store)).toEqual({ outcome: 'skipped', reason: RUN_REASONS.alreadySent });
    expect(sent).toEqual([]);
  });

  it('still sends when the day only has a reminder that was skipped or failed', async () => {
    const { job, sent } = reminder();
    const store = fakeStore();
    store.runs.push({ schedule: 'evening-reminder', outcome: 'failed', reason: 'Telegram sendMessage could not be reached' });

    await runAt(job, '2026-06-15T20:00:00Z', store);

    expect(sent).toHaveLength(1);
  });

  it('puts the configured address on its own line, and nothing else', async () => {
    const { job, sent } = reminder({ baseUrl: 'https://personalos.example' });
    await runAt(job, '2026-06-15T19:30:00Z');
    expect(sent).toEqual([TELEGRAM_TEXTS.reminder + '\nhttps://personalos.example']);
  });
});

describe('the reminder on the scheduler', () => {
  /** @param {string} iso */
  function setup(iso) {
    const store = fakeStore();
    let current = new Date(iso);
    const { job, sent } = reminder();
    const scheduler = createScheduler({ schedules: [REMINDER], jobs: { 'evening-reminder': job }, store, clock: () => current, timezone: ROME });
    return { store, sent, scheduler, set: (/** @type {string} */ next) => { current = new Date(next); } };
  }

  it('records the day and the message on the run, once, however many ticks follow', async () => {
    const { store, sent, scheduler, set } = setup('2026-06-15T19:30:00Z');

    await scheduler.tick();
    set('2026-06-15T19:31:00Z');
    await scheduler.tick();

    expect(sent).toHaveLength(1);
    expect(store.runs).toHaveLength(1);
    expect(store.runs[0]).toMatchObject({ schedule: 'evening-reminder', outcome: 'ok', about: '2026-06-15', messageId: 501 });
  });

  it('sends on a wake at 23:00 the same day', async () => {
    // The laptop was closed at 21:30; 23:00 in Rome is 21:00Z.
    const { sent, store, scheduler } = setup('2026-06-15T21:00:00Z');
    await scheduler.tick();
    expect(sent).toHaveLength(1);
    expect(store.runs[0].about).toBe('2026-06-15');
  });

  it('sends nothing, and records nothing, on a wake after midnight', async () => {
    // 00:30 in Rome on the 16th: yesterday's reminder is dropped.
    const { sent, store, scheduler } = setup('2026-06-15T22:30:00Z');
    await scheduler.tick();
    expect(sent).toEqual([]);
    expect(store.runs).toEqual([]);
  });
});
