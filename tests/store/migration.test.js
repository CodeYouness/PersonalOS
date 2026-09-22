/**
 * The v1 -> v2 migration.
 *
 * These run against a hand-written v1 document rather than the real file,
 * because a migration is a pure function and testing it should not need a
 * disk. The properties asserted here are the ones that make it safe to run
 * against somebody's life: idempotent, lossless where it matters, and honest
 * about what it cannot reconstruct.
 */

import { describe, expect, it } from 'vitest';

import { CURRENT_SCHEMA_VERSION, migrate, needsMigration, schemaVersionOf } from '@/lib/adapters/json/migrations.js';

/** A minimal but representative v1 document. */
function v1Document() {
  return {
    version: 1,
    profile: {
      name: 'Sam Rivers', role: 'Consultant', city: 'Lisbon', focus: 'Ship it',
      habits: [{ id: 'habit_move', label: 'Move', type: 'check', target: null }],
      calorieTarget: 2200,
    },
    tasks: [
      {
        id: 'task_1', title: 'Send the quote', note: '', band: 'today', temperature: 'hot',
        personId: 'person_1', tags: [], position: 0,
        createdAt: '2026-01-04T08:00:00.000Z', completedAt: null,
      },
      {
        id: 'task_2', title: 'Reply about dates', note: '', band: 'overdue', temperature: 'warm',
        personId: null, tags: [], position: 0,
        createdAt: '2026-01-02T09:00:00.000Z', completedAt: null,
      },
    ],
    people: [{ id: 'person_1', name: 'Marta', organization: 'Nordis', kind: 'client', note: '', createdAt: '2025-11-20T10:00:00.000Z' }],
    captures: [
      {
        id: 'capture_1', text: 'send Marta the quote', source: 'bar', destination: 'people',
        targetId: 'task_1', route: 'model', createdAt: '2026-01-04T08:00:00.000Z',
      },
    ],
    memory: [{ id: 'memory_1', text: 'send Marta the quote', source: 'capture', createdAt: '2026-01-04T08:00:00.000Z' }],
    dailyLogs: { '2026-01-05': { date: '2026-01-05', habits: { habit_move: true }, meals: [], measurements: [], notes: [] } },
    goals: {
      week: [{ id: 'goal_1', name: 'Close Nordis', done: false, progress: null }],
      month: [{ id: 'goal_2', name: 'Publish the case study', done: false, progress: null }],
    },
    activity: [{ id: 'activity_1', action: 'capture.filed', subjectId: 'capture_1', detail: 'people', at: '2026-01-04T08:00:00.000Z' }],
  };
}

describe('migration v1 to v2', () => {
  it('recognises what needs migrating', () => {
    expect(schemaVersionOf(v1Document())).toBe(1);
    expect(needsMigration(v1Document())).toBe(true);
    expect(needsMigration(migrate(v1Document()))).toBe(false);
  });

  it('is idempotent', () => {
    // Running it twice must be indistinguishable from running it once,
    // because it will be: every read of an old file calls it.
    const once = migrate(v1Document());
    const twice = migrate(once);
    expect(twice).toEqual(once);
  });

  it('does not mutate the document it was given', () => {
    const original = v1Document();
    migrate(original);
    expect(original.tasks[0].personId).toBe('person_1');
  });

  it('turns the only v1 relation into a link', () => {
    const migrated = migrate(v1Document());
    const involves = migrated.links.filter((/** @type {any} */ link) => link.rel === 'involves');

    expect(involves).toHaveLength(1);
    expect(involves[0].from).toBe('task_1');
    expect(involves[0].to).toBe('person_1');
    expect(migrated.tasks[0].personId).toBeUndefined();
  });

  it('turns a stored overdue back into something derivable', () => {
    // v1 wrote a derived value into canonical data. v2 stores the band you
    // chose and the day you chose it, and lets the calendar do the rest.
    const migrated = migrate(v1Document());
    const late = migrated.tasks.find((/** @type {any} */ task) => task.id === 'task_2');

    expect(late.band).toBe('today');
    expect(late.bandSetOn).toBe('2026-01-02');
    expect(migrated.tasks.every((/** @type {any} */ task) => task.band !== 'overdue')).toBe(true);
  });

  it('separates a capture arrival channel from who created the record', () => {
    const migrated = migrate(v1Document());
    const capture = migrated.captures[0];

    expect(capture.origin).toBe('bar');
    expect(capture.source).toBe('capture');
    expect(capture.targetId).toBeUndefined();
    expect(migrated.links.some((/** @type {any} */ link) => link.rel === 'about' && link.to === 'task_1')).toBe(true);
  });

  it('gives every memory a type and keeps its text', () => {
    const migrated = migrate(v1Document());
    expect(migrated.memory[0].content).toBe('send Marta the quote');
    expect(migrated.memory[0].type).toBe('fact');
    expect(migrated.memory[0].confidence).toBe(1);
  });

  it('flattens the two goal lists, keeping the horizon as a label', () => {
    const migrated = migrate(v1Document());
    expect(migrated.goals).toHaveLength(2);
    expect(migrated.goals.find((/** @type {any} */ goal) => goal.name === 'Close Nordis').horizon).toBe('week');
    expect(migrated.goals.find((/** @type {any} */ goal) => goal.name === 'Publish the case study').horizon).toBe('month');
  });

  it('turns activity into a timeline with day keys', () => {
    const migrated = migrate(v1Document());
    expect(migrated.activity).toBeUndefined();
    expect(migrated.events[0].type).toBe('capture.filed');
    expect(migrated.events[0].date).toBe('2026-01-04');
    expect(migrated.events[0].subject).toBe('capture_1');
  });

  it('introduces the new collections empty rather than absent', () => {
    const migrated = migrate(v1Document());
    for (const collection of ['journal', 'accounts', 'observations', 'transactions', 'snapshots', 'syncStates']) {
      expect(Array.isArray(migrated[collection])).toBe(true);
    }
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.profile.baseCurrency).toBe('EUR');
    expect(migrated.profile.habits[0].archived).toBe(false);
  });

  it('keeps the daily logs untouched', () => {
    const migrated = migrate(v1Document());
    expect(migrated.dailyLogs['2026-01-05'].habits.habit_move).toBe(true);
  });
});

/** A minimal v2 document -- the shape toVersion2 above already produces. */
function v2Document() {
  return {
    schemaVersion: 2,
    profile: { name: 'Sam Rivers', baseCurrency: 'EUR', financeCategories: [], habits: [] },
    tasks: [], people: [], goals: [], links: [], captures: [], memory: [],
    journal: [], events: [], dailyLogs: {}, accounts: [], observations: [],
    transactions: [], snapshots: [], syncStates: [],
  };
}

describe('migration v2 to v3', () => {
  it('introduces appointments empty rather than absent', () => {
    const migrated = migrate(v2Document());

    expect(Array.isArray(migrated.appointments)).toBe(true);
    expect(migrated.appointments).toHaveLength(0);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('is idempotent', () => {
    const once = migrate(v2Document());
    const twice = migrate(once);
    expect(twice).toEqual(once);
  });

  it('leaves every other collection untouched', () => {
    const withData = { ...v2Document(), tasks: [{ id: 'task_1' }] };
    const migrated = migrate(withData);

    expect(migrated.tasks).toEqual([{ id: 'task_1' }]);
  });
});
