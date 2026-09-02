/**
 * The local-path storage adapter: one JSON document on your own disk.
 *
 * Every function here is named after the domain, never after the file. That
 * is deliberate -- the rest of the application asks for `createTask`, and the
 * fact that a task is a row in an array inside a document is knowledge that
 * stops at this module's edge.
 */

import { DESTINATIONS, TEMPERATURES, URGENCY_BANDS } from '../../../personalos.config.js';
import { isDayKey, dayKeyRange } from '../../domain/dates.js';
import { createId } from '../../domain/ids.js';
import { readState, resetState, updateState } from './file.js';

/** @returns {string} */
function now() {
  return new Date().toISOString();
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireText(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(field + ' is required and must be a non-empty string');
  }
  return value.trim();
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {readonly string[]} allowed
 * @param {string} fallback
 * @returns {string}
 */
function requireOneOf(value, field, allowed, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(
      field + ' must be one of ' + allowed.join(', ') + ', received ' + JSON.stringify(value)
    );
  }
  return value;
}

/**
 * @param {string} dayKey
 * @returns {string}
 */
function requireDayKey(dayKey) {
  if (!isDayKey(dayKey)) {
    throw new Error('expected a YYYY-MM-DD day key, received ' + JSON.stringify(dayKey));
  }
  return dayKey;
}

/**
 * Newest first, optionally capped. Used by every append-only collection.
 *
 * @template T
 * @param {T[]} entries
 * @param {{ limit?: number } | undefined} options
 * @returns {T[]}
 */
function mostRecent(entries, options) {
  const ordered = [...entries].reverse();
  const limit = options?.limit;
  return typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
}

/**
 * @param {string} dayKey
 * @returns {import('../../domain/types.js').DailyLog}
 */
function emptyDailyLog(dayKey) {
  return { date: dayKey, habits: {}, meals: [], measurements: [], notes: [] };
}

