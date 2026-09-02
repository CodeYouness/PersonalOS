/**
 * The contract every storage adapter must satisfy.
 *
 * The guide's one architectural rule is that all reads and writes go through
 * a single module, so that swapping a JSON file for Postgres is a rewrite of
 * that module and not of the application. This file is what makes the rule
 * enforceable rather than aspirational: it names the operations in terms of
 * the domain -- getTasks, createTask -- never in terms of storage, and the
 * shared test suite in tests/store/ runs against any adapter that claims to
 * implement it.
 *
 * When the Supabase adapter arrives, it implements this list and the existing
 * suite tells you whether it is equivalent. Nothing above the adapter needs
 * to know which one is loaded.
 */

/**
 * @typedef {import('../domain/types.js')} DomainTypes
 */

/**
 * @typedef {object} StoreAdapter
 * @property {string} name
 *
 * @property {() => Promise<import('../domain/types.js').Profile>} getProfile
 * @property {(patch: Partial<import('../domain/types.js').Profile>) => Promise<import('../domain/types.js').Profile>} updateProfile
 *
 * @property {() => Promise<import('../domain/types.js').Task[]>} getTasks
 * @property {(id: string) => Promise<import('../domain/types.js').Task | null>} getTask
 * @property {(input: object) => Promise<import('../domain/types.js').Task>} createTask
 * @property {(id: string, patch: object) => Promise<import('../domain/types.js').Task>} updateTask
 * @property {(id: string) => Promise<void>} deleteTask
 *
 * @property {() => Promise<import('../domain/types.js').Person[]>} getPeople
 * @property {(id: string) => Promise<import('../domain/types.js').Person | null>} getPerson
 * @property {(input: object) => Promise<import('../domain/types.js').Person>} createPerson
 * @property {(id: string, patch: object) => Promise<import('../domain/types.js').Person>} updatePerson
 *
 * @property {(options?: { limit?: number }) => Promise<import('../domain/types.js').Capture[]>} getCaptures
 * @property {(input: object) => Promise<import('../domain/types.js').Capture>} createCapture
 *
 * @property {(options?: { limit?: number }) => Promise<import('../domain/types.js').MemoryEntry[]>} getMemoryEntries
 * @property {(input: object) => Promise<import('../domain/types.js').MemoryEntry>} createMemoryEntry
 *
 * @property {(dayKey: string) => Promise<import('../domain/types.js').DailyLog>} getDailyLog
 * @property {(dayKey: string, patch: object) => Promise<import('../domain/types.js').DailyLog>} updateDailyLog
 * @property {(from: string, to: string) => Promise<import('../domain/types.js').DailyLog[]>} getDailyLogs
 *
 * @property {() => Promise<import('../domain/types.js').Goals>} getGoals
 * @property {(patch: object) => Promise<import('../domain/types.js').Goals>} updateGoals
 *
 * @property {(options?: { limit?: number }) => Promise<import('../domain/types.js').ActivityEntry[]>} getActivity
 * @property {(input: object) => Promise<import('../domain/types.js').ActivityEntry>} recordActivity
 *
 * @property {() => Promise<void>} reset
 */

/**
 * Every method a StoreAdapter must expose. Kept as data so it can be asserted
 * at load time and iterated by the shared test suite.
 *
 * @type {readonly string[]}
 */
export const ADAPTER_METHODS = Object.freeze([
  'getProfile',
  'updateProfile',
  'getTasks',
  'getTask',
  'createTask',
  'updateTask',
  'deleteTask',
  'getPeople',
  'getPerson',
  'createPerson',
  'updatePerson',
  'getCaptures',
  'createCapture',
  'getMemoryEntries',
  'createMemoryEntry',
  'getDailyLog',
  'updateDailyLog',
  'getDailyLogs',
  'getGoals',
  'updateGoals',
  'getActivity',
  'recordActivity',
  'reset',
]);

/**
 * Fails loudly at load time rather than at the first call from a card.
 *
 * @param {Record<string, unknown>} adapter
 * @returns {void}
 */
export function assertImplementsContract(adapter) {
  const missing = ADAPTER_METHODS.filter((method) => typeof adapter[method] !== 'function');
  if (missing.length > 0) {
    throw new Error(
      'storage adapter ' +
        String(adapter.name ?? 'unknown') +
        ' does not implement: ' +
        missing.join(', ')
    );
  }
}
