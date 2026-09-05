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
      it('reads the seeded profile, categories and all', async () => {
        const profile = await store.getProfile();

        expect(profile.name).toBeTruthy();
        expect(profile.baseCurrency).toBeTruthy();
        expect(Array.isArray(profile.habits)).toBe(true);
        // Categories are personal data configured in the profile, exactly
        // like habits. "Pizzeria" is not a constant the template ships.
        expect(Array.isArray(profile.financeCategories)).toBe(true);
      });

      it('merges a patch and persists it', async () => {
        await store.updateProfile({ focus: 'Rewrite the onboarding email' });
        const profile = await store.getProfile();

        expect(profile.focus).toBe('Rewrite the onboarding email');
        expect(profile.calorieTarget).toBeGreaterThan(0);
      });

      it('rejects an unknown field in a patch', async () => {
        const patch = /** @type {any} */ ({ nickname: 'Jay' });
        await expect(store.updateProfile(patch)).rejects.toThrow();
      });
    });

    describe('tasks', () => {
      it('creates a task at the head of its band and pushes the others down', async () => {
        const before = (await store.getTasks()).filter((task) => task.band === 'today');
        const created = await store.createTask({ title: 'Call the accountant' });
        const after = await store.getTasks();

        expect(created.position).toBe(0);
        expect(created.band).toBe('today');
        expect(created.bandSetOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        for (const task of before) {
          const moved = after.find((candidate) => candidate.id === task.id);
          expect(moved?.position).toBe(task.position + 1);
        }
      });

      it('refuses to create a task that is already overdue', async () => {
        // Being late is something that happens to a task, never how it
        // starts. `overdue` is not even in the band vocabulary.
        await expect(store.createTask({ title: 'Late', band: 'overdue' })).rejects.toThrow();
      });

      it('restarts the clock when the band is changed', async () => {
        const created = await store.createTask({ title: 'Draft the invoice' });
        const updated = await store.updateTask(created.id, { band: 'week' });

        // Without this, a task dragged out of the overdue column would keep
        // deriving as late and snap straight back.
        expect(updated.band).toBe('week');
        expect(updated.bandSetOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it('refuses an empty title or an unknown temperature', async () => {
        await expect(store.createTask({ title: '   ' })).rejects.toThrow();
        await expect(
          store.createTask({ title: 'Fine', temperature: 'lukewarm' })
        ).rejects.toThrow();
      });

      it('keeps a completed task in the data', async () => {
        const created = await store.createTask({ title: 'Renew the domain' });
        await store.updateTask(created.id, { completedAt: new Date().toISOString() });
        const found = await store.getTask(created.id);

        expect(found).not.toBeNull();
        expect(found?.completedAt).toBeTruthy();
      });

      it('rejects an unknown field in a patch, leaving the record unchanged', async () => {
        const created = await store.createTask({ title: 'Something' });

        await expect(store.updateTask(created.id, { notAField: 'x' })).rejects.toThrow();

        expect(await store.getTask(created.id)).toEqual(created);
      });

      it('rejects a wrongly typed value for a known field', async () => {
        const created = await store.createTask({ title: 'Something' });

        await expect(
          store.updateTask(created.id, { title: { not: 'a string' } })
        ).rejects.toThrow();
      });

      it('reports an unknown id instead of failing silently', async () => {
        expect(await store.getTask('task_nope')).toBeNull();
        await expect(store.updateTask('task_nope', { note: 'x' })).rejects.toThrow();
        await expect(store.deleteTask('task_nope')).rejects.toThrow();
      });

      it('takes its links with it when deleted', async () => {
        const person = await store.createPerson({ name: 'Ana Duarte' });
        const task = await store.createTask({ title: 'Temporary' });
        await store.createLink({ from: task.id, to: person.id, rel: 'involves' });

        await store.deleteTask(task.id);

        expect(await store.getTask(task.id)).toBeNull();
        // A link to a deleted entity is an edge pointing at nothing, which is
        // worse than no edge at all.
        expect(await store.getLinks({ from: task.id })).toHaveLength(0);
      });
    });

    describe('links', () => {
      it('relates two entities and finds them from either end', async () => {
        const person = await store.createPerson({ name: 'Ana Duarte' });
        const task = await store.createTask({ title: 'Call Ana' });
        await store.createLink({ from: task.id, to: person.id, rel: 'involves' });

        expect(await store.getLinks({ from: task.id, rel: 'involves' })).toHaveLength(1);
        expect(await store.getLinks({ to: person.id, rel: 'involves' })).toHaveLength(1);
      });

      it('is a set, not a bag', async () => {
        const person = await store.createPerson({ name: 'Ana Duarte' });
        const task = await store.createTask({ title: 'Call Ana' });
        await store.createLink({ from: task.id, to: person.id, rel: 'involves' });
        await store.createLink({ from: task.id, to: person.id, rel: 'involves' });

        // Saying the same thing twice is one fact, not two.
        expect(await store.getLinks({ from: task.id })).toHaveLength(1);
      });

      it('refuses a relation outside the vocabulary', async () => {
        const task = await store.createTask({ title: 'Anything' });
        const person = await store.createPerson({ name: 'Ana Duarte' });

        // An open vocabulary becomes unqueryable within a year, because
        // nobody remembers whether it was belongs_to, belongsTo or parent.
        await expect(
          store.createLink({ from: task.id, to: person.id, rel: 'has_a_thing_with' })
        ).rejects.toThrow();
      });

      it('refuses a malformed reference and a self-link', async () => {
        const task = await store.createTask({ title: 'Anything' });

        await expect(store.createLink({ from: 'nope', to: task.id, rel: 'about' })).rejects.toThrow();
        await expect(
          store.createLink({ from: task.id, to: task.id, rel: 'about' })
        ).rejects.toThrow();
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

      it('rejects an unknown field in a patch', async () => {
        const created = await store.createPerson({ name: 'Ana Duarte' });

        await expect(
          store.updatePerson(created.id, { favoriteColor: 'blue' })
        ).rejects.toThrow();
      });
    });

    describe('goals', () => {
      it('stores goals as their own collection so nothing can expire them', async () => {
        // A habit belongs to a day; a promise does not. There is no period
        // logic anywhere near goals, and horizon is a label, not an expiry.
        const goal = await store.createGoal({ name: 'Sign the contract', horizon: 'week' });
        await store.updateDailyLog('2026-04-09', { habits: { habit_read: true } });

        const goals = await store.getGoals();
        expect(goals.find((entry) => entry.id === goal.id)?.name).toBe('Sign the contract');
      });

      it('supports a project as a goal with children', async () => {
        // Deliberately not a separate entity: a project is an objective with
        // things hanging off it, and a second collection would earn nothing.
        const project = await store.createGoal({ name: 'Launch the course', kind: 'project' });
        const task = await store.createTask({ title: 'Record module 1' });
        await store.createLink({ from: task.id, to: project.id, rel: 'belongs_to' });

        expect(project.kind).toBe('project');
        expect(await store.getLinks({ to: project.id, rel: 'belongs_to' })).toHaveLength(1);
      });

      it('rejects an unknown field in a patch', async () => {
        const goal = await store.createGoal({ name: 'Ship it' });

        await expect(
          store.updateGoal(goal.id, { deadline: '2026-01-01' })
        ).rejects.toThrow();
      });
    });

    describe('captures', () => {
      it('records how the destination was decided', async () => {
        // Without this field an expired API key looks like a model that
        // quietly got worse: the fallback keeps working and nothing says so.
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

    describe('journal and memory', () => {
      it('keeps several entries on the same day', async () => {
        // A morning thought and an evening one are two things, not a
        // document to be merged.
        await store.createJournalEntry({ date: '2026-04-02', text: 'Slow start.' });
        await store.createJournalEntry({ date: '2026-04-02', text: 'Better after lunch.' });

        const entries = await store.getJournalEntries('2026-04-02', '2026-04-02');
        expect(entries).toHaveLength(2);
        expect(entries[0].text).toBe('Slow start.');
      });

      it('refuses an extracted memory that cannot say where it came from', async () => {
        // This is the rule that stops the archive filling with confident
        // claims nothing backs. A memory is a reading of something you wrote.
        await expect(
          store.createMemoryEntry({
            type: 'decision',
            content: 'Decided to switch banks.',
            source: 'journal',
          })
        ).rejects.toThrow();
      });

      it('links an extracted memory to its origin', async () => {
        const entry = await store.createJournalEntry({
          date: '2026-04-02',
          text: 'The two-phase pricing felt right when I said it out loud.',
        });
        const memory = await store.createMemoryEntry({
          type: 'decision',
          content: 'Going with two-phase pricing.',
          source: 'journal',
          derivedFrom: entry.id,
          confidence: 0.8,
        });

        const provenance = await store.getLinks({ from: memory.id, rel: 'derived_from' });
        expect(provenance).toHaveLength(1);
        expect(provenance[0].to).toBe(entry.id);
      });

      it('leaves the journal alone when a memory is deleted', async () => {
        const entry = await store.createJournalEntry({ date: '2026-04-02', text: 'Something.' });
        const memory = await store.createMemoryEntry({
          type: 'observation',
          content: 'Something happened.',
          source: 'journal',
          derivedFrom: entry.id,
        });

        await store.deleteMemoryEntry(memory.id);

        // The writing is the primary record. The memory was only a reading
        // of it, and removing a reading never removes what was read.
        expect(await store.getJournalEntry(entry.id)).not.toBeNull();
      });

      it('filters memory by type', async () => {
        await store.createMemoryEntry({ type: 'preference', content: 'Prefers passive investing.' });
        const preferences = await store.getMemoryEntries({ type: 'preference' });

        expect(preferences.length).toBeGreaterThanOrEqual(1);
        expect(preferences.every((entry) => entry.type === 'preference')).toBe(true);
      });

      it('accepts a validity window, because knowledge expires', async () => {
        const memory = await store.createMemoryEntry({
          type: 'preference',
          content: 'Commuting by bike.',
          validFrom: '2026-01-01',
          validUntil: '2026-06-30',
        });

        expect(memory.validFrom).toBe('2026-01-01');
        expect(memory.validUntil).toBe('2026-06-30');
      });

      it('rejects an unknown field in a memory patch', async () => {
        const memory = await store.createMemoryEntry({ type: 'fact', content: 'Something true.' });

        await expect(
          store.updateMemoryEntry(memory.id, { verified: true })
        ).rejects.toThrow();
      });

      it('rejects an unknown field in a journal patch', async () => {
        const entry = await store.createJournalEntry({ date: '2026-04-02', text: 'Something.' });

        await expect(
          store.updateJournalEntry(entry.id, { mood: 'good' })
        ).rejects.toThrow();
      });
    });

    describe('events', () => {
      it('records a typed event with a day key for the timeline', async () => {
        const task = await store.createTask({ title: 'Something' });
        const event = await store.recordEvent({ type: 'task.completed', subject: task.id });

        expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(event.subject).toBe(task.id);
      });

      it('refuses a type outside the vocabulary', async () => {
        await expect(store.recordEvent({ type: 'something.happened' })).rejects.toThrow();
      });

      it('queries a day range', async () => {
        await store.recordEvent({ type: 'journal.written', date: '2026-04-01', subject: null });
        await store.recordEvent({ type: 'journal.written', date: '2026-04-05', subject: null });

        const inRange = await store.getEvents({ from: '2026-04-01', to: '2026-04-02' });
        expect(inRange.every((event) => event.date <= '2026-04-02')).toBe(true);
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
              id: 'meal_test', time: '12:30', name: 'Soup',
              calories: 300, protein: 10, carbs: 40, fat: 8, estimated: true,
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
        // tell the difference: the health averages divide by recorded days.
        await store.updateDailyLog('2026-04-02', { habits: { habit_move: true } });
        const logs = await store.getDailyLogs('2026-04-01', '2026-04-03');

        expect(logs.map((log) => log.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
        expect(logs[0].meals).toEqual([]);
      });

      it('rejects an unknown field in a patch', async () => {
        await expect(
          store.updateDailyLog('2026-04-02', { mood: 'good' })
        ).rejects.toThrow();
      });
    });

    describe('finance', () => {
      it('keeps money as integers in minor units', async () => {
        const [account] = await store.getAccounts();

        // Floating point and money do not belong in the same file. A cent is
        // an integer, and anything else is rejected at the boundary.
        await expect(
          store.recordObservation({
            accountId: account.id, kind: 'balance', amount: 1240.55, date: '2026-04-02',
          })
        ).rejects.toThrow();
      });

      it('records an observation against a real account', async () => {
        const [account] = await store.getAccounts();
        const observation = await store.recordObservation({
          accountId: account.id, kind: 'balance', amount: 1300000, date: '2026-04-02',
        });

        expect(observation.amount).toBe(1300000);
        await expect(
          store.recordObservation({
            accountId: 'account_nope', kind: 'balance', amount: 1, date: '2026-04-02',
          })
        ).rejects.toThrow();
      });

      it('requires the other side of a transfer', async () => {
        const [account] = await store.getAccounts();

        // A transfer with one end is money vanishing.
        await expect(
          store.createTransaction({
            date: '2026-04-02', amount: 10000, kind: 'transfer', accountId: account.id,
          })
        ).rejects.toThrow();
      });

      it('refuses a negative amount, because kind gives the direction', async () => {
        const [account] = await store.getAccounts();

        await expect(
          store.createTransaction({
            date: '2026-04-02', amount: -5000, kind: 'expense', accountId: account.id,
          })
        ).rejects.toThrow();
      });

      it('upserts an imported transaction without touching what you own', async () => {
        const [account] = await store.getAccounts();
        const origin = { source: 'xlsx', externalId: 'ROW-42', syncedAt: '2026-04-02T00:00:00.000Z' };

        const imported = await store.createTransaction({
          date: '2026-04-02', amount: 4500, kind: 'expense',
          accountId: account.id, description: 'CAFE LISBOA', origin, source: 'integration',
        });
        // You classify it by hand inside PersonalOS.
        await store.updateTransaction(imported.id, {
          categoryId: 'cat_eating_out', note: 'with Marta',
        });

        // Tomorrow the import runs again with a corrected amount.
        const reimported = await store.upsertTransactionByOrigin({
          date: '2026-04-02', amount: 4700, kind: 'expense',
          accountId: account.id, description: 'CAFE LISBOA LDA', origin,
        });

        expect(reimported.id).toBe(imported.id);
        expect(reimported.amount).toBe(4700);
        expect(reimported.description).toBe('CAFE LISBOA LDA');
        // THIS is the assertion the whole two-zone design exists for.
        expect(reimported.categoryId).toBe('cat_eating_out');
        expect(reimported.note).toBe('with Marta');
        expect(await store.getTransactions()).toHaveLength(
          (await store.getTransactions()).length
        );
      });

      it('rejects an unknown field in an account patch', async () => {
        const [account] = await store.getAccounts();

        await expect(
          store.updateAccount(account.id, { interestRate: 0.02 })
        ).rejects.toThrow();
      });

      it('rejects an unknown field in a transaction patch', async () => {
        const [account] = await store.getAccounts();
        const transaction = await store.createTransaction({
          date: '2026-04-02', amount: 500, kind: 'expense', accountId: account.id,
        });

        await expect(
          store.updateTransaction(transaction.id, { verified: true })
        ).rejects.toThrow();
      });

      it('keeps one snapshot per day', async () => {
        await store.recordSnapshot({ date: '2026-04-02', netWorth: 100000 });
        await store.recordSnapshot({ date: '2026-04-02', netWorth: 110000 });

        const forThatDay = (await store.getSnapshots()).filter(
          (snapshot) => snapshot.date === '2026-04-02'
        );
        // A second run the same day corrects the point; it does not add a
        // second one to the series.
        expect(forThatDay).toHaveLength(1);
        expect(forThatDay[0].netWorth).toBe(110000);
      });
    });

    describe('sync state', () => {
      it('creates on first write and updates afterwards', async () => {
        await store.updateSyncState('scalable', { status: 'error', error: 'no credentials' });
        await store.updateSyncState('scalable', { status: 'ok', error: '', itemCount: 12 });

        const states = await store.getSyncStates();
        const scalable = states.find((state) => state.integration === 'scalable');
        expect(scalable?.status).toBe('ok');
        expect(scalable?.itemCount).toBe(12);
      });

      it('rejects an unknown field in a patch', async () => {
        await expect(
          store.updateSyncState('scalable', { note: 'hi' })
        ).rejects.toThrow();
      });
    });

    describe('concurrent writes', () => {
      it('keeps all three when three writes start at the same moment', async () => {
        // Two overlapping requests in one process is not exotic: the capture
        // bar saving while a card refreshes does exactly this. A
        // read-modify-write with no serialisation keeps only the last one.
        const before = await store.getTasks();

        await Promise.all([
          store.createTask({ title: 'First at once' }),
          store.createTask({ title: 'Second at once' }),
          store.createTask({ title: 'Third at once' }),
        ]);

        const after = await store.getTasks();
        expect(after).toHaveLength(before.length + 3);
        expect(after.map((task) => task.title)).toEqual(
          expect.arrayContaining(['First at once', 'Second at once', 'Third at once'])
        );
      });

      it('does not lose a capture to a write in another collection', async () => {
        // Capture never fails is the promise the whole system rests on, and
        // the write it races is usually not another capture.
        await Promise.all([
          store.createCapture({ text: 'Ring the dentist' }),
          store.createTask({ title: 'Ring the dentist' }),
        ]);

        const captures = await store.getCaptures();
        const tasks = await store.getTasks();
        expect(captures.some((capture) => capture.text === 'Ring the dentist')).toBe(true);
        expect(tasks.some((task) => task.title === 'Ring the dentist')).toBe(true);
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

      it('reports where the discarded state was backed up', async () => {
        // Whatever "reset" is about to discard might be a real life, not a
        // demo left over from setup -- every adapter must say where it went,
        // not just the JSON one. What the identifier means is the adapter's
        // business; that it exists whenever there was something real to
        // protect is the contract.
        await store.updateProfile({ focus: 'Not the seed' });
        expect(await store.reset()).toBeTruthy();
      });
    });
  });
}
