/**
 * Failure alerts (#292, ADR 0069): when a schedule's run failed and the run
 * before it had not, one fixed message; nothing more until it succeeds. A
 * fake sender and a fake store; no test calls Telegram.
 */

import { describe, expect, it } from 'vitest';

import { makeFailureAlerter } from '@/lib/scheduler/alerts.js';
import { createScheduler } from '@/lib/scheduler/scheduler.js';
import { ALERT_TEXTS, NEEDS_LOGIN_TEXTS } from '@/lib/telegram/texts.js';
import { RUN_REASONS, SCHEDULES } from '@/personalos.config.js';

const ROME = 'Europe/Rome';
const BROKER = /** @type {any} */ (SCHEDULES.find((schedule) => schedule.id === 'sync-scalable'));

function fakeStore() {
  /** @type {any[]} */
  const runs = [];
  return {
    runs,
    getRuns: async (/** @type {{ schedule?: string }} */ { schedule } = {}) => [...runs].reverse().filter((run) => schedule === undefined || run.schedule === schedule),
    recordRun: async (/** @type {any} */ run) => { runs.push(run); return run; },
  };
}

/**
 * A scheduler of the broker sync whose job does what the next entry of
 * `script` says, with the alerter wired as the real start wires it.
 *
 * @param {{ off?: boolean, sendFails?: boolean }} [options]
 */
function broker({ off = false, sendFails = false } = {}) {
  const store = fakeStore();
  /** @type {string[]} */
  const sent = [];
  /** @type {any[]} */
  const script = [];
  let at = Date.parse('2026-06-15T05:00:00Z');
  const scheduler = createScheduler({
    schedules: [BROKER],
    jobs: { [BROKER.id]: async () => {
      const next = script.shift();
      if (next instanceof Error) throw next;
      return next;
    } },
    store,
    clock: () => new Date((at += 1000)),
    timezone: ROME,
    afterRun: makeFailureAlerter({
      send: off ? null : async (text) => {
        if (sendFails) throw new Error('telegram is down');
        sent.push(text);
        return 1;
      },
      store,
      log: () => {},
    }),
    log: () => {},
  });
  /** @param {any} result what the job returns, or an Error it throws */
  const runs = async (result) => {
    script.push(result);
    return scheduler.runNow(BROKER.id, 'user');
  };
  return { runs, sent, store };
}

const OK = { outcome: 'ok' };
const FAILED = new Error('the broker answered with a page of html');
const NEEDS_LOGIN = { outcome: 'failed', reason: RUN_REASONS.needsLogin };

describe('a failing schedule', () => {
  it('alerts once on the first failure, naming the schedule and nothing of the error', async () => {
    const { runs, sent } = broker();

    await runs(OK);
    await runs(FAILED);

    expect(sent).toEqual([ALERT_TEXTS['sync-scalable']]);
    expect(sent[0]).not.toContain('html');
  });

  it('says nothing more on a second consecutive failure', async () => {
    const { runs, sent } = broker();

    await runs(FAILED);
    await runs(FAILED);

    expect(sent).toHaveLength(1);
  });

  it('alerts again when it fails after a success', async () => {
    const { runs, sent } = broker();

    await runs(FAILED);
    await runs(OK);
    await runs(FAILED);

    expect(sent).toHaveLength(2);
  });

  it('says nothing for a run that worked or skipped', async () => {
    const { runs, sent } = broker();

    await runs(OK);
    await runs({ outcome: 'skipped', reason: RUN_REASONS.notConfigured });

    expect(sent).toEqual([]);
  });

  it('uses its own text when the broker needs a login', async () => {
    const { runs, sent } = broker();

    await runs(NEEDS_LOGIN);

    expect(sent).toEqual([NEEDS_LOGIN_TEXTS['sync-scalable']]);
    expect(NEEDS_LOGIN_TEXTS['sync-scalable']).not.toBe(ALERT_TEXTS['sync-scalable']);
  });

  it('with the channel off, leaves the failure in the run log and sends nothing', async () => {
    const { runs, sent, store } = broker({ off: true });

    await runs(FAILED);

    expect(sent).toEqual([]);
    expect(store.runs).toEqual([expect.objectContaining({ schedule: 'sync-scalable', outcome: 'failed', reason: FAILED.message })]);
  });

  it('still records the run when the alert cannot be sent', async () => {
    const { runs, store } = broker({ sendFails: true });

    const recorded = await runs(FAILED);

    expect(recorded).toMatchObject({ outcome: 'failed' });
    expect(store.runs).toHaveLength(1);
  });
});

describe('the alerter', () => {
  it('says nothing about a run that is not a schedule\'s: the channel\'s own runs are not alerts', async () => {
    const store = fakeStore();
    /** @type {string[]} */
    const sent = [];
    const alert = makeFailureAlerter({ send: async (text) => { sent.push(text); return 1; }, store, log: () => {} });
    const run = await store.recordRun({ schedule: 'telegram', outcome: 'failed', reason: 'x', startedAt: '2026-06-15T05:00:00.000Z' });

    await alert(run);

    expect(sent).toEqual([]);
  });
});