/** @type {import('../contract.js').StoreAdapter} */
export const jsonAdapter = {
  name: 'json',

  async getProfile() {
    const state = await readState();
    return state.profile;
  },

  async updateProfile(patch) {
    return updateState((state) => {
      state.profile = { ...state.profile, ...patch };
      return state.profile;
    });
  },

  async getTasks() {
    const state = await readState();
    return state.tasks;
  },

  async getTask(id) {
    const state = await readState();
    return state.tasks.find((task) => task.id === id) ?? null;
  },

  async createTask(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const title = requireText(draft.title, 'title');
    // 'overdue' is never an input value: a task is moved there by time
    // passing, so accepting it here would let a capture create a lie.
    const band = requireOneOf(draft.band, 'band', ['today', 'week', 'later'], 'today');
    const temperature = requireOneOf(draft.temperature, 'temperature', TEMPERATURES, 'warm');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Task} */
      const task = {
        id: createId('task'),
        title,
        note: typeof draft.note === 'string' ? draft.note : '',
        band: /** @type {import('../../domain/types.js').Task['band']} */ (band),
        temperature:
          /** @type {import('../../domain/types.js').Task['temperature']} */ (temperature),
        personId: typeof draft.personId === 'string' ? draft.personId : null,
        tags: Array.isArray(draft.tags) ? draft.tags.map(String) : [],
        // New work enters at the head of its band, including work that
        // arrived from a capture while you were not looking.
        position: 0,
        createdAt: now(),
        completedAt: null,
      };

      for (const existing of state.tasks) {
        if (existing.band === task.band) existing.position += 1;
      }
      state.tasks.push(task);
      return task;
    });
  },

  async updateTask(id, patch) {
    const draft = /** @type {Record<string, unknown>} */ (patch);
    if (draft.band !== undefined) requireOneOf(draft.band, 'band', URGENCY_BANDS, 'today');
    if (draft.temperature !== undefined) {
      requireOneOf(draft.temperature, 'temperature', TEMPERATURES, 'warm');
    }

    return updateState((state) => {
      const task = state.tasks.find((item) => item.id === id);
      if (!task) throw new Error('no task with id ' + id);
      Object.assign(task, draft, { id: task.id, createdAt: task.createdAt });
      return task;
    });
  },

  async deleteTask(id) {
    await updateState((state) => {
      const index = state.tasks.findIndex((item) => item.id === id);
      if (index === -1) throw new Error('no task with id ' + id);
      state.tasks.splice(index, 1);
      return undefined;
    });
  },

  async getPeople() {
    const state = await readState();
    return state.people;
  },

  async getPerson(id) {
    const state = await readState();
    return state.people.find((person) => person.id === id) ?? null;
  },

  async createPerson(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const name = requireText(draft.name, 'name');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Person} */
      const person = {
        id: createId('person'),
        name,
        organization: typeof draft.organization === 'string' ? draft.organization : '',
        kind: typeof draft.kind === 'string' ? draft.kind : '',
        note: typeof draft.note === 'string' ? draft.note : '',
        createdAt: now(),
      };
      state.people.push(person);
      return person;
    });
  },

  async updatePerson(id, patch) {
    return updateState((state) => {
      const person = state.people.find((item) => item.id === id);
      if (!person) throw new Error('no person with id ' + id);
      Object.assign(person, patch, { id: person.id, createdAt: person.createdAt });
      return person;
    });
  },

  async getCaptures(options) {
    const state = await readState();
    return mostRecent(state.captures, options);
  },

  async createCapture(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const text = requireText(draft.text, 'text');
    // Validated against the canonical list, never against the model's
    // judgement: a destination nobody defined would produce an orphan record.
    const destination = requireOneOf(draft.destination, 'destination', DESTINATIONS, 'memory');
    // How the destination was decided. A silent fallback is a lie.
    const route = requireOneOf(draft.route, 'route', ['model', 'rules'], 'rules');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Capture} */
      const capture = {
        id: createId('capture'),
        text,
        source: typeof draft.source === 'string' ? draft.source : 'bar',
        destination,
        targetId: typeof draft.targetId === 'string' ? draft.targetId : null,
        route: /** @type {import('../../domain/types.js').Capture['route']} */ (route),
        createdAt: now(),
      };
      state.captures.push(capture);
      return capture;
    });
  },

  async getMemoryEntries(options) {
    const state = await readState();
    return mostRecent(state.memory, options);
  },

  async createMemoryEntry(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const text = requireText(draft.text, 'text');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').MemoryEntry} */
      const entry = {
        id: createId('memory'),
        text,
        source: typeof draft.source === 'string' ? draft.source : 'capture',
        createdAt: now(),
      };
      state.memory.push(entry);
      return entry;
    });
  },

  async getDailyLog(dayKey) {
    requireDayKey(dayKey);
    const state = await readState();
    return state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
  },

  async updateDailyLog(dayKey, patch) {
    requireDayKey(dayKey);
    return updateState((state) => {
      const existing = state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
      const merged = { ...existing, ...patch, date: dayKey };
      state.dailyLogs[dayKey] = merged;
      return merged;
    });
  },

  async getDailyLogs(from, to) {
    requireDayKey(from);
    requireDayKey(to);
    const state = await readState();
    // Days with no entry are returned empty rather than skipped, so callers
    // can tell "nothing recorded" apart from "not in the window". The Health
    // card depends on that distinction: an unrecorded day is not a zero.
    return dayKeyRange(from, to).map((key) => state.dailyLogs[key] ?? emptyDailyLog(key));
  },

  async getGoals() {
    const state = await readState();
    return state.goals;
  },

  async updateGoals(patch) {
    return updateState((state) => {
      state.goals = { ...state.goals, ...patch };
      return state.goals;
    });
  },

  async getActivity(options) {
    const state = await readState();
    return mostRecent(state.activity, options);
  },

  async recordActivity(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const action = requireText(draft.action, 'action');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').ActivityEntry} */
      const entry = {
        id: createId('activity'),
        action,
        subjectId: typeof draft.subjectId === 'string' ? draft.subjectId : '',
        detail: typeof draft.detail === 'string' ? draft.detail : '',
        at: now(),
      };
      state.activity.push(entry);
      return entry;
    });
  },

  async reset() {
    await resetState();
  },
};
