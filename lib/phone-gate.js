/**
 * The phone gate (ticket #228, ADR 0032): the one check the routes that
 * `tailscale serve` exposes make before they read or write anything.
 *
 * A request is proxied when it carries a header the proxy adds. A proxied
 * request needs `Authorization: Bearer <PERSONALOS_PHONE_TOKEN>`; with no
 * token configured it is refused outright -- the gate fails closed. A
 * request without those headers is the Mac's own browser and passes: only a
 * process on the Mac can forge them, and it can already read the data file.
 *
 * Called by every handler under the paths `tailscale serve` exposes: capture
 * and journal, plus the capture log (/api/captures, its [id] and undo
 * routes) and a receipt line's undo (/api/actions/[id]/undo). The log is not
 * meant for the phone; the gate is defence in depth, so a mis-typed
 * `tailscale serve` path cannot open it.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { env } from './config/env.js';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Proxied when `tailscale serve` left its mark: a `Tailscale-User-*` header,
 * or an `X-Forwarded-For` naming an address off the Mac (the phone's
 * tailnet address). The header alone proves nothing: Next's own server sets
 * it to the socket's address on every request that arrives without one, so
 * the Mac's own browser reaches the handler forwarded for loopback.
 *
 * @param {Headers} headers
 */
function isProxied(headers) {
  for (const name of headers.keys()) {
    if (name.startsWith('tailscale-user-')) return true;
  }
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded === null) return false;
  return forwarded.split(',').some((address) => !LOOPBACK.has(address.trim()));
}

/**
 * Compared as SHA-256 digests, so the length of the token is not learned
 * from how long the comparison takes.
 *
 * @param {string} given
 * @param {string} expected
 */
function sameToken(given, expected) {
  const digest = (/** @type {string} */ value) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Call at the top of a handler. Returns the 401 to send back, or null when
 * the request may go on.
 *
 * @param {Request} request
 * @param {string | null} [token] the configured token; the environment's by default
 * @returns {Response | null}
 */
export function refuseUnlessAllowed(request, token = env.phoneToken) {
  if (!isProxied(request.headers)) return null;

  const match = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '');
  if (token !== null && match !== null && sameToken(match[1].trim(), token)) return null;

  return Response.json({ error: 'unauthorized' }, { status: 401 });
}
