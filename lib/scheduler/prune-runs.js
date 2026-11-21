/**
 * The nightly removal of runs older than the retention (ADR 0063): the one
 * schedule that ships with the scheduler, real and harmless, so the whole
 * path -- due, run, record -- is exercised with no sync and no Telegram.
 */

import { limits } from '../../personalos.config.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @type {import('./scheduler.js').Job} */
export async function pruneRunsJob({ now, store }) {
  const cutoff = new Date(now.getTime() - limits.runRetentionDays * MS_PER_DAY);
  const removed = await store.removeRunsBefore(cutoff.toISOString());
  return { wrote: { runs: removed } };
}
