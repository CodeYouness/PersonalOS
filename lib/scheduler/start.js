/**
 * Starts the real scheduler (ADR 0062): the real clock, the declared
 * schedules, their jobs and the store. Called from `instrumentation.js` in
 * the server process, not awaited.
 *
 * It starts only when `env.schedulerEnabled` -- the process `npm run serve`
 * started -- so development, the sandbox, scripts and tests never run a
 * schedule. It runs in the server's own module graph, so its writes go
 * through the same in-process queue as every route (ADR 0011).
 */

import { limits, SCHEDULES } from '../../personalos.config.js';
import { errorMessage } from '../domain/error-message.js';
import { env } from '../config/env.js';
import * as store from '../store.js';
import { telegramSender } from '../telegram/send.js';
import { makeFailureAlerter } from './alerts.js';
import { JOBS } from './jobs.js';
import { isMachineReady } from './machine.js';
import { createScheduler } from './scheduler.js';

const STARTED = Symbol.for('personalos.scheduler.started');

/** @type {{ [STARTED]?: { timer: ReturnType<typeof setInterval>, scheduler: ReturnType<typeof createScheduler> } }} */
const shared = /** @type {any} */ (globalThis);

/**
 * @param {{ tick?: boolean }} [options] `tick: false` skips the immediate
 *   catch-up tick (tests)
 * @returns {boolean} whether a scheduler was started by this call
 */
export function startScheduler({ tick = true } = {}) {
  if (!env.schedulerEnabled || shared[STARTED] !== undefined) return false;

  const scheduler = createScheduler({
    schedules: SCHEDULES,
    jobs: JOBS,
    store,
    clock: () => new Date(),
    timezone: env.timezone,
    ready: isMachineReady,
    // One message when a schedule starts failing (ADR 0069); nothing with the channel off.
    afterRun: makeFailureAlerter({ send: telegramSender(), store }),
  });
  const safeTick = () => scheduler.tick().catch((error) => {
    console.error('[scheduler] tick failed: ' + (errorMessage(error)));
  });
  // Waking after a sleep is the same case as a late tick: the next interval
  // asks the same question and finds the missed slot.
  const timer = setInterval(safeTick, limits.schedulerTickMs);
  timer.unref();
  shared[STARTED] = { timer, scheduler };
  if (tick) void safeTick();
  return true;
}

/** Stops the scheduler this process started; for tests. */
export function stopScheduler() {
  const started = shared[STARTED];
  if (started !== undefined) clearInterval(started.timer);
  shared[STARTED] = undefined;
}

/**
 * The running scheduler, for `runNow` from a route or a channel (#289).
 * Undefined when this process runs none.
 */
export function runningScheduler() {
  return shared[STARTED]?.scheduler;
}
