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
 *
 * lib/store.js re-exports every method below as a bare, detached reference
 * (`export const getTasks = adapter.getTasks`), which is what lets it stay a
 * flat list of functions instead of a wrapper object. That only works because
 * the JSON adapter never reads `this` -- every method closes over module-level
 * state in lib/adapters/json/file.js instead. An adapter that needs `this`
 * (a class wrapping a client, say) must bind its own methods before exporting
 * them (arrow-function fields, or binding in its constructor); the contract
 * does not do it for you.
 */

/**
 * @typedef {import('../domain/types.js').Link} Link
 * @typedef {import('../domain/types.js').Event} Event
 * @typedef {import('../domain/types.js').JournalEntry} JournalEntry
 * @typedef {import('../domain/types.js').MemoryEntry} MemoryEntry
 * @typedef {import('../domain/types.js').Task} Task
 * @typedef {import('../domain/types.js').Appointment} Appointment
 * @typedef {import('../domain/types.js').Person} Person
 * @typedef {import('../domain/types.js').Goal} Goal
 * @typedef {import('../domain/types.js').Capture} Capture
 * @typedef {import('../domain/types.js').Profile} Profile
 * @typedef {import('../domain/types.js').Habit} Habit
 * @typedef {import('../domain/types.js').DailyLog} DailyLog
 * @typedef {import('../domain/types.js').Meal} Meal
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
 * @property {(input: { label: string, type: 'check' | 'counter', target: number | null }) => Promise<Habit>} createHabit
 *   appends a habit with a server-assigned id and one period open at today.
 * @property {(id: string, patch: { label?: string, target?: number, archived?: boolean }) => Promise<Habit>} updateHabit
 *   `type` is not patchable -- it decides how every logged day is read.
 *   `archived` is not stored: true closes the open period at today, false
 *   opens a new one (ADR 0015), and either is a no-op when already so.
 * @property {(ids: string[]) => Promise<Habit[]>} reorderHabits
 *   the array is the order; `ids` must be an exact permutation of the
 *   existing ids, so a reorder can neither drop nor invent a habit.
 *
 * @property {() => Promise<Task[]>} getTasks
 * @property {(id: string) => Promise<Task | null>} getTask
 * @property {(input: object) => Promise<Task>} createTask
 * @property {(id: string, patch: object) => Promise<Task>} updateTask
 * @property {(id: string) => Promise<void>} deleteTask
 *
 * @property {() => Promise<Appointment[]>} getAppointments
 * @property {(id: string) => Promise<Appointment | null>} getAppointment
 * @property {(input: object) => Promise<Appointment>} createAppointment
 * @property {(id: string, patch: object) => Promise<Appointment>} updateAppointment
 * @property {(id: string) => Promise<void>} deleteAppointment
 * @property {(input: object) => Promise<Appointment>} upsertAppointmentByOrigin
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
 * @property {(id: string) => Promise<Capture | null>} getCapture
 * @property {(input: object) => Promise<Capture>} createCapture
 * @property {(id: string, patch: object) => Promise<Capture>} updateCapture
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
 * @property {(input: object) => Promise<Meal>} createMeal adds one meal to
 *   the day in `input.date` (a day key no later than today); numbers are
 *   non-negative integers or null, time HH:MM or null
 * @property {(id: string) => Promise<Meal | null>} getMeal finds the meal in
 *   whichever day holds it
 * @property {(id: string, patch: object) => Promise<Meal>} updateMeal a hand
 *   correction: name, time and the four numbers; a macro change recomputes
 *   calories unless calories are in the same patch; always clears
 *   `estimated`
 * @property {(id: string) => Promise<void>} deleteMeal removes the meal and
 *   every link to or from it
 * @property {(input: { date: string, habitId: string, value: boolean | number }) => Promise<DailyLog>} logHabitValue
 *   writes one habit's value for one day, atomically merged into that day's
 *   habits record so two habits logged at once never clobber each other;
 *   rejects an unknown habit, a wrong value type, a future day, and a day the
 *   habit was not active. Records `habit.ticked` exactly when this write
 *   moves the habit's day from not complete to complete.
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
 * @property {() => string} describeStorage a human-readable location for this
 *   adapter's data, safe to print (e.g. a file path); never a credential
 */

/**
 * Every method a StoreAdapter must expose. Kept as data so it can be asserted
 * at load time and iterated by the shared test suite.
 *
 * @type {readonly string[]}
 */
export const ADAPTER_METHODS = Object.freeze([
  'getProfile', 'updateProfile',
  'createHabit', 'updateHabit', 'reorderHabits',
  'getTasks', 'getTask', 'createTask', 'updateTask', 'deleteTask',
  'getAppointments', 'getAppointment', 'createAppointment', 'updateAppointment', 'deleteAppointment',
  'upsertAppointmentByOrigin',
  'getPeople', 'getPerson', 'createPerson', 'updatePerson',
  'getGoals', 'getGoal', 'createGoal', 'updateGoal', 'deleteGoal',
  'getLinks', 'createLink', 'deleteLink', 'deleteLinksFor',
  'getCaptures', 'getCapture', 'createCapture', 'updateCapture', 'deleteCapture',
  'getMemoryEntries', 'createMemoryEntry', 'updateMemoryEntry', 'deleteMemoryEntry',
  'getJournalEntries', 'getJournalEntry', 'createJournalEntry', 'updateJournalEntry',
  'deleteJournalEntry',
  'getEvents', 'recordEvent',
  'getDailyLog', 'updateDailyLog', 'getDailyLogs', 'logHabitValue',
  'createMeal', 'getMeal', 'updateMeal', 'deleteMeal',
  'getAccounts', 'createAccount', 'updateAccount',
  'getObservations', 'recordObservation',
  'getTransactions', 'createTransaction', 'updateTransaction', 'deleteTransaction',
  'upsertTransactionByOrigin',
  'getSnapshots', 'recordSnapshot',
  'getSyncStates', 'updateSyncState',
  'reset', 'describeStorage',
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
