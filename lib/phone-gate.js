/**
 * The phone gate (ticket #228, ADR 0032): the one check the routes that
 * `tailscale serve` exposes make before they read or write anything.
 *
 * A request is proxied when it carries a header the proxy adds. A proxied
 * request needs `Authorization: Bearer <PERSONALOS_PHONE_TOKEN>`; with no
 * token configured it is refused outright -- the gate fails closed. A
 * request without those headers is the Mac's own browser and passes: only a
 * process on the Mac can forge them, and it can already read the data file.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

import { env } from './config/env.js';

/** @param {Headers} headers */
function isProxied(headers) {
  if (headers.has('x-forwarded-for')) return true;
  for (const name of headers.keys()) {
    if (name.startsWith('tailscale-user-')) return true;
  }
  return false;
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
