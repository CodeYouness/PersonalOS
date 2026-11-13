/**
 * The action registry (ADR 0037, docs/domain.md "Action" and "Receipt"):
 * every write a channel makes on your behalf is a named action with a
 * schema, a risk class and an undo, and a list of them yields a receipt
 * that survives a refresh. Run against the seed in a throwaway DATA_DIR,
 * with the clock pinned, so every write goes through the real store.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** Thursday 24 September 2026, noon in Rome. */
const NOON = new Date('2026-09-24T10:00:00Z');
const DAY = '2026-09-24';
const YESTERDAY = '2026-09-23';

/** @type {import('@/lib/actions/registry.js').ActionContext} */
const CHECKIN = { day: DAY, source: 'checkin', origin: { type: 'checkin', id: null } };

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/actions/registry.js')} */
let registry;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-actions-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  registry = await import('@/lib/actions/registry.js');
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Runs one action and returns its line, failing the test if it was not made.
 *
 * @param {string} name
 * @param {unknown} params
 * @param {import('@/lib/actions/registry.js').ActionContext} [ctx]
 */
async function made(name, params, ctx = CHECKIN) {
  const { lines } = await registry.runActions([{ name, params }], ctx);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ name, status: 'done', undoable: true, error: null });
  return lines[0];
}

/**
 * The line a request is refused with: nothing written, no record kept.
 *
 * @param {string} name
 * @param {unknown} params
 */
async function refused(name, params) {
  const before = await store.getActionRecords();
  const { lines } = await registry.runActions([{ name, params }], CHECKIN);
  expect(lines[0]).toMatchObject({ actionId: null, status: 'rejected', undoable: false });
  expect(await store.getActionRecords()).toEqual(before);
  return lines[0];
}

/** @param {string} actionId */
async function recordOf(actionId) {
  const record = await store.getActionRecord(actionId);
  if (record === null) throw new Error('no record ' + actionId);
  return record;
}

