/**
 * The only way into the data. Nothing else may reach storage.
 *
 * No component and no route handler reads or writes records directly: they
 * ask this module. That is the one architectural rule of the project, and it
 * is what makes the move from a JSON file to Postgres a rewrite of one
 * adapter instead of an archaeology expedition through every component.
 *
 * The functions below are the domain -- getTasks, createJournalEntry,
 * getTasksForPerson -- never storage primitives. If you find yourself wanting
 * to export the raw document from here, that is the signal that a domain
 * operation is missing.
 *
 * Server only: it reaches the filesystem and the environment.
 */

import { assertImplementsContract } from './adapters/contract.js';
import { jsonAdapter } from './adapters/json/index.js';

/**
 * Exactly one adapter is active per deployment. The database adapter of the
 * guide's full path plugs in here, implementing the same contract, and
 * nothing above this line changes.
 *
 * @type {import('./adapters/contract.js').StoreAdapter}
 */
const adapter = jsonAdapter;

assertImplementsContract(adapter);

/** Which storage is active. Useful in diagnostics, never in business logic. */
export const storageName = adapter.name;

export const getProfile = adapter.getProfile;
export const updateProfile = adapter.updateProfile;

export const getTasks = adapter.getTasks;
export const getTask = adapter.getTask;
export const createTask = adapter.createTask;
export const updateTask = adapter.updateTask;
export const deleteTask = adapter.deleteTask;

export const getPeople = adapter.getPeople;
export const getPerson = adapter.getPerson;
export const createPerson = adapter.createPerson;
export const updatePerson = adapter.updatePerson;

export const getGoals = adapter.getGoals;
export const getGoal = adapter.getGoal;
export const createGoal = adapter.createGoal;
export const updateGoal = adapter.updateGoal;
export const deleteGoal = adapter.deleteGoal;

export const getLinks = adapter.getLinks;
export const createLink = adapter.createLink;
export const deleteLink = adapter.deleteLink;
export const deleteLinksFor = adapter.deleteLinksFor;

export const getCaptures = adapter.getCaptures;
export const getCapture = adapter.getCapture;
export const createCapture = adapter.createCapture;
export const deleteCapture = adapter.deleteCapture;

export const getMemoryEntries = adapter.getMemoryEntries;
export const createMemoryEntry = adapter.createMemoryEntry;
export const updateMemoryEntry = adapter.updateMemoryEntry;
export const deleteMemoryEntry = adapter.deleteMemoryEntry;

export const getJournalEntries = adapter.getJournalEntries;
export const getJournalEntry = adapter.getJournalEntry;
export const createJournalEntry = adapter.createJournalEntry;
export const updateJournalEntry = adapter.updateJournalEntry;
export const deleteJournalEntry = adapter.deleteJournalEntry;

export const getEvents = adapter.getEvents;
export const recordEvent = adapter.recordEvent;

export const getDailyLog = adapter.getDailyLog;
export const updateDailyLog = adapter.updateDailyLog;
export const getDailyLogs = adapter.getDailyLogs;

export const getAccounts = adapter.getAccounts;
export const createAccount = adapter.createAccount;
export const updateAccount = adapter.updateAccount;

export const getObservations = adapter.getObservations;
export const recordObservation = adapter.recordObservation;

export const getTransactions = adapter.getTransactions;
export const createTransaction = adapter.createTransaction;
export const updateTransaction = adapter.updateTransaction;
export const deleteTransaction = adapter.deleteTransaction;
export const upsertTransactionByOrigin = adapter.upsertTransactionByOrigin;

export const getSnapshots = adapter.getSnapshots;
export const recordSnapshot = adapter.recordSnapshot;

export const getSyncStates = adapter.getSyncStates;
export const updateSyncState = adapter.updateSyncState;

/** Throws the working data away and starts again from the seed. */
export const resetToSeed = adapter.reset;

/** Where the active adapter's data lives, safe to print. */
export const describeStorage = adapter.describeStorage;

/* -------------------------------------------------------------------------
 * Graph traversals
 *
 * Relations live in links, which is one place to look but a join to read.
 * These helpers exist so a component never writes that join itself: it asks
 * for the tasks of a person, not for links with rel "involves".
 * ---------------------------------------------------------------------- */

/**
 * Everything a reference points at through a relation.
 *
 * @param {string} from reference
 * @param {string} rel one of LINK_RELS
 * @returns {Promise<string[]>} references
 */
export async function getRelated(from, rel) {
  return (await getLinks({ from, rel })).map((link) => link.to);
}

