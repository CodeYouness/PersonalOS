/**
 * The three corrective actions on a capture -- Delete (#21), Undo (#22),
 * Refile (#23) -- exercised directly through lib/store.js, the same way
 * tests/store/json-adapter.test.js exercises the adapter it sits on.
 */

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** @type {string} */
let sandbox;
/** @type {typeof import('@/lib/store.js')} */
let store;

beforeAll(async () => {
  sandbox = await mkdtemp(path.join(tmpdir(), 'personalos-capture-corrections-'));
  await cp('data/seed.json', path.join(sandbox, 'seed.json'));
  process.env.DATA_DIR = sandbox;
  store = await import('@/lib/store.js');
});

afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

beforeEach(async () => {
  await store.resetToSeed();
});

describe('deleteCaptureCascade', () => {
  it('removes the capture, its memory entry, its produced task, and every link', async () => {
    const task = await store.createTask({ title: 'Reply to Marta', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Reply to Marta',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    const memory = await store.createMemoryEntry({
      content: 'Reply to Marta',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getMemoryEntries()).not.toContainEqual(
      expect.objectContaining({ id: memory.id })
    );
    const links = await store.getLinks({});
    expect(links.some((link) => link.from === capture.id || link.to === capture.id)).toBe(false);
    expect(links.some((link) => link.from === task.id || link.to === task.id)).toBe(false);

    const events = await store.getEvents({});
    const event = events.find((entry) => entry.type === 'capture.deleted' && entry.subject === capture.id);
    expect(event?.payload).toEqual({ text: 'Reply to Marta', destination: 'task' });
  });

  it('removes a produced goal the same way it removes a produced task', async () => {
    const goal = await store.createGoal({ name: 'Ship the pricing page', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Ship the pricing page',
      destination: 'goals',
      route: 'model',
    });
    await store.createLink({ from: capture.id, to: goal.id, rel: 'about' });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
    expect(await store.getGoal(goal.id)).toBeNull();
    const links = await store.getLinks({});
    expect(links.some((link) => link.from === goal.id || link.to === goal.id)).toBe(false);
  });

  it('removes a produced appointment the same way it removes a produced task', async () => {
    const appointment = await store.createAppointment({
      title: 'Riunione con Marco',
      date: '2026-09-10',
      startTime: '15:00',
      source: 'capture',
    });
    const capture = await store.createCapture({
      text: 'riunione con Marco giovedì alle 15',
      destination: 'appointment',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: appointment.id, rel: 'about' });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
    expect(await store.getAppointment(appointment.id)).toBeNull();
    const links = await store.getLinks({});
    expect(links.some((link) => link.from === appointment.id || link.to === appointment.id)).toBe(false);
  });

  it('deletes a capture with no produced record just as well', async () => {
    const capture = await store.createCapture({ text: 'porridge with berries', destination: 'nutrition' });
    await store.createMemoryEntry({
      content: 'porridge with berries',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.deleteCaptureCascade(capture.id);

    expect(await store.getCapture(capture.id)).toBeNull();
  });

  it('throws for a capture that does not exist', async () => {
    await expect(store.deleteCaptureCascade('capture_missing')).rejects.toThrow();
  });
});

describe('undoCaptureFiling', () => {
  it('removes the produced task but keeps the capture and its memory entry', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    const memory = await store.createMemoryEntry({
      content: 'Book the flights',
      source: 'capture',
      derivedFrom: capture.id,
    });

    await store.undoCaptureFiling(capture.id);

    expect(await store.getTask(task.id)).toBeNull();
    expect(await store.getCapture(capture.id)).not.toBeNull();
    expect(await store.getMemoryEntries()).toContainEqual(expect.objectContaining({ id: memory.id }));

    const events = await store.getEvents({});
    expect(events.some((event) => event.type === 'capture.undone' && event.subject === capture.id)).toBe(
      true
    );
  });

  it('removes a produced appointment the same way it removes a produced task', async () => {
    const appointment = await store.createAppointment({
      title: 'Riunione con Marco',
      date: '2026-09-10',
      startTime: '15:00',
      source: 'capture',
    });
    const capture = await store.createCapture({
      text: 'riunione con Marco giovedì alle 15',
      destination: 'appointment',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: appointment.id, rel: 'about' });

    await store.undoCaptureFiling(capture.id);

    expect(await store.getAppointment(appointment.id)).toBeNull();
    expect(await store.getCapture(capture.id)).not.toBeNull();
  });

  it('refuses once the produced task has been completed', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    await store.updateTask(task.id, { completedAt: new Date(0).toISOString() });

    await expect(store.undoCaptureFiling(capture.id)).rejects.toThrow();
    expect(await store.getTask(task.id)).not.toBeNull();
  });

  it('refuses a capture with nothing produced to undo', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    await expect(store.undoCaptureFiling(capture.id)).rejects.toThrow();
  });
});

