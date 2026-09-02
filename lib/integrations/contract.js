/**
 * The integration layer.
 *
 * PersonalOS never depends on a particular external service. An integration
 * imports from the domain and produces domain records; the domain imports
 * nothing from integrations. That direction is the whole rule, and it is what
 * lets a provider be replaced without the core noticing.
 *
 *   Integration  ->  Provider  ->  domain records  ->  lib/store.js
 *
 * A second rule, less obvious and more expensive to learn the hard way: an
 * MCP server is a tool for an AGENT, not a library for a web app. The
 * dashboard does not call an integration while rendering. A sync runs
 * separately -- from a script, a scheduled job, or an agent session -- and
 * writes records. The cards then read the last saved record, exactly as they
 * read the last saved anything. This keeps credentials out of the web app and
 * keeps page loads free.
 */

/**
 * What every synced record carries so its provenance is never lost.
 *
 * The pair (source, externalId) is the deduplication key: running an import
 * twice must update, not double. It is also what lets a live source supersede
 * a stale hand-entered row instead of sitting beside it and double counting.
 *
 * @typedef {import('../domain/types.js').ExternalOrigin} ExternalOrigin
 */

/**
 * @typedef {object} SyncResult
 * @property {number} written records created or updated
 * @property {number} skipped records already up to date
 * @property {string[]} warnings things a human should read
 * @property {string} syncedAt ISO instant
 */

/**
 * @typedef {object} SyncContext
 * @property {typeof import('../store.js')} store the only way to write
 * @property {string} timezone the user's zone, for day keys
 * @property {string} baseCurrency
 */

/**
 * @typedef {object} Integration
 * @property {string} name stable identifier; also the `source` on records
 * @property {'portfolio'|'transactions'|'calendar'|'health'} kind
 * @property {() => boolean} isConfigured true when its credentials are present
 * @property {(context: SyncContext) => Promise<SyncResult>} sync
 */

/**
 * A provider turns one external shape into domain records. Integrations are
 * about credentials and transport; providers are about meaning.
 *
 * @typedef {object} PortfolioProvider
 * @property {string} name
 * @property {() => Promise<{ accounts: object[], observations: object[] }>} fetchPositions
 */

/**
 * @typedef {object} TransactionProvider
 * @property {string} name
 * @property {(from: string, to: string) => Promise<object[]>} fetchTransactions
 */

/** @type {readonly string[]} */
export const INTEGRATION_KINDS = Object.freeze([
  'portfolio',
  'transactions',
  'calendar',
  'health',
]);

/** @type {readonly string[]} */
const REQUIRED_METHODS = Object.freeze(['isConfigured', 'sync']);

/**
 * Fails at registration rather than at 3am inside a scheduled sync.
 *
 * @param {Record<string, any>} integration
 * @returns {void}
 */
export function assertIsIntegration(integration) {
  const name = typeof integration.name === 'string' ? integration.name : 'unnamed';
  if (!INTEGRATION_KINDS.includes(integration.kind)) {
    throw new Error(
      'integration ' + name + ' has kind ' + String(integration.kind) +
        '; expected one of ' + INTEGRATION_KINDS.join(', ')
    );
  }
  const missing = REQUIRED_METHODS.filter((method) => typeof integration[method] !== 'function');
  if (missing.length > 0) {
    throw new Error('integration ' + name + ' does not implement: ' + missing.join(', '));
  }
}
