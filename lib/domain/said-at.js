import { limits } from '../../personalos.config.js';

/** An ISO 8601 instant that states its offset: the phone sends one, a bare local time is ambiguous. */
const INSTANT_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * The one rule for a client-supplied "when was this said" (ADR 0033), shared
 * by the capture route and the journal route.
 *
 * - absent: now;
 * - any instant in the past: accepted, however old -- refusing one would lose
 *   the sentence (rule 2);
 * - up to `limits.saidAtDriftMinutes` ahead: clock drift, which is now;
 * - further ahead, or not an ISO instant with an offset: refused.
 *
 * `saidAt: null` means "now", so the caller leaves the store to stamp it and
 * the capture's `saidAt` equals its `createdAt`.
 *
 * @param {unknown} value
 * @param {Date} [now] injectable so a test never reads the machine clock
 * @returns {{ ok: true, saidAt: string | null } | { ok: false, error: string }}
 */
export function resolveSaidAt(value, now = new Date()) {
  if (value === undefined || value === null) return { ok: true, saidAt: null };
  if (typeof value !== 'string' || !INSTANT_WITH_OFFSET.test(value) || Number.isNaN(Date.parse(value))) {
    return { ok: false, error: 'saidAt must be an ISO instant with an offset, like 2026-09-10T08:30:00+02:00' };
  }
  const instant = new Date(value);
  const driftMs = limits.saidAtDriftMinutes * 60 * 1000;
  if (instant.getTime() > now.getTime() + driftMs) {
    return { ok: false, error: 'saidAt is in the future' };
  }
  return { ok: true, saidAt: instant.getTime() > now.getTime() ? null : instant.toISOString() };
}

/**
 * Whether a capture or entry was said noticeably before it was written --
 * queued on the phone, say -- so a surface shows both times. Within the same
 * drift `resolveSaidAt` treats as now, it was said when it was written.
 *
 * @param {{ createdAt: string, saidAt: string }} item
 */
export function wasSaidEarlier({ createdAt, saidAt }) {
  const gapMs = new Date(createdAt).getTime() - new Date(saidAt).getTime();
  return gapMs > limits.saidAtDriftMinutes * 60 * 1000;
}