describe('refileCapture', () => {
  it('retracts the old task and creates a new goal at the new destination', async () => {
    const task = await store.createTask({ title: 'Ship the pricing page', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Ship the pricing page',
      destination: 'task',
      route: 'model',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    const newRecordId = await store.refileCapture(capture.id, 'goals');

    expect(await store.getTask(task.id)).toBeNull();
    const goal = await store.getGoal(/** @type {string} */ (newRecordId));
    expect(goal?.name).toBe('Ship the pricing page');
    const aboutLinks = await store.getLinks({ from: capture.id, rel: 'about' });
    expect(aboutLinks.map((link) => link.to)).toEqual([newRecordId]);

    const refiled = await store.getCapture(capture.id);
    expect(refiled?.destination).toBe('goals');
    expect(refiled?.route).toBe('model');

    const events = await store.getEvents({});
    const event = events.find((entry) => entry.type === 'capture.refiled' && entry.subject === capture.id);
    expect(event?.payload).toEqual({ from: 'task', to: 'goals' });
  });

  it('retracts a produced record without creating one for a no-record destination', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    const newRecordId = await store.refileCapture(capture.id, 'memory');

    expect(newRecordId).toBeNull();
    expect(await store.getTask(task.id)).toBeNull();
    expect((await store.getCapture(capture.id))?.destination).toBe('memory');
  });

  it('refuses once the produced record has been touched', async () => {
    const goal = await store.createGoal({ name: 'Finish the audit', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Finish the audit',
      destination: 'goals',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: goal.id, rel: 'about' });
    await store.updateGoal(goal.id, { done: true });

    await expect(store.refileCapture(capture.id, 'task')).rejects.toThrow();
    expect(await store.getGoal(goal.id)).not.toBeNull();
  });

  it('refuses filing to the current destination while it still has a produced record', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    await expect(store.refileCapture(capture.id, 'task')).rejects.toThrow();
    expect(await store.getTask(task.id)).not.toBeNull();
  });

  it('allows refiling back to the same destination once nothing is produced there', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });
    await store.undoCaptureFiling(capture.id);
    expect(await store.getTask(task.id)).toBeNull();

    const newRecordId = await store.refileCapture(capture.id, 'task');

    const newTask = await store.getTask(/** @type {string} */ (newRecordId));
    expect(newTask?.title).toBe('Book the flights');
    expect((await store.getCapture(capture.id))?.destination).toBe('task');
  });

  it('allows refiling to the same no-record destination, as a true no-op', async () => {
    const capture = await store.createCapture({ text: 'porridge', destination: 'nutrition' });

    const newRecordId = await store.refileCapture(capture.id, 'nutrition');

    expect(newRecordId).toBeNull();
    expect((await store.getCapture(capture.id))?.destination).toBe('nutrition');
  });

  it('refuses an unknown destination without touching the existing record', async () => {
    const task = await store.createTask({ title: 'Book the flights', source: 'capture' });
    const capture = await store.createCapture({
      text: 'Book the flights',
      destination: 'task',
      route: 'rules',
    });
    await store.createLink({ from: capture.id, to: task.id, rel: 'about' });

    await expect(store.refileCapture(capture.id, 'errands')).rejects.toThrow();
    expect(await store.getTask(task.id)).not.toBeNull();
  });
});