describe('the registry', () => {
  it('names every action, each with an object schema for its params', () => {
    const names = registry.listActions().map((action) => action.name);
    expect(names).toEqual([
      'habit.set',
      'habit.skip',
      'mood.set',
      'energy.set',
      'time.set',
      'time.none',
      'journal.add',
      'task.create',
      'expense.record',
    ]);
    for (const action of registry.listActions()) {
      expect(action.schema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(action.risk).toBe('reversible');
    }
  });

  it('never offers mood or energy to a model', () => {
    const callable = registry.listActions({ modelCallable: true }).map((action) => action.name);
    expect(callable).not.toContain('mood.set');
    expect(callable).not.toContain('energy.set');
    expect(callable).toContain('habit.set');
    expect(registry.listActions({ modelCallable: false }).map((action) => action.name)).toEqual(['mood.set', 'energy.set']);
  });

  it('finds an action by name, or null', () => {
    expect(registry.getAction('mood.set')?.name).toBe('mood.set');
    expect(registry.getAction('coffee.brew')).toBeNull();
  });

  it('refuses a context it cannot file under', async () => {
    await expect(registry.runActions([], { ...CHECKIN, day: 'today' })).rejects.toThrow();
    await expect(registry.runActions([], { ...CHECKIN, source: 'telegram' })).rejects.toThrow();
    await expect(registry.runActions([], { ...CHECKIN, origin: /** @type {any} */ ({ type: 'fax', id: null }) })).rejects.toThrow();
  });
});

describe('habit.set', () => {
  it.each([
    ['no habit', { value: true }],
    ['an unknown habit', { habitId: 'habit_nope', value: true }],
    ['a value that is text', { habitId: 'habit_move', value: 'yes' }],
    ['a negative count', { habitId: 'habit_water', value: -1 }],
    ['a field it does not take', { habitId: 'habit_move', value: true, note: 'x' }],
    ['no params at all', null],
  ])('refuses %s', async (_label, params) => {
    await refused('habit.set', params);
  });

  it('ticks a habit on the day and says so', async () => {
    const line = await made('habit.set', { habitId: 'habit_move', value: true });

    expect(line.text).toBe('Move for 30 minutes ticked');
    expect((await store.getDailyLog(DAY)).habits).toEqual({ habit_move: true });
    const record = await recordOf(/** @type {string} */ (line.actionId));
    expect(record).toMatchObject({
      name: 'habit.set',
      params: { habitId: 'habit_move', value: true },
      day: DAY,
      origin: { type: 'checkin', id: null },
      recordRef: null,
      before: { value: null, skip: null },
      status: 'done',
      text: 'Move for 30 minutes ticked',
      source: 'checkin',
    });
  });

  it('says a count and an untick', async () => {
    expect((await made('habit.set', { habitId: 'habit_water', value: 5 })).text).toBe('Glasses of water 5');
    expect((await made('habit.set', { habitId: 'habit_read', value: false })).text).toBe('Read unticked');
  });

  it('undoes back to not recorded, not to "not done"', async () => {
    const line = await made('habit.set', { habitId: 'habit_move', value: true });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toEqual({ ok: true });
    expect((await store.getDailyLog(DAY)).habits).toEqual({});
    expect((await recordOf(/** @type {string} */ (line.actionId))).status).toBe('undone');
  });

  it('undoes back to the previous value, and gives back the skip reason that completing cleared', async () => {
    await store.logHabitValue({ date: DAY, habitId: 'habit_water', value: 3 });
    await store.setHabitSkip({ date: DAY, habitId: 'habit_water', reason: 'too-heavy' });

    const line = await made('habit.set', { habitId: 'habit_water', value: 8 });
    expect((await store.getDailyLog(DAY)).skips).toEqual({});
    expect((await recordOf(/** @type {string} */ (line.actionId))).before).toEqual({ value: 3, skip: 'too-heavy' });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toEqual({ ok: true });
    const log = await store.getDailyLog(DAY);
    expect(log.habits).toEqual({ habit_water: 3 });
    expect(log.skips).toEqual({ habit_water: 'too-heavy' });
  });

  it('refuses to undo once the value was changed since', async () => {
    const line = await made('habit.set', { habitId: 'habit_water', value: 4 });
    await store.logHabitValue({ date: DAY, habitId: 'habit_water', value: 6 });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
    expect((await store.getDailyLog(DAY)).habits).toEqual({ habit_water: 6 });
    expect((await recordOf(/** @type {string} */ (line.actionId))).status).toBe('done');
  });

  it('is filed as failed when the store refuses the value, writing nothing', async () => {
    const { lines } = await registry.runActions([{ name: 'habit.set', params: { habitId: 'habit_move', value: 3 } }], CHECKIN);

    expect(lines[0]).toMatchObject({ status: 'failed', undoable: false });
    expect(lines[0].error).toMatch(/value/);
    expect((await store.getDailyLog(DAY)).habits).toEqual({});
    expect(await recordOf(/** @type {string} */ (lines[0].actionId))).toMatchObject({
      status: 'failed',
      recordRef: null,
      before: null,
      error: lines[0].error,
    });
  });
});

describe('habit.skip', () => {
  it.each([
    ['a reason outside the list', { habitId: 'habit_read', reason: 'tired' }],
    ['no reason', { habitId: 'habit_read', reason: null }],
    ['an unknown habit', { habitId: 'habit_nope', reason: 'forgotten' }],
  ])('refuses %s', async (_label, params) => {
    await refused('habit.skip', params);
  });

  it('gives the day its reason, and undo takes it back to none', async () => {
    const line = await made('habit.skip', { habitId: 'habit_read', reason: 'forgotten' });

    expect(line.text).toBe('Read: Forgotten');
    expect((await store.getDailyLog(DAY)).skips).toEqual({ habit_read: 'forgotten' });
    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toEqual({ ok: true });
    expect((await store.getDailyLog(DAY)).skips).toEqual({});
  });

  it('undoes back to the reason given before', async () => {
    await store.setHabitSkip({ date: DAY, habitId: 'habit_read', reason: 'too-heavy' });
    const line = await made('habit.skip', { habitId: 'habit_read', reason: 'paused' });

    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY)).skips).toEqual({ habit_read: 'too-heavy' });
  });

  it('refuses to undo once the day was kept since', async () => {
    const line = await made('habit.skip', { habitId: 'habit_read', reason: 'forgotten' });
    await store.logHabitValue({ date: DAY, habitId: 'habit_read', value: true });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe.each([
  ['mood.set', 'mood', 'Mood'],
  ['energy.set', 'energy', 'Energy'],
])('%s', (name, field, label) => {
  it.each([[0], [6], [2.5], [null], ['4']])('refuses %j', async (value) => {
    await refused(name, { value });
  });

  it('sets the day\'s reading, and undo puts back the one before', async () => {
    await (field === 'mood' ? store.setDayMood({ date: DAY, mood: 2 }) : store.setDayEnergy({ date: DAY, energy: 2 }));
    const line = await made(name, { value: 4 });

    expect(line.text).toBe(label + ' 4');
    expect((await store.getDailyLog(DAY))[/** @type {'mood' | 'energy'} */ (field)]).toBe(4);
    expect((await recordOf(/** @type {string} */ (line.actionId))).before).toEqual({ value: 2 });

    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY))[/** @type {'mood' | 'energy'} */ (field)]).toBe(2);
  });

  it('refuses to undo once the reading was changed since', async () => {
    const line = await made(name, { value: 4 });
    await (field === 'mood' ? store.setDayMood({ date: DAY, mood: 5 }) : store.setDayEnergy({ date: DAY, energy: 5 }));

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe('time.set', () => {
  it.each([
    ['an area outside the list', { area: 'chores', minutes: 60 }],
    ['minutes off the half hour', { area: 'work', minutes: 45 }],
    ['more than a day', { area: 'work', minutes: 25 * 60 }],
  ])('refuses %s', async (_label, params) => {
    await refused('time.set', params);
  });

  it('declares the area\'s time, and undo takes a day not declared back to not declared', async () => {
    const line = await made('time.set', { area: 'work', minutes: 90 });

    expect(line.text).toBe('Work 1h 30m');
    expect((await store.getDailyLog(DAY)).time).toEqual({ work: 90 });
    expect((await recordOf(/** @type {string} */ (line.actionId))).before).toEqual({ minutes: 0, declared: false });

    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY)).time).toBeNull();
  });

  it('undoes back to the area\'s minutes on a day already declared', async () => {
    await store.setDayTime({ date: DAY, area: 'work', minutes: 60 });
    const line = await made('time.set', { area: 'work', minutes: 120 });

    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY)).time).toEqual({ work: 60 });
  });

  it('leaves the day declared when another area was given time since', async () => {
    const line = await made('time.set', { area: 'work', minutes: 90 });
    await store.setDayTime({ date: DAY, area: 'study', minutes: 30 });

    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY)).time).toEqual({ study: 30 });
  });

  it('refuses to undo once the area\'s time was changed since', async () => {
    const line = await made('time.set', { area: 'work', minutes: 90 });
    await store.setDayTime({ date: DAY, area: 'work', minutes: 60 });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe('time.none', () => {
  it('refuses a field', async () => {
    await refused('time.none', { area: 'work' });
  });

  it('declares nothing, and undo takes the day back to not declared', async () => {
    const line = await made('time.none', {});

    expect(line.text).toBe('No time to declare');
    expect((await store.getDailyLog(DAY)).time).toEqual({});
    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY)).time).toBeNull();
  });

  it('takes no params at all as none', async () => {
    await made('time.none', undefined);
  });

  it('leaves a day already declared as it was, before and after undo', async () => {
    await store.setDayTime({ date: DAY, area: 'work', minutes: 60 });
    const line = await made('time.none', {});

    expect((await store.getDailyLog(DAY)).time).toEqual({ work: 60 });
    await registry.undoAction(/** @type {string} */ (line.actionId));
    expect((await store.getDailyLog(DAY)).time).toEqual({ work: 60 });
  });

  it('refuses to undo once time was declared since', async () => {
    const line = await made('time.none', {});
    await store.setDayTime({ date: DAY, area: 'work', minutes: 60 });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
    expect((await store.getDailyLog(DAY)).time).toEqual({ work: 60 });
  });
});

