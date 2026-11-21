/**
 * The nightly backup (#288), against a real store and temporary directories:
 * the data directory it reads, the destination it writes.
 */

import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let dataDir;
/** @type {string} */
let destination;
/** @type {typeof import('@/lib/store.js')} */
let store;
/** @type {typeof import('@/lib/scheduler/backup.js')} */
let backup;

const NOW = new Date('2026-11-21T02:00:00Z');

/** @param {Date} [now] */
function context(now = NOW) {
  return /** @type {any} */ ({ scheduleId: 'nightly-backup', startedBy: 'schedule', now, timezone: 'Europe/Rome', store });
}

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'personalos-backup-data-'));
  await cp('data/seed.json', path.join(dataDir, 'seed.json'));
  process.env.DATA_DIR = dataDir;
  store = await import('@/lib/store.js');
  backup = await import('@/lib/scheduler/backup.js');
});

afterAll(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  destination = await mkdtemp(path.join(tmpdir(), 'personalos-backup-dest-'));
  await rm(path.join(dataDir, 'finance'), { recursive: true, force: true });
  await mkdir(path.join(dataDir, 'finance', 'dumps'), { recursive: true });
  await writeFile(path.join(dataDir, 'finance', 'dumps', 'march.json'), '{"month":"march"}');
  await store.getRuns(); // make sure the working document exists
});

describe('the nightly backup job', () => {
  it('copies the data file and the finance folder to a folder named for the day', async () => {
    const result = await backup.createBackupJob(() => destination)(context());

    expect(result).toMatchObject({ wrote: { backups: 1, backupsKept: 1, backupsRemoved: 0 } });
    const folder = path.join(destination, 'personalos-backup-2026-11-21');
    const copy = JSON.parse(await readFile(path.join(folder, 'personalos.json'), 'utf8'));
    expect(copy.schemaVersion).toBeTypeOf('number');
    expect(await readFile(path.join(folder, 'finance', 'dumps', 'march.json'), 'utf8')).toBe('{"month":"march"}');
  });

  it('names the folder for the day in the timezone, not in UTC', async () => {
    await backup.createBackupJob(() => destination)(context(new Date('2026-11-20T23:30:00Z')));

    expect(await readdir(destination)).toEqual(['personalos-backup-2026-11-21']);
  });

  it('leaves one folder when it runs twice the same day, holding the latest', async () => {
    const job = backup.createBackupJob(() => destination);
    await job(context());
    await writeFile(path.join(dataDir, 'finance', 'dumps', 'april.json'), '{}');
    await job(context(new Date('2026-11-21T10:00:00Z')));

    expect(await readdir(destination)).toEqual(['personalos-backup-2026-11-21']);
    expect(await readdir(path.join(destination, 'personalos-backup-2026-11-21', 'finance', 'dumps'))).toEqual(['april.json', 'march.json']);
  });

  it('works when there is no finance folder yet', async () => {
    await rm(path.join(dataDir, 'finance'), { recursive: true, force: true });
    const result = await backup.createBackupJob(() => destination)(context());

    expect(result).not.toHaveProperty('outcome');
    expect(await readdir(path.join(destination, 'personalos-backup-2026-11-21'))).toEqual(['personalos.json']);
  });

  it('is a skipped run when no destination is configured', async () => {
    const result = await backup.createBackupJob(() => null)(context());

    expect(result).toMatchObject({ outcome: 'skipped' });
    expect(/** @type {any} */ (result).reason).toMatch(/PERSONALOS_BACKUP_DIR/);
  });

  it('prunes what retention drops, reports the counts, and never touches a foreign folder', async () => {
    for (const day of ['2026-08-05', '2026-08-06', '2026-11-01']) {
      await mkdir(path.join(destination, 'personalos-backup-' + day));
    }
    await mkdir(path.join(destination, 'holiday photos'));
    await mkdir(path.join(destination, '2026-08-06'));

    const result = await backup.createBackupJob(() => destination)(context());

    // Aug 5 is August's earliest copy and is kept; Aug 6 goes.
    expect(result).toMatchObject({ wrote: { backups: 1, backupsKept: 3, backupsRemoved: 1 } });
    expect((await readdir(destination)).sort()).toEqual([
      '2026-08-06',
      'holiday photos',
      'personalos-backup-2026-08-05',
      'personalos-backup-2026-11-01',
      'personalos-backup-2026-11-21',
    ]);
  });

  it('a failed copy prunes nothing and is a failed run', async () => {
    await mkdir(path.join(destination, 'personalos-backup-2026-08-06'));
    // A file where the destination should be a directory.
    const blocked = path.join(destination, 'not-a-directory');
    await writeFile(blocked, 'x');

    const result = await backup.createBackupJob(() => blocked)(context());

    expect(result).toMatchObject({ outcome: 'failed' });
    expect(await readdir(destination)).toContain('personalos-backup-2026-08-06');
  });

  it('a write racing the backup yields a complete, parseable copy', async () => {
    const writes = Array.from({ length: 25 }, (_, index) =>
      store.recordRun({
        schedule: 'prune-runs',
        startedBy: 'user',
        engine: 'script',
        outcome: 'ok',
        startedAt: new Date(NOW.getTime() + index * 1000).toISOString(),
        durationMs: 5,
      })
    );
    const [result] = await Promise.all([backup.createBackupJob(() => destination)(context()), ...writes]);

    expect(result).not.toHaveProperty('outcome');
    const copy = JSON.parse(await readFile(path.join(destination, 'personalos-backup-2026-11-21', 'personalos.json'), 'utf8'));
    expect(Array.isArray(copy.runs)).toBe(true);
  });
});
