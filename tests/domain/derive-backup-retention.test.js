/**
 * Which backup folders stay (#288): the newest 30 days, plus the earliest
 * copy of each of the last 12 months. A pure function over names and today.
 */

import { describe, expect, it } from 'vitest';

import { toDayKey } from '../../lib/domain/dates.js';
import { backupFolderName, parseBackupFolderName, selectBackups } from '../../lib/domain/derive/backup-retention.js';

/**
 * @param {string} start
 * @param {number} count
 * @returns {string[]}
 */
function consecutiveDays(start, count) {
  const first = Date.parse(start + 'T00:00:00Z');
  return Array.from({ length: count }, (_, index) => toDayKey(new Date(first + index * 86400000), 'UTC'));
}

describe('backup folder names', () => {
  it('round-trips a day key and refuses a name the backup did not make', () => {
    expect(backupFolderName('2026-11-21')).toBe('personalos-backup-2026-11-21');
    expect(parseBackupFolderName('personalos-backup-2026-11-21')).toBe('2026-11-21');
    expect(parseBackupFolderName('2026-11-21')).toBeNull();
    expect(parseBackupFolderName('personalos-backup-2026-11-21-old')).toBeNull();
    expect(parseBackupFolderName('holiday photos')).toBeNull();
  });
});

describe('selectBackups', () => {
  it('keeps 30 dailies and the earliest copy of each month over 45 days', () => {
    // 2026-10-08 .. 2026-11-21 is 45 days.
    const names = consecutiveDays('2026-10-08', 45).map(backupFolderName);
    const { keep, remove } = selectBackups(names, '2026-11-21');

    // Newest 30: 2026-10-23 .. 2026-11-21. Month copies: Oct 8 (earliest of
    // October) and Nov 1 (already a daily).
    expect(keep).toHaveLength(31);
    expect(keep).toContain(backupFolderName('2026-10-08'));
    expect(keep).toContain(backupFolderName('2026-11-21'));
    expect(keep).toContain(backupFolderName('2026-10-23'));
    expect(remove).toContain(backupFolderName('2026-10-09'));
    expect(remove).toContain(backupFolderName('2026-10-22'));
    expect(keep.length + remove.length).toBe(45);
  });

  it('keeps 12 month copies out of 14 months', () => {
    const months = [];
    for (let i = 0; i < 14; i += 1) {
      months.push(toDayKey(new Date(Date.UTC(2025, 9 + i, 1)), 'UTC')); // 2025-10-01 .. 2026-11-01
    }
    const { keep, remove } = selectBackups(months.map(backupFolderName), '2026-11-21');

    expect(keep).toHaveLength(12);
    expect(remove).toEqual([backupFolderName('2025-10-01'), backupFolderName('2025-11-01')]);
  });

  it('never lists a folder the backup did not make', () => {
    const names = [backupFolderName('2026-11-20'), 'holiday photos', '2020-01-02', 'personalos-backup-oops'];
    const { keep, remove } = selectBackups(names, '2026-11-21');

    expect(remove).toEqual([]);
    expect(keep).toEqual([backupFolderName('2026-11-20')]);
  });

  it('keeps a folder dated in the future', () => {
    const { keep } = selectBackups([backupFolderName('2026-12-01')], '2026-11-21');
    expect(keep).toEqual([backupFolderName('2026-12-01')]);
  });
});
