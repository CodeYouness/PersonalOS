/**
 * Everything the context is made of, read through the store and nowhere
 * else (rule 1). Reads only: building a context never writes.
 *
 * NO SILENT TRUNCATION. "Not in your data" is a claim about the whole
 * archive, so every collection is read whole: none of the getters below is
 * given a `limit` or a window, and the two that are keyed by day -- the
 * journal and the daily logs -- are asked for every day that exists. A
 * record missing here would make that claim a lie.
 */

import {
  getAccounts,
  getAppointments,
  getCaptures,
  getDailyLogs,
  getEvents,
  getGoals,
  getJournalEntries,
  getLinks,
  getLoggedDays,
  getMemoryEntries,
  getObservations,
  getPeople,
  getPrices,
  getProfile,
  getSnapshots,
  getTasks,
  getTrades,
  getTransactions,
} from '../../store.js';

// The journal is asked by range; these bound every day key there can be.
const FIRST_DAY = '1000-01-01';
const LAST_DAY = '9999-12-31';

/**
 * @typedef {object} Archive every record the screens show, as stored
 * @property {import('../../domain/types.js').Profile} profile
 * @property {import('../../domain/types.js').Task[]} tasks
 * @property {import('../../domain/types.js').Appointment[]} appointments
 * @property {import('../../domain/types.js').Person[]} people
 * @property {import('../../domain/types.js').Goal[]} goals
 * @property {import('../../domain/types.js').Link[]} links
 * @property {import('../../domain/types.js').Capture[]} captures
 * @property {import('../../domain/types.js').MemoryEntry[]} memories
 * @property {import('../../domain/types.js').JournalEntry[]} journal
 * @property {import('../../domain/types.js').Event[]} events
 * @property {import('../../domain/types.js').DailyLog[]} logs only the days that hold a log
 * @property {import('../../domain/types.js').FinanceAccount[]} accounts
 * @property {import('../../domain/types.js').FinanceObservation[]} observations
 * @property {import('../../domain/types.js').Trade[]} trades
 * @property {import('../../domain/types.js').Price[]} prices
 * @property {import('../../domain/types.js').Transaction[]} transactions
 * @property {import('../../domain/types.js').NetWorthSnapshot[]} snapshots
 */

/** @returns {Promise<Archive>} */
export async function readArchive() {
  const [
    profile,
    tasks,
    appointments,
    people,
    goals,
    links,
    captures,
    memories,
    journal,
    events,
    logs,
    accounts,
    observations,
    trades,
    prices,
    transactions,
    snapshots,
  ] = await Promise.all([
    getProfile(),
    getTasks(),
    getAppointments(),
    getPeople(),
    getGoals(),
    getLinks({}),
    getCaptures(),
    getMemoryEntries(),
    getJournalEntries(FIRST_DAY, LAST_DAY),
    getEvents(),
    readLoggedDays(),
    getAccounts(),
    getObservations({}),
    getTrades(),
    getPrices(),
    getTransactions(),
    getSnapshots(),
  ]);
  return {
    profile,
    tasks,
    appointments,
    people,
    goals,
    links,
    captures,
    memories,
    journal,
    events,
    logs,
    accounts,
    observations,
    trades,
    prices,
    transactions,
    snapshots,
  };
}

/**
 * The daily logs of every day that has one. `getDailyLogs` takes a range and
 * answers an empty log for a day nothing was written on, so the range runs
 * from the first logged day to the last and the empty days are dropped.
 *
 * @returns {Promise<import('../../domain/types.js').DailyLog[]>}
 */
async function readLoggedDays() {
  const days = await getLoggedDays();
  if (days.length === 0) return [];
  const logs = await getDailyLogs(days[0], days[days.length - 1]);
  const logged = new Set(days);
  return logs.filter((log) => logged.has(log.date));
}
