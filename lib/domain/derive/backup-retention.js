/**
 * Which backup folders stay (#288): the newest 30 days, plus the earliest
 * copy of each of the last 12 months. Pure: names and today in, names out.
 * A name the backup did not make is in neither list -- it is invisible here,
 * so nothing that prunes from this can ever remove it.
 */

import { backupRetention } from '../../../personalos.config.js';

const PREFIX = 'personalos-backup-';
const NAME = /^personalos-backup-(\d{4}-\d{2}-\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @param {string} dayKey `YYYY-MM-DD`, from `toDayKey`
 * @returns {string}
 */
export function backupFolderName(dayKey) {
  return PREFIX + dayKey;
}

/**
 * @param {string} name
 * @returns {string | null} the day key, or null when the backup did not make it
 */
export function parseBackupFolderName(name) {
  const match = NAME.exec(name);
  return match === null || Number.isNaN(Date.parse(match[1] + 'T00:00:00Z')) ? null : match[1];
}

/**
 * @param {string} dayKey
 * @returns {number} whole days since the epoch
 */
function dayNumber(dayKey) {
  return Math.floor(Date.parse(dayKey + 'T00:00:00Z') / MS_PER_DAY);
}

/**
 * @param {string} dayKey
 * @returns {number} months since year 0, so months subtract
 */
function monthNumber(dayKey) {
  return Number(dayKey.slice(0, 4)) * 12 + Number(dayKey.slice(5, 7)) - 1;
}

/**
 * @param {readonly string[]} names every entry in the destination
 * @param {string} today the day key of the run
 * @returns {{ keep: string[], remove: string[] }} backup folders only, oldest first
 */
export function selectBackups(names, today) {
  const backups = names
    .map((name) => ({ name, day: parseBackupFolderName(name) }))
    .filter((entry) => entry.day !== null)
    .map((entry) => ({ name: entry.name, day: /** @type {string} */ (entry.day) }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const todayNumber = dayNumber(today);
  const thisMonth = monthNumber(today);
  /** @type {Set<string>} */
  const keepNames = new Set();
  /** @type {Set<number>} */
  const seenMonths = new Set();

  for (const { name, day } of backups) {
    if (todayNumber - dayNumber(day) < backupRetention.dailyDays) keepNames.add(name);
    const month = monthNumber(day);
    if (!seenMonths.has(month)) {
      seenMonths.add(month);
      // Oldest first, so the first folder met in a month is its earliest.
      if (thisMonth - month < backupRetention.months) keepNames.add(name);
    }
  }

  return {
    keep: backups.filter((entry) => keepNames.has(entry.name)).map((entry) => entry.name),
    remove: backups.filter((entry) => !keepNames.has(entry.name)).map((entry) => entry.name),
  };
}
