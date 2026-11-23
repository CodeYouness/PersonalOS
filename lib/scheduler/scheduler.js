/**
 * The scheduler (ADR 0062): asks, on an interval, whether each schedule is
 * due, runs the ones that are, and records every run (ADR 0063).
 *
 * It owns no clock, no job and no storage: they are arguments, so a test
 * drives it with no waiting and no disk, and the real wiring (lib/scheduler/
 * start.js) is the only place that names the store and the real clock.
 *
 * ## The job contract (what #287, #288 and the Telegram tickets plug into)
 *
 * A job is `async (context) => JobResult | undefined`, registered in
 * `lib/scheduler/jobs.js` under its schedule's id.
 *
 * `context` is `{ scheduleId, startedBy, now, timezone, store }`:
 * - `startedBy` is `schedule`, `user` or `telegram`;
 * - `now` is a Date, the moment the run started -- use it, not `new Date()`,
 *   and take the day from `toDayKey(now, timezone)`;
 * - `store` is the data layer (lib/store.js). A job never imports storage.
 *
 * `JobResult` (every field optional):
 * - `outcome`: 'ok' (default), 'skipped' (chose not to work: say why in
 *   `reason`) or 'failed' (an expected failure, such as 'needs-login');
 * - `reason`: a short code or sentence;
 * - `wrote`: counts by kind, kinds from RUN_WRITE_KINDS -- what it changed,
 *   so "found nothing" and "changed the data" read differently;
 * - `model`: `{ name, inputTokens, outputTokens }` for a small-model run.
 *
 * A job that throws is recorded `failed` with the error message and the
 * scheduler goes on. A job returning nothing is an `ok` run that wrote
 * nothing. Cost in money is never reported: it is derived from the tokens.
 *
 * ## One run at a time, once per slot
 *
 * A schedule with a run in flight starts nothing on the next tick. A slot
 * that was attempted in this process is not attempted again even when its run
 * could not be recorded, so a broken disk does not become a loop.
 *
 * ## Waiting for what a schedule needs (ADR 0066)
 *
 * A due schedule that declares `needs` is asked for through `ready` before
 * it starts. While the answer is no, nothing runs and nothing is recorded:
 * the slot stays owed, and the first tick that finds the machine ready runs
 * it. A `ready` that throws counts as ready. `runNow` does not ask.
 */

import { dueSlot } from '../domain/derive/schedule.js';
import { errorMessage } from '../domain/error-message.js';

/**
 * @typedef {object} JobContext
 * @property {string} scheduleId
 * @property {import('../../personalos.config.js').RunStarter} startedBy
 * @property {Date} now
 * @property {string} timezone
 * @property {any} store
 */

/**
 * @typedef {object} JobResult
 * @property {'ok'|'failed'|'skipped'} [outcome]
 * @property {string} [reason]
 * @property {Record<string, number>} [wrote]
 * @property {{ name: string, inputTokens: number, outputTokens: number }} [model]
 */

/** @typedef {(context: JobContext) => Promise<JobResult | void>} Job */

/**
 * @param {object} options
 * @param {readonly import('../domain/types.js').Schedule[]} options.schedules
 * @param {Record<string, Job>} options.jobs
 * @param {{ getRuns: (options?: object) => Promise<any[]>, recordRun: (run: object) => Promise<any> }} options.store
 * @param {() => Date} options.clock
 * @param {string} options.timezone
 * @param {(need: string) => Promise<boolean>} [options.ready] whether the
 *   machine has what a schedule needs; everything is ready when not given
 * @param {(message: string, error?: unknown) => void} [options.log]
 */
