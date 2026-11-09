/**
 * Origins: who a record was copied from (ADR 0031). One predicate and one
 * constructor, so "is this account the broker's" and "what does a synced
 * origin look like" each have one answer.
 */

import { ORIGIN_SOURCES } from '../../personalos.config.js';

/**
 * An account with an origin is synced: its trades, prices and balances belong
 * to its source. The seed's `demo` origin is sample data, not a source: a demo
 * account is hand-made in every way that matters.
 *
 * @param {{ origin: { source: string } | null } | null | undefined} account
 * @returns {boolean}
 */
export function isSyncedAccount(account) {
  const origin = account?.origin;
  return origin !== null && origin !== undefined && origin.source !== ORIGIN_SOURCES.demo;
}

/**
 * The origin a sync or importer stamps on what it writes.
 *
 * @param {string} source one of ORIGIN_SOURCES
 * @param {string} externalId
 * @returns {import('./types.js').ExternalOrigin}
 */
export function syncedOrigin(source, externalId) {
  return { source, externalId, syncedAt: new Date().toISOString(), sourceUpdatedAt: null };
}
