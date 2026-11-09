import { limits } from '../../personalos.config.js';

/**
 * The one rule for a client-supplied `clientId` (ADR 0033), shared by the
 * capture route and the journal route: an optional short string the client
 * makes once per sentence, so a resend is recognised and filed once.
 *
 * - absent: no `clientId`, and the sentence is never deduplicated;
 * - a non-blank string of at most `limits.clientIdMaxLength` characters:
 *   kept exactly as sent;
 * - anything else: refused.
 *
 * @param {unknown} value
 * @returns {{ ok: true, clientId: string | null } | { ok: false, error: string }}
 */
export function resolveClientId(value) {
  if (value === undefined || value === null) return { ok: true, clientId: null };
  if (typeof value !== 'string' || value.trim() === '' || value.length > limits.clientIdMaxLength) {
    return { ok: false, error: 'clientId must be a string of 1 to ' + limits.clientIdMaxLength + ' characters' };
  }
  return { ok: true, clientId: value };
}