describe('journal.add', () => {
  it.each([[{ text: '   ' }], [{ text: 4 }], [{}]])('refuses %j', async (params) => {
    await refused('journal.add', params);
  });

  it('writes the entry on the day, word for word, and undo deletes it', async () => {
    const line = await made('journal.add', { text: 'A slow morning, then a good walk.' }, { ...CHECKIN, day: YESTERDAY });

    expect(line.text).toBe('Journal entry added');
    const record = await recordOf(/** @type {string} */ (line.actionId));
    expect(record.recordRef).toMatch(/^journal_/);
    const entry = await store.getJournalEntry(/** @type {string} */ (record.recordRef));
    expect(entry).toMatchObject({ date: YESTERDAY, text: 'A slow morning, then a good walk.' });

    expect(await registry.undoAction(record.id)).toEqual({ ok: true });
    expect(await store.getJournalEntry(/** @type {string} */ (record.recordRef))).toBeNull();
  });

  it('refuses to undo once a memory was drawn from the entry', async () => {
    const line = await made('journal.add', { text: 'I prefer walking meetings.' });
    const entryId = /** @type {string} */ ((await recordOf(/** @type {string} */ (line.actionId))).recordRef);
    const entry = /** @type {import('@/lib/domain/types.js').JournalEntry} */ (await store.getJournalEntry(entryId));
    await store.acceptJournalProposal(entryId, { type: 'preference', content: 'Prefers walking meetings', updatedAt: entry.updatedAt });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
    expect(await store.getJournalEntry(entryId)).not.toBeNull();
  });

  it('refuses to undo once the entry was corrected', async () => {
    const line = await made('journal.add', { text: 'A slow morning.' });
    const entryId = /** @type {string} */ ((await recordOf(/** @type {string} */ (line.actionId))).recordRef);
    vi.setSystemTime(new Date(NOON.getTime() + 60_000));
    await store.updateJournalEntry(entryId, { text: 'A slow, grey morning.' });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe('task.create', () => {
  it.each([
    ['a blank title', { title: ' ' }],
    ['a band outside the list', { title: 'Call the plumber', band: 'overdue' }],
  ])('refuses %s', async (_label, params) => {
    await refused('task.create', params);
  });

  it('creates a plain task for this week, and undo deletes it', async () => {
    const line = await made('task.create', { title: '  Call the plumber ' });

    expect(line.text).toBe('Task: Call the plumber');
    const record = await recordOf(/** @type {string} */ (line.actionId));
    const task = await store.getTask(/** @type {string} */ (record.recordRef));
    expect(task).toMatchObject({ title: 'Call the plumber', band: 'week', source: 'checkin', completedAt: null });

    expect(await registry.undoAction(record.id)).toEqual({ ok: true });
    expect(await store.getTask(/** @type {string} */ (record.recordRef))).toBeNull();
  });

  it('takes the band it is given', async () => {
    const line = await made('task.create', { title: 'Renew the passport', band: 'later' });
    const record = await recordOf(/** @type {string} */ (line.actionId));
    expect((await store.getTask(/** @type {string} */ (record.recordRef)))?.band).toBe('later');
  });

  it('refuses to undo once the task was completed', async () => {
    const line = await made('task.create', { title: 'Call the plumber' });
    const record = await recordOf(/** @type {string} */ (line.actionId));
    await store.completeTask(/** @type {string} */ (record.recordRef));

    expect(await registry.undoAction(record.id)).toMatchObject({ ok: false, reason: 'locked' });
    expect(await store.getTask(/** @type {string} */ (record.recordRef))).not.toBeNull();
  });

  it('refuses to undo once the task is gone', async () => {
    const line = await made('task.create', { title: 'Call the plumber' });
    const record = await recordOf(/** @type {string} */ (line.actionId));
    await store.deleteTask(/** @type {string} */ (record.recordRef));

    expect(await registry.undoAction(record.id)).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe('expense.record', () => {
  beforeEach(async () => {
    await store.updateProfile({ defaultAccountId: 'account_seed_current' });
  });

  it.each([
    ['no amount', { categoryId: 'cat_groceries' }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -1840 }],
    ['an amount that is not whole cents', { amount: 18.4 }],
    ['a category that is not yours', { amount: 1840, categoryId: 'cat_nope' }],
    ['a blank account name', { amount: 1840, account: ' ' }],
  ])('refuses %s', async (_label, params) => {
    await refused('expense.record', params);
  });

  it('refuses when there is no account to file on', async () => {
    await store.updateProfile({ defaultAccountId: null });
    const line = await refused('expense.record', { amount: 1840 });
    expect(line.error).toMatch(/account/);
  });

  it('files spending on the default account, on the day, and undo deletes it', async () => {
    const line = await made('expense.record', { amount: 1840, categoryId: 'cat_groceries', note: 'market' });

    expect(line.text).toBe('Spent 18.40 on Groceries — market');
    const record = await recordOf(/** @type {string} */ (line.actionId));
    expect(record.params).toEqual({ amount: 1840, accountId: 'account_seed_current', categoryId: 'cat_groceries', note: 'market' });
    const transaction = await store.getTransaction(/** @type {string} */ (record.recordRef));
    expect(transaction).toMatchObject({
      date: DAY,
      amount: -1840,
      accountId: 'account_seed_current',
      categoryId: 'cat_groceries',
      description: 'market',
      counterAccountId: null,
      source: 'checkin',
    });

    expect(await registry.undoAction(record.id)).toEqual({ ok: true });
    expect(await store.getTransaction(/** @type {string} */ (record.recordRef))).toBeNull();
  });

  it('files on the account it names, and says an uncategorised amount plainly', async () => {
    const line = await made('expense.record', { amount: 500, account: 'emergency SAVINGS' });

    expect(line.text).toBe('Spent 5.00');
    const record = await recordOf(/** @type {string} */ (line.actionId));
    expect((await store.getTransaction(/** @type {string} */ (record.recordRef)))?.accountId).toBe('account_seed_savings');
  });

  it('names a subcategory with its parent', async () => {
    expect((await made('expense.record', { amount: 95000, categoryId: 'cat_rent' })).text).toBe('Spent 950.00 on Home / Rent');
  });

  it('refuses to undo once the transaction was recategorised', async () => {
    const line = await made('expense.record', { amount: 1840 });
    const record = await recordOf(/** @type {string} */ (line.actionId));
    vi.setSystemTime(new Date(NOON.getTime() + 60_000));
    await store.updateTransaction(/** @type {string} */ (record.recordRef), { categoryId: 'cat_groceries' });

    expect(await registry.undoAction(record.id)).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe('runActions', () => {
  it('makes what it can, one line per request in order, and keeps a record of what ran', async () => {
    const receipt = await registry.runActions(
      [
        { name: 'mood.set', params: { value: 4 } },
        { name: 'coffee.brew', params: {} },
        { name: 'habit.set', params: { habitId: 'habit_move' } },
        { name: 'habit.set', params: { habitId: 'habit_move', value: 3 } },
        { name: 'task.create', params: { title: 'Call the plumber' } },
        /** @type {any} */ ('not a request'),
      ],
      CHECKIN
    );

    expect(receipt.lines.map((line) => [line.name, line.status, line.undoable])).toEqual([
      ['mood.set', 'done', true],
      ['coffee.brew', 'rejected', false],
      ['habit.set', 'rejected', false],
      ['habit.set', 'failed', false],
      ['task.create', 'done', true],
      ['', 'rejected', false],
    ]);
    expect(receipt.lines[1].error).toMatch(/coffee\.brew/);
    expect(receipt.lines[2].error).toMatch(/value/);

    // Rejected requests leave no record; done and failed ones do.
    const records = await store.getActionRecords({ origin: { type: 'checkin' } });
    expect(records.map((record) => [record.name, record.status]).reverse()).toEqual([
      ['mood.set', 'done'],
      ['habit.set', 'failed'],
      ['task.create', 'done'],
    ]);
    expect((await store.getDailyLog(DAY)).mood).toBe(4);
  });

  it('runs a proposal not at all yet, and says so', async () => {
    const write = vi.fn();
    /** @type {import('@/lib/actions/registry.js').ActionDefinition} */
    const proposal = {
      name: 'goal.create',
      risk: 'proposal',
      modelCallable: true,
      schema: { type: 'object', properties: {}, additionalProperties: false },
      parse: () => ({ ok: true, params: {} }),
      run: async () => {
        write();
        return { recordRef: null, before: null };
      },
      undo: async () => undefined,
      line: () => 'Goal proposed',
    };
    const { runActions } = registry.createRegistry([proposal]);

    const { lines } = await runActions([{ name: 'goal.create', params: {} }], CHECKIN);

    expect(lines[0]).toMatchObject({ status: 'rejected', undoable: false });
    expect(lines[0].error).toMatch(/proposal/);
    expect(write).not.toHaveBeenCalled();
    expect(await store.getActionRecords()).toEqual([]);
  });

  it('files a run that throws as failed and goes on with the rest', async () => {
    /** @type {import('@/lib/actions/registry.js').ActionDefinition} */
    const broken = {
      ...(/** @type {import('@/lib/actions/registry.js').ActionDefinition} */ (registry.getAction('mood.set'))),
      name: 'broken.set',
      run: async () => {
        throw new Error('the disk is full');
      },
    };
    const { runActions } = registry.createRegistry([broken, ...registry.listActions()]);

    const { lines } = await runActions(
      [
        { name: 'broken.set', params: { value: 3 } },
        { name: 'energy.set', params: { value: 3 } },
      ],
      CHECKIN
    );

    expect(lines.map((line) => line.status)).toEqual(['failed', 'done']);
    expect(lines[0].error).toBe('the disk is full');
    expect((await store.getDailyLog(DAY)).energy).toBe(3);
  });
});

describe('receiptFor', () => {
  it('rebuilds the receipt from what was kept, after a refresh', async () => {
    const origin = { type: /** @type {const} */ ('capture'), id: 'capture_seed_1' };
    const ran = await registry.runActions(
      [
        { name: 'mood.set', params: { value: 3 } },
        { name: 'nope', params: {} },
        { name: 'time.set', params: { area: 'study', minutes: 60 } },
      ],
      { day: DAY, source: 'capture', origin }
    );
    await registry.runActions([{ name: 'energy.set', params: { value: 2 } }], CHECKIN);

    // A refresh: fresh modules, reading only what was written.
    vi.resetModules();
    const fresh = await import('@/lib/actions/registry.js');
    const receipt = await fresh.receiptFor({ origin });

    expect(receipt.lines).toEqual(ran.lines.filter((line) => line.status !== 'rejected'));
    expect((await fresh.receiptFor({ day: DAY })).lines.map((line) => line.name)).toEqual(['mood.set', 'time.set', 'energy.set']);
  });

  it('shows an undone line as undone, and a locked one as not undoable', async () => {
    const { lines } = await registry.runActions(
      [
        { name: 'mood.set', params: { value: 3 } },
        { name: 'energy.set', params: { value: 3 } },
      ],
      CHECKIN
    );
    await registry.undoAction(/** @type {string} */ (lines[0].actionId));
    await store.setDayEnergy({ date: DAY, energy: 5 });

    const receipt = await registry.receiptFor({ day: DAY });

    expect(receipt.lines.map((line) => [line.name, line.status, line.undoable])).toEqual([
      ['mood.set', 'undone', false],
      ['energy.set', 'done', false],
    ]);
  });
});

describe('undoAction', () => {
  it('says when there is no such action', async () => {
    expect(await registry.undoAction('action_missing')).toMatchObject({ ok: false, reason: 'not-found' });
  });

  it('undoes once, then says it is already undone', async () => {
    const line = await made('mood.set', { value: 4 });

    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toEqual({ ok: true });
    expect(await registry.undoAction(/** @type {string} */ (line.actionId))).toMatchObject({ ok: false, reason: 'already-undone' });
  });

  it('has nothing to undo for a failed action', async () => {
    const { lines } = await registry.runActions([{ name: 'habit.set', params: { habitId: 'habit_move', value: 3 } }], CHECKIN);

    expect(await registry.undoAction(/** @type {string} */ (lines[0].actionId))).toMatchObject({ ok: false, reason: 'failed' });
  });
});