export function createScheduler({ schedules, jobs, store, clock, timezone, ready = async () => true, log = defaultLog }) {
  for (const schedule of schedules) {
    if (typeof jobs[schedule.id] !== 'function') {
      throw new Error('schedule ' + schedule.id + ' has no job registered in lib/scheduler/jobs.js');
    }
  }

  /** @type {Set<string>} */
  const inFlight = new Set();
  /** @type {Map<string, number>} slot instant already attempted, by schedule */
  const attempted = new Map();

  /**
   * Whether the machine has what the schedule needs. Never throws: a need
   * that cannot be read does not hold a run back.
   *
   * @param {import('../domain/types.js').Schedule} schedule
   * @returns {Promise<boolean>}
   */
  async function hasWhatItNeeds(schedule) {
    if (schedule.needs === undefined) return true;
    try {
      return await ready(schedule.needs);
    } catch (error) {
      log('what ' + schedule.id + ' needs (' + schedule.needs + ') could not be read', error);
      return true;
    }
  }

  /**
   * Runs one schedule's job and records it. Never throws.
   *
   * @param {import('../domain/types.js').Schedule} schedule
   * @param {import('../../personalos.config.js').RunStarter} startedBy
   * @returns {Promise<any | null>} the recorded run, or null when it could not be recorded
   */
  async function execute(schedule, startedBy) {
    inFlight.add(schedule.id);
    const startedAt = clock();
        /** @type {JobResult} */
    let result;
    try {
      result = (await jobs[schedule.id]({ scheduleId: schedule.id, startedBy, now: startedAt, timezone, store })) ?? {};
    } catch (error) {
      result = { outcome: 'failed', reason: errorMessage(error) };
      log('schedule ' + schedule.id + ' failed', error);
    }
    try {
      return await store.recordRun({
        schedule: schedule.id,
        startedBy,
        engine: schedule.engine,
        startedAt: startedAt.toISOString(),
        durationMs: Math.max(0, clock().getTime() - startedAt.getTime()),
        outcome: result.outcome ?? 'ok',
        reason: result.reason ?? '',
        wrote: result.wrote ?? {},
        model: result.model?.name ?? null,
        inputTokens: result.model?.inputTokens ?? null,
        outputTokens: result.model?.outputTokens ?? null,
      });
    } catch (error) {
      log('the run of ' + schedule.id + ' could not be recorded', error);
      return null;
    } finally {
      inFlight.delete(schedule.id);
    }
  }

  return {
    /**
     * Asks every schedule whether it is due and runs the ones that are.
     * Resolves when those runs have finished.
     *
     * @returns {Promise<void>}
     */
    async tick() {
      const now = clock();
      const idle = schedules.filter((schedule) => !inFlight.has(schedule.id));
      const runs = await store.getRuns();
      const work = [];
      for (const schedule of idle) {
        if (inFlight.has(schedule.id)) continue;
        const last = runs.find((run) => run.schedule === schedule.id);
        const slot = dueSlot(schedule, last?.startedAt ?? null, now, timezone);
        if (slot === null || (attempted.get(schedule.id) ?? 0) >= slot.at.getTime()) continue;
        if (!(await hasWhatItNeeds(schedule))) continue;
        // Asking took time: another tick, or the user's button, may have started it.
        if (inFlight.has(schedule.id) || (attempted.get(schedule.id) ?? 0) >= slot.at.getTime()) continue;
        attempted.set(schedule.id, slot.at.getTime());
        work.push(execute(schedule, 'schedule'));
      }
      await Promise.all(work);
    },

    /**
     * Runs a schedule now, on request (the user's button, a Telegram
     * message). Resolves with the recorded run, or null when one is already
     * in flight or the record could not be written.
     *
     * @param {string} scheduleId
     * @param {'user'|'telegram'} startedBy
     * @returns {Promise<any | null>}
     */
    async runNow(scheduleId, startedBy) {
      const schedule = schedules.find((entry) => entry.id === scheduleId);
      if (schedule === undefined) throw new Error('unknown schedule ' + JSON.stringify(scheduleId));
      if (inFlight.has(scheduleId)) return null;
      return execute(schedule, startedBy);
    },

    /** @returns {string[]} the schedules with a run in flight */
    running() {
      return [...inFlight];
    },
  };
}

/**
 * @param {string} message
 * @param {unknown} [error]
 */
function defaultLog(message, error) {
  console.error('[scheduler] ' + message + (error === undefined ? '' : ': ' + (errorMessage(error))));
}
