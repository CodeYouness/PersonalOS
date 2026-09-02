/**
 * The shared storage-adapter test suite.
 *
 * This is the payoff of putting a contract between the application and its
 * storage: the day a database adapter exists, it runs against this same file
 * and the result is a straight answer to "is it equivalent?". Anything
 * asserted here is behaviour the rest of PersonalOS is allowed to rely on.
 *
 * Not collected on its own -- vitest only picks up *.test.js.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ADAPTER_METHODS } from '@/lib/adapters/contract.js';

/**
 * @param {string} label
 * @param {() => Promise<import('@/lib/adapters/contract.js').StoreAdapter>} load
 * @returns {void}
 */
export function runAdapterContract(label, load) {
  describe('storage adapter contract: ' + label, () => {
    /** @type {import('@/lib/adapters/contract.js').StoreAdapter} */
    let store;

    beforeEach(async () => {
      store = await load();
      await store.reset();
    });

    it('implements every method in the contract', () => {
      for (const method of ADAPTER_METHODS) {
        expect(typeof (/** @type {any} */ (store)[method])).toBe('function');
      }
    });

    describe('profile', () => {
      it('reads the seeded profile', async () => {
        const profile = await store.getProfile();

        expect(profile.name).toBeTruthy();
        expect(Array.isArray(profile.habits)).toBe(true);
      });

      it('merges a patch and persists it', async () => {
        await store.updateProfile({ focus: 'Rewrite the onboarding email' });
        const profile = await store.getProfile();

        expect(profile.focus).toBe('Rewrite the onboarding email');
        // A patch is a patch: untouched fields survive.
        expect(profile.calorieTarget).toBeGreaterThan(0);
      });
    });

    describe('tasks', () => {
      it('creates a task at the head of its band and pushes the others down', async () => {
        const before = (await store.getTasks()).filter((task) => task.band === 'today');
        const created = await store.createTask({ title: 'Call the accountant' });
        const after = await store.getTasks();

        expect(created.position).toBe(0);
        expect(created.band).toBe('today');
        for (const task of before) {
          const moved = after.find((candidate) => candidate.id === task.id);
          expect(moved?.position).toBe(task.position + 1);
        }
      });

      it('refuses to create a task that is already overdue', async () => {
        // Being late is something that happens to a task, never how it starts.
        await expect(store.createTask({ title: 'Late', band: 'overdue' })).rejects.toThrow();
      });

      it('refuses an empty title or an unknown temperature', async () => {
        await expect(store.createTask({ title: '   ' })).rejects.toThrow();
        await expect(
          store.createTask({ title: 'Fine', temperature: 'lukewarm' })
        ).rejects.toThrow();
      });

      it('updates a task by id', async () => {
        const created = await store.createTask({ title: 'Draft the invoice' });
        const updated = await store.updateTask(created.id, { band: 'week', note: 'net 30' });

        expect(updated.band).toBe('week');
        expect(updated.note).toBe('net 30');
        expect(updated.id).toBe(created.id);
        expect(updated.createdAt).toBe(created.createdAt);
      });

      it('keeps a completed task in the data', async () => {
        // Completing removes a card from the board, not the record from the
        // history: the weekly review is made of exactly this.
        const created = await store.createTask({ title: 'Renew the domain' });
        await store.updateTask(created.id, { completedAt: new Date().toISOString() });
        const found = await store.getTask(created.id);

        expect(found).not.toBeNull();
        expect(found?.completedAt).toBeTruthy();
      });

      it('reports an unknown id instead of failing silently', async () => {
        expect(await store.getTask('task_does_not_exist')).toBeNull();
        await expect(store.updateTask('task_does_not_exist', { note: 'x' })).rejects.toThrow();
        await expect(store.deleteTask('task_does_not_exist')).rejects.toThrow();
      });

      it('deletes a task', async () => {
        const created = await store.createTask({ title: 'Temporary' });
        await store.deleteTask(created.id);

        expect(await store.getTask(created.id)).toBeNull();
      });
    });

    describe('people', () => {
      it('creates and updates a person', async () => {
        const created = await store.createPerson({ name: 'Ana Duarte', kind: 'client' });
        const updated = await store.updatePerson(created.id, { organization: 'Beacon' });

        expect(updated.name).toBe('Ana Duarte');
        expect(updated.organization).toBe('Beacon');
        expect(await store.getPerson('person_nope')).toBeNull();
      });

      it('refuses a person without a name', async () => {
        await expect(store.createPerson({ name: '' })).rejects.toThrow();
      });
    });

    describe('captures', () => {
      it('records how the destination was decided', async () => {
        // Without this field an expired API key looks like a model that got
        // worse: the fallback keeps working and nothing says so.
        const capture = await store.createCapture({
          text: 'paid 340 for the accountant',
          destination: 'finance',
          route: 'rules',
        });

        expect(capture.route).toBe('rules');
        expect(capture.destination).toBe('finance');
      });

      it('refuses a destination that is not in the canonical list', async () => {
        await expect(
          store.createCapture({ text: 'something', destination: 'errands' })
        ).rejects.toThrow();
      });

      it('returns the most recent first and honours a limit', async () => {
        await store.createCapture({ text: 'first', destination: 'memory' });
        await store.createCapture({ text: 'second', destination: 'memory' });
        const captures = await store.getCaptures({ limit: 1 });

        expect(captures).toHaveLength(1);
        expect(captures[0].text).toBe('second');
      });
    });

    describe('memory', () => {
      it('appends an entry and returns the newest first', async () => {
        await store.createMemoryEntry({ text: 'older thought' });
        await store.createMemoryEntry({ text: 'newer thought' });
        const entries = await store.getMemoryEntries({ limit: 2 });

        expect(entries[0].text).toBe('newer thought');
      });
    });

    describe('daily logs', () => {
      it('returns an empty log for a day nothing was written to', async () => {
        const log = await store.getDailyLog('2020-03-01');

        expect(log.date).toBe('2020-03-01');
        expect(log.meals).toEqual([]);
        expect(log.habits).toEqual({});
      });

      it('creates the day on first write and merges afterwards', async () => {
        await store.updateDailyLog('2026-04-02', { habits: { habit_move: true } });
        await store.updateDailyLog('2026-04-02', {
          meals: [
            {
              id: 'meal_test',
              time: '12:30',
              name: 'Soup',
              calories: 300,
              protein: 10,
              carbs: 40,
              fat: 8,
              estimated: true,
            },
          ],
        });
        const log = await store.getDailyLog('2026-04-02');

        expect(log.habits).toEqual({ habit_move: true });
        expect(log.meals).toHaveLength(1);
      });

      it('refuses anything that is not a day key', async () => {
        await expect(store.getDailyLog('yesterday')).rejects.toThrow();
        await expect(store.getDailyLog('2026-02-30')).rejects.toThrow();
      });

      it('returns every day in a range, oldest first, empty days included', async () => {
        // An unrecorded day is not a zero, and callers have to be able to
        // tell the difference: the Health card divides by recorded days only.
        await store.updateDailyLog('2026-04-02', { habits: { habit_move: true } });
        const logs = await store.getDailyLogs('2026-04-01', '2026-04-03');

        expect(logs.map((log) => log.date)).toEqual([
          '2026-04-01',
          '2026-04-02',
          '2026-04-03',
        ]);
        expect(logs[0].meals).toEqual([]);
        expect(logs[1].habits).toEqual({ habit_move: true });
      });
    });

    describe('goals', () => {
      it('stores goals outside the daily logs so nothing can expire them', async () => {
        // A habit belongs to a day; a promise does not. Goals are closed by
        // you or removed by you, never by the calendar turning over.
        await store.updateGoals({
          week: [{ id: 'goal_test', name: 'Sign the contract', done: false, progress: null }],
        });
        await store.updateDailyLog('2026-04-09', { habits: { habit_read: true } });
        const goals = await store.getGoals();

        expect(goals.week).toHaveLength(1);
        expect(goals.week[0].name).toBe('Sign the contract');
        expect(goals.month.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('activity', () => {
      it('appends an entry with a timestamp', async () => {
        const entry = await store.recordActivity({
          action: 'task.completed',
          subjectId: 'task_seed_1',
        });
        const recent = await store.getActivity({ limit: 1 });

        expect(entry.at).toBeTruthy();
        expect(recent[0].action).toBe('task.completed');
      });
    });

    describe('reset', () => {
      it('restores the seeded state', async () => {
        // Deleting the working data is the undo button this whole design
        // hangs on. If it stops working, nothing else warns you.
        const seededTasks = await store.getTasks();
        const seededFocus = (await store.getProfile()).focus;

        await store.createTask({ title: 'Throwaway' });
        await store.updateProfile({ focus: 'Something else entirely' });
        await store.reset();

        expect(await store.getTasks()).toHaveLength(seededTasks.length);
        expect((await store.getProfile()).focus).toBe(seededFocus);
      });
    });
  });
}
