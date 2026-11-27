/**
 * The run log behind the store (ADR 0063): a run validates its closed
 * vocabularies at the boundary, the log is read newest first, runs older than
 * a cutoff are removed, and a v25 file gains the empty collection after a
 * versioned backup.
 */

import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

/** @param {Record<string, unknown>} [over] */
const run = (over = {}) => ({
  schedule: 'prune-runs',
  startedBy: 'schedule',
  engine: 'script',
  startedAt: '2026-11-21T02:30:00.000Z',
  durationMs: 120,
  outcome: 'ok',
  wrote: { runs: 2 },
  ...over,
});

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-runs-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
});

beforeEach(async () => {
  await store.resetToSeed();
  // The seed carries demo runs for the sandbox's run log page; these tests
  // start from an empty log.
  await store.removeRunsBefore('9999-01-01T00:00:00.000Z');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('runs', () => {
  it('starts empty and keeps a run with defaults for what it did not say', async () => {
    expect(await store.getRuns()).toEqual([]);

    const saved = await store.recordRun(run({ wrote: undefined }));

    expect(saved).toMatchObject({
      schedule: 'prune-runs', startedBy: 'schedule', outcome: 'ok', reason: '', wrote: {},
      model: null, inputTokens: null, outputTokens: null,
    });
    expect(saved.id.startsWith('run_')).toBe(true);
    expect(await store.getRuns()).toHaveLength(1);
  });

  it('keeps a failure with its error and a model run with its tokens', async () => {
    const failed = await store.recordRun(run({ outcome: 'failed', reason: 'boom' }));
    const model = await store.recordRun(run({ engine: 'small-model', model: 'haiku-x', inputTokens: 10, outputTokens: 3 }));

    expect(failed.reason).toBe('boom');
    expect(model).toMatchObject({ model: 'haiku-x', inputTokens: 10, outputTokens: 3 });
  });

  it.each([
    ['a schedule that is not declared', { schedule: 'nope' }],
    ['a starter outside the list', { startedBy: 'cron' }],
    ['an engine outside the list', { engine: 'strong-model' }],
    ['an outcome outside the list', { outcome: 'maybe' }],
    ['a kind of write outside the list', { wrote: { widgets: 1 } }],
    ['a fractional count', { wrote: { runs: 1.5 } }],
    ['a negative duration', { durationMs: -1 }],
    ['a start that is not an instant', { startedAt: 'yesterday' }],
    ['a cost', { costCents: 3 }],
  ])('refuses %s', async (_label, over) => {
    await expect(store.recordRun(run(over))).rejects.toThrow();
    expect(await store.getRuns()).toEqual([]);
  });

  it('keeps a run of a channel under its id, and refuses a subject that is neither a schedule nor a channel', async () => {
    const off = await store.recordRun(run({ schedule: 'telegram', outcome: 'skipped', reason: 'not-configured', wrote: {} }));
    expect(off).toMatchObject({ schedule: 'telegram', outcome: 'skipped', reason: 'not-configured' });
    expect(await store.getRuns({ schedule: 'telegram' })).toHaveLength(1);
    await expect(store.recordRun(run({ schedule: 'whatsapp' }))).rejects.toThrow(/schedule/);
  });

  it('reads newest first, of one schedule, up to a limit', async () => {
    await store.recordRun(run({ startedAt: '2026-11-19T02:30:00.000Z' }));
    await store.recordRun(run({ startedAt: '2026-11-21T02:30:00.000Z' }));
    await store.recordRun(run({ startedAt: '2026-11-20T02:30:00.000Z' }));

    expect((await store.getRuns()).map((r) => r.startedAt.slice(0, 10))).toEqual(['2026-11-21', '2026-11-20', '2026-11-19']);
    expect(await store.getRuns({ limit: 1 })).toHaveLength(1);
    expect(await store.getRuns({ schedule: 'prune-runs' })).toHaveLength(3);
  });

  it('removes the runs that started before an instant and keeps a newer one', async () => {
    await store.recordRun(run({ startedAt: '2026-08-01T02:30:00.000Z' }));
    await store.recordRun(run({ startedAt: '2026-11-20T02:30:00.000Z' }));

    const removed = await store.removeRunsBefore('2026-08-23T00:00:00.000Z');

    expect(removed).toBe(1);
    expect((await store.getRuns()).map((r) => r.startedAt)).toEqual(['2026-11-20T02:30:00.000Z']);
  });
});

describe('the seed', () => {
  it('carries demo runs, among them a failed one with its error and a skipped one with its reason', async () => {
    await store.resetToSeed();
    const runs = await store.getRuns();

    expect(runs.length).toBeGreaterThanOrEqual(3);
    expect(runs.find((r) => r.outcome === 'failed')?.reason).not.toBe('');
    expect(runs.find((r) => r.outcome === 'skipped')?.reason).not.toBe('');
  });
});

describe('a v25 data file', () => {
  it('gains an empty run log on its first read, keeping the old file as a backup', async () => {
    const seed = JSON.parse(await readFile('data/seed.json', 'utf8'));
    const { runs: _demoRuns, ...v25 } = seed;
    const before = JSON.stringify({ ...v25, schemaVersion: 25 }, null, 2);
    const working = path.join(sandbox, 'personalos.json');
    await writeFile(working, before);

    expect(await store.getRuns()).toEqual([]);

    expect(await readFile(working + '.v25.backup', 'utf8')).toBe(before);
    const migrated = JSON.parse(await readFile(working, 'utf8'));
    expect(migrated.schemaVersion).toBe(26);
    expect(migrated.runs).toEqual([]);
    expect((await readdir(sandbox)).filter((name) => name.endsWith('.backup'))).toContain('personalos.json.v25.backup');
  });
});
