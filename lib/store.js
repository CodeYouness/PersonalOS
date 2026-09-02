/**
 * The only way into the data. Nothing else may reach storage.
 *
 * No component and no route handler reads or writes records directly: they
 * ask this module. That is the guide's single architectural rule, and it is
 * what makes the move from a JSON file to Postgres a rewrite of one adapter
 * instead of an archaeology expedition through twenty components.
 *
 * The functions below are the domain -- getTasks, createTask, getDailyLog --
 * and never storage primitives such as readJSON or writeJSON. If you ever
 * find yourself wanting to export the raw document from here, that is the
 * signal that a domain operation is missing.
 *
 * Server only: it reaches the filesystem and the environment.
 */

import { assertImplementsContract } from './adapters/contract.js';
import { jsonAdapter } from './adapters/json/index.js';

/**
 * Exactly one adapter is active per deployment. Today the local path has one;
 * the database adapter of the guide's full path plugs in here, implementing
 * the same contract, and nothing above this line changes.
 *
 * @type {import('./adapters/contract.js').StoreAdapter}
 */
const adapter = jsonAdapter;

assertImplementsContract(adapter);

/** Which storage is active. Useful in diagnostics, never in business logic. */
export const storageName = adapter.name;

export const getProfile = adapter.getProfile;
export const updateProfile = adapter.updateProfile;

export const getTasks = adapter.getTasks;
export const getTask = adapter.getTask;
export const createTask = adapter.createTask;
export const updateTask = adapter.updateTask;
export const deleteTask = adapter.deleteTask;

export const getPeople = adapter.getPeople;
export const getPerson = adapter.getPerson;
export const createPerson = adapter.createPerson;
export const updatePerson = adapter.updatePerson;

export const getCaptures = adapter.getCaptures;
export const createCapture = adapter.createCapture;

export const getMemoryEntries = adapter.getMemoryEntries;
export const createMemoryEntry = adapter.createMemoryEntry;

export const getDailyLog = adapter.getDailyLog;
export const updateDailyLog = adapter.updateDailyLog;
export const getDailyLogs = adapter.getDailyLogs;

export const getGoals = adapter.getGoals;
export const updateGoals = adapter.updateGoals;

export const getActivity = adapter.getActivity;
export const recordActivity = adapter.recordActivity;

/** Throws the working data away and starts again from the seed. */
export const resetToSeed = adapter.reset;
