/**
 * The contract every storage adapter must satisfy.
 *
 * The one architectural rule of this project is that all reads and writes go
 * through a single module, so that swapping a JSON file for Postgres is a
 * rewrite of that module and not of the application. This file is what makes
 * the rule checkable rather than aspirational: it names the operations in
 * terms of the domain -- getTasks, createLink, getDailyLog -- never in terms
 * of storage, and the shared suite in tests/store/ runs against any adapter
 * claiming to implement it.
 *
 * When the Supabase adapter arrives, it implements this list and the existing
 * suite answers "is it equivalent?" directly. Nothing above the adapter needs
 * to know which one is loaded.
 */

/**
 * @typedef {import('../domain/types.js').Link} Link
 * @typedef {import('../domain/types.js').Event} Event
 * @typedef {import('../domain/types.js').JournalEntry} JournalEntry
 * @typedef {import('../domain/types.js').MemoryEntry} MemoryEntry
 * @typedef {import('../domain/types.js').Task} Task
 * @typedef {import('../domain/types.js').Person} Person
 * @typedef {import('../domain/types.js').Goal} Goal
 * @typedef {import('../domain/types.js').Capture} Capture
 * @typedef {import('../domain/types.js').Profile} Profile
 * @typedef {import('../domain/types.js').DailyLog} DailyLog
 * @typedef {import('../domain/types.js').FinanceAccount} FinanceAccount
 * @typedef {import('../domain/types.js').FinanceObservation} FinanceObservation
 * @typedef {import('../domain/types.js').Transaction} Transaction
 * @typedef {import('../domain/types.js').NetWorthSnapshot} NetWorthSnapshot
 * @typedef {import('../domain/types.js').SyncState} SyncState
 */

/**
 * @typedef {object} LinkQuery
 * @property {string} [from] reference
 * @property {string} [to] reference
 * @property {string} [rel] one of LINK_RELS
 */

/**
 * @typedef {object} StoreAdapter
 * @property {string} name
 *
 * @property {() => Promise<Profile>} getProfile
 * @property {(patch: Partial<Profile>) => Promise<Profile>} updateProfile
 *
 * @property {() => Promise<Task[]>} getTasks
 * @property {(id: string) => Promise<Task | null>} getTask
 * @property {(input: object) => Promise<Task>} createTask
 * @property {(id: string, patch: object) => Promise<Task>} updateTask
 * @property {(id: string) => Promise<void>} deleteTask
 *
 * @property {() => Promise<Person[]>} getPeople
 * @property {(id: string) => Promise<Person | null>} getPerson
 * @property {(input: object) => Promise<Person>} createPerson
 * @property {(id: string, patch: object) => Promise<Person>} updatePerson
 *
 * @property {() => Promise<Goal[]>} getGoals
 * @property {(id: string) => Promise<Goal | null>} getGoal
 * @property {(input: object) => Promise<Goal>} createGoal
 * @property {(id: string, patch: object) => Promise<Goal>} updateGoal
 * @property {(id: string) => Promise<void>} deleteGoal
 *
 * @property {(query: LinkQuery) => Promise<Link[]>} getLinks
 * @property {(input: object) => Promise<Link>} createLink
 * @property {(id: string) => Promise<void>} deleteLink
 * @property {(ref: string) => Promise<void>} deleteLinksFor
 *
 * @property {(options?: { limit?: number }) => Promise<Capture[]>} getCaptures
 * @property {(input: object) => Promise<Capture>} createCapture
 * @property {(id: string) => Promise<void>} deleteCapture
 *
 * @property {(options?: { limit?: number, type?: string }) => Promise<MemoryEntry[]>} getMemoryEntries
 * @property {(input: object) => Promise<MemoryEntry>} createMemoryEntry
 * @property {(id: string, patch: object) => Promise<MemoryEntry>} updateMemoryEntry
 * @property {(id: string) => Promise<void>} deleteMemoryEntry
 *
 * @property {(from: string, to: string) => Promise<JournalEntry[]>} getJournalEntries
 * @property {(id: string) => Promise<JournalEntry | null>} getJournalEntry
 * @property {(input: object) => Promise<JournalEntry>} createJournalEntry
 * @property {(id: string, patch: object) => Promise<JournalEntry>} updateJournalEntry
 * @property {(id: string) => Promise<void>} deleteJournalEntry
 *
 * @property {(options?: { from?: string, to?: string, limit?: number }) => Promise<Event[]>} getEvents
 * @property {(input: object) => Promise<Event>} recordEvent
 *
 * @property {(dayKey: string) => Promise<DailyLog>} getDailyLog
 * @property {(dayKey: string, patch: object) => Promise<DailyLog>} updateDailyLog
 * @property {(from: string, to: string) => Promise<DailyLog[]>} getDailyLogs
 *
 * @property {() => Promise<FinanceAccount[]>} getAccounts
 * @property {(input: object) => Promise<FinanceAccount>} createAccount
 * @property {(id: string, patch: object) => Promise<FinanceAccount>} updateAccount
 *
 * @property {(options?: { accountId?: string, from?: string, to?: string }) => Promise<FinanceObservation[]>} getObservations
 * @property {(input: object) => Promise<FinanceObservation>} recordObservation
 *
 * @property {(options?: { from?: string, to?: string, limit?: number }) => Promise<Transaction[]>} getTransactions
 * @property {(input: object) => Promise<Transaction>} createTransaction
 * @property {(id: string, patch: object) => Promise<Transaction>} updateTransaction
 * @property {(id: string) => Promise<void>} deleteTransaction
 * @property {(input: object) => Promise<Transaction>} upsertTransactionByOrigin
 *
 * @property {(options?: { limit?: number }) => Promise<NetWorthSnapshot[]>} getSnapshots
 * @property {(input: object) => Promise<NetWorthSnapshot>} recordSnapshot
 *
 * @property {() => Promise<SyncState[]>} getSyncStates
 * @property {(integration: string, patch: object) => Promise<SyncState>} updateSyncState
 *
 * @property {() => Promise<string | null>} reset throws the working data away
 *   and rebuilds it from the seed; returns where the discarded data was
 *   backed up, or null when there was nothing to protect
 */

/**
 * Every method a StoreAdapter must expose. Kept as data so it can be asserted
 * at load time and iterated by the shared test suite.
 *
 * @type {readonly string[]}
 */
export const ADAPTER_METHODS = Object.freeze([
  'getProfile', 'updateProfile',
  'getTasks', 'getTask', 'createTask', 'updateTask', 'deleteTask',
  'getPeople', 'getPerson', 'createPerson', 'updatePerson',
  'getGoals', 'getGoal', 'createGoal', 'updateGoal', 'deleteGoal',
  'getLinks', 'createLink', 'deleteLink', 'deleteLinksFor',
  'getCaptures', 'createCapture', 'deleteCapture',
  'getMemoryEntries', 'createMemoryEntry', 'updateMemoryEntry', 'deleteMemoryEntry',
  'getJournalEntries', 'getJournalEntry', 'createJournalEntry', 'updateJournalEntry',
  'deleteJournalEntry',
  'getEvents', 'recordEvent',
  'getDailyLog', 'updateDailyLog', 'getDailyLogs',
  'getAccounts', 'createAccount', 'updateAccount',
  'getObservations', 'recordObservation',
  'getTransactions', 'createTransaction', 'updateTransaction', 'deleteTransaction',
  'upsertTransactionByOrigin',
  'getSnapshots', 'recordSnapshot',
  'getSyncStates', 'updateSyncState',
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