/**
 * Everything that points at a reference through a relation. The other
 * direction, which is the one a grouping view usually needs.
 *
 * @param {string} to reference
 * @param {string} rel one of LINK_RELS
 * @returns {Promise<string[]>} references
 */
export async function getReferrers(to, rel) {
  return (await getLinks({ to, rel })).map((link) => link.from);
}

/**
 * The tasks owed to a person. The CRM groups by this on every render, which
 * is why it is a named operation rather than a join a component improvises.
 *
 * @param {string} personId
 * @returns {Promise<import('./domain/types.js').Task[]>}
 */
export async function getTasksForPerson(personId) {
  const taskIds = new Set(await getReferrers(personId, 'involves'));
  return (await getTasks()).filter((task) => taskIds.has(task.id));
}

/**
 * The person a task is owed to, or null. The inverse of the above.
 *
 * @param {string} taskId
 * @returns {Promise<import('./domain/types.js').Person | null>}
 */
export async function getPersonForTask(taskId) {
  const [personId] = await getRelated(taskId, 'involves');
  return personId === undefined ? null : getPerson(personId);
}

/**
 * The tasks that serve a goal, directly.
 *
 * @param {string} goalId
 * @returns {Promise<import('./domain/types.js').Task[]>}
 */
export async function getTasksForGoal(goalId) {
  const taskIds = new Set(await getReferrers(goalId, 'belongs_to'));
  return (await getTasks()).filter((task) => taskIds.has(task.id));
}

/**
 * What a memory was extracted from. A memory that cannot answer this should
 * not have been written: see createMemoryEntry.
 *
 * @param {string} memoryId
 * @returns {Promise<string | null>} reference to the origin
 */
export async function getMemoryOrigin(memoryId) {
  const [origin] = await getRelated(memoryId, 'derived_from');
  return origin ?? null;
}

/**
 * The record a capture produced, if its destination is one that gets a real
 * record and that record still exists. `about` holds at most one link per
 * capture -- the capture route only ever creates one. Shared by the capture
 * log drawer's read (#20) and its corrective actions (#21, #22, #23), so
 * "what did this capture produce" has one answer.
 *
 * @param {import('./domain/types.js').Capture} capture
 * @returns {Promise<import('./domain/types.js').Task | import('./domain/types.js').Goal | null>}
 */
export async function getCaptureProducedRecord(capture) {
  const [producedId] = await getRelated(capture.id, 'about');
  if (producedId === undefined) return null;
  if (capture.destination === 'task') return getTask(producedId);
  if (capture.destination === 'goals') return getGoal(producedId);
  return null;
}

/**
 * Whether a task or goal a capture produced has been touched since creation
 * -- by an edit, or by being finished. A task and a goal spell "finished"
 * differently (`completedAt` vs `done`), so this checks both rather than
 * assuming one shape. Undo and Refile (#22, #23) refuse to act once this is
 * true: the user's own work on the record outranks a correction made from
 * the capture log (ADR-0013).
 *
 * @param {import('./domain/types.js').Task | import('./domain/types.js').Goal} record
 * @returns {boolean}
 */
export function isCaptureRecordLocked(record) {
  if (record.updatedAt !== record.createdAt) return true;
  return 'completedAt' in record ? record.completedAt !== null : record.done === true;
}

/**
 * Deletes the record a capture produced, if it has one, along with the
 * `about` link that pointed at it. Shared by Delete, Undo and Refile
 * (#21-#23): all three start by retracting whatever the capture currently
 * produced; only Refile goes on to file a new one.
 *
 * @param {import('./domain/types.js').Capture} capture
 * @returns {Promise<void>}
 */
async function retractProducedRecord(capture) {
  const record = await getCaptureProducedRecord(capture);
  if (record === null) return;
  if (capture.destination === 'task') await deleteTask(record.id);
  else if (capture.destination === 'goals') await deleteGoal(record.id);
}

/**
 * Removes a capture entirely: the sentence, its memory entry, the record it
 * produced (if any), and every link between them. The one correction with
 * no way back (ADR-0013) -- the confirmation step lives in the UI, not here.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteCaptureCascade(id) {
  const capture = await getCapture(id);
  if (capture === null) throw new Error('no capture with id ' + id);

  await retractProducedRecord(capture);

  const memoryIds = await getReferrers(capture.id, 'derived_from');
  for (const memoryId of memoryIds) {
    await deleteMemoryEntry(memoryId);
  }

  await deleteCapture(capture.id);
  await recordEvent({
    type: 'capture.deleted',
    subject: capture.id,
    source: 'user',
    payload: { text: capture.text, destination: capture.destination },
  });
}
