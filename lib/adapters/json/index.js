/**
 * The local-path storage adapter: one JSON document on your own disk.
 *
 * Every function is named after the domain, never after the file. The fact
 * that a task is a row in an array inside a document is knowledge that stops
 * at this module's edge.
 */

import {
  ACCOUNT_KINDS,
  DESTINATIONS,
  EVENT_TYPES,
  GOAL_KINDS,
  LINK_RELS,
  MEMORY_TYPES,
  OBSERVATION_KINDS,
  SOURCE_KINDS,
  TEMPERATURES,
  TRANSACTION_KINDS,
  URGENCY_BANDS,
} from '../../../personalos.config.js';
import { dayKeyRange, isDayKey, toDayKey } from '../../domain/dates.js';
import { createId } from '../../domain/ids.js';
import { requireRef, requireRefOfType } from '../../domain/refs.js';
import { readState, resetState, updateState, workingPath } from './file.js';

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
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireDayKey(value, field) {
  if (!isDayKey(value)) {
    throw new Error(field + ' must be a YYYY-MM-DD day key, received ' + JSON.stringify(value));
  }
  return /** @type {string} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireTimeString(value, field) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(field + ' must be an HH:MM time, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string | null}
 */
function requireNullableTimeString(value, field) {
  return value === undefined || value === null ? null : requireTimeString(value, field);
}

/**
 * Money is an integer count of minor units. Anything else is rejected here
 * rather than turning into 0.30000000000000004 three screens later.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requireMinorUnits(value, field) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(
      field + ' must be an integer in minor units (cents), received ' + JSON.stringify(value)
    );
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requirePositiveMinorUnits(value, field) {
  const amount = requireMinorUnits(value, field);
  if (amount < 0) throw new Error(field + ' must be positive; kind gives the direction');
  return amount;
}

/**
 * A lenient string check: any string is fine, including empty. For a field
 * that must also be non-empty, use requireText.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {string}
 */
function requireString(value, field) {
  if (typeof value !== 'string') {
    throw new Error(field + ' must be a string, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string | null}
 */
function requireNullableString(value, field) {
  return value === null ? null : requireString(value, field);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string | null}
 */
function requireNullableDayKey(value, field) {
  return value === null ? null : requireDayKey(value, field);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {boolean}
 */
function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new Error(field + ' must be a boolean, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requireNumber(value, field) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(field + ' must be a number, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {string[]}
 */
function requireStringArray(value, field) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(field + ' must be an array of strings, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * A shallow check: is this an array at all. Used for fields whose elements
 * are structured (meals, habits, finance categories) but that this store
 * layer does not otherwise validate the shape of -- the same depth create
 * validates them to today.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {unknown[]}
 */
function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(field + ' must be an array, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function requireRecord(value, field) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(field + ' must be an object, received ' + JSON.stringify(value));
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * A shallow check, matching the depth create already validates this field
 * to: null, or an object. The shape of an ExternalOrigin is not enforced
 * here any more than it is on the create path.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {Record<string, unknown> | null}
 */
function requireNullableObject(value, field) {
  return value === null ? null : requireRecord(value, field);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {{ current: number, target: number } | null}
 */
function requireProgress(value, field) {
  if (value === null) return null;
  const record = requireRecord(value, field);
  if (typeof record.current !== 'number' || typeof record.target !== 'number') {
    throw new Error(
      field + ' must be null or { current: number, target: number }, received ' +
        JSON.stringify(value)
    );
  }
  return { current: record.current, target: record.target };
}

/**
 * Validates a patch against a fixed set of updatable fields before it
 * reaches the record -- the same fields and validators the create path
 * already uses. An unknown key is rejected outright rather than written
 * through; a known field runs through its validator, which rejects the
 * wrong type the same way create would.
 *
 * Never include an entity's identity or timestamp fields in `fields`:
 * applyPatch (or the equivalent inline merge) re-asserts those afterwards,
 * but the real protection is that a patch mentioning them is rejected here,
 * before it gets that far.
 *
 * @param {Record<string, unknown>} patch
 * @param {Record<string, (value: unknown) => unknown>} fields
 * @returns {Record<string, unknown>}
 */
function validatePatch(patch, fields) {
  /** @type {Record<string, unknown>} */
  const validated = {};
  for (const key of Object.keys(patch)) {
    const validate = fields[key];
    if (!validate) throw new Error('unknown field in patch: ' + key);
    validated[key] = validate(patch[key]);
  }
  return validated;
}

/**
 * The four fields every canonical entity carries.
 *
 * @param {string} type
 * @param {unknown} source
 * @returns {{ id: string, createdAt: string, updatedAt: string, source: any }}
 */
function envelope(type, source) {
  const at = now();
  return {
    id: createId(type),
    createdAt: at,
    updatedAt: at,
    source: /** @type {any} */ (requireOneOf(source, 'source', SOURCE_KINDS, 'user')),
  };
}

/**
 * Applies a patch without ever letting it rewrite identity or creation time.
 *
 * @template {{ id: string, createdAt: string, updatedAt: string }} T
 * @param {T} entity
 * @param {object} patch
 * @returns {T}
 */
function applyPatch(entity, patch) {
  Object.assign(entity, patch, {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: now(),
  });
  return entity;
}

/**
 * Newest first, optionally capped.
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

/**
 * @template {{ id: string }} T
 * @param {T[]} collection
 * @param {string} id
 * @param {string} label
 * @returns {T}
 */
function requireById(collection, id, label) {
  const found = collection.find((item) => item.id === id);
  if (!found) throw new Error('no ' + label + ' with id ' + id);
  return found;
}

/**
 * The fields an update may touch, one map per entity family, each validator
 * the same one create uses for that field. Never id, createdAt, updatedAt or
 * source: those identify or date the record, and a patch naming them is
 * rejected by validatePatch rather than silently overwritten.
 */

const TASK_PATCH_FIELDS = {
  title: (/** @type {unknown} */ v) => requireText(v, 'title'),
  note: (/** @type {unknown} */ v) => requireString(v, 'note'),
  band: (/** @type {unknown} */ v) => requireOneOf(v, 'band', URGENCY_BANDS, 'today'),
  bandSetOn: (/** @type {unknown} */ v) => requireDayKey(v, 'bandSetOn'),
  temperature: (/** @type {unknown} */ v) => requireOneOf(v, 'temperature', TEMPERATURES, 'warm'),
  tags: (/** @type {unknown} */ v) => requireStringArray(v, 'tags'),
  position: (/** @type {unknown} */ v) => requireNumber(v, 'position'),
  completedAt: (/** @type {unknown} */ v) => requireNullableString(v, 'completedAt'),
};

const PERSON_PATCH_FIELDS = {
  name: (/** @type {unknown} */ v) => requireText(v, 'name'),
  organization: (/** @type {unknown} */ v) => requireString(v, 'organization'),
  kind: (/** @type {unknown} */ v) => requireString(v, 'kind'),
  note: (/** @type {unknown} */ v) => requireString(v, 'note'),
};

const GOAL_PATCH_FIELDS = {
  name: (/** @type {unknown} */ v) => requireText(v, 'name'),
  kind: (/** @type {unknown} */ v) => requireOneOf(v, 'kind', GOAL_KINDS, 'objective'),
  horizon: (/** @type {unknown} */ v) => requireOneOf(v, 'horizon', ['week', 'month', 'open'], 'week'),
  done: (/** @type {unknown} */ v) => requireBoolean(v, 'done'),
  progress: (/** @type {unknown} */ v) => requireProgress(v, 'progress'),
  targetDate: (/** @type {unknown} */ v) => requireNullableDayKey(v, 'targetDate'),
};

const MEMORY_PATCH_FIELDS = {
  type: (/** @type {unknown} */ v) => requireOneOf(v, 'type', MEMORY_TYPES, 'fact'),
  content: (/** @type {unknown} */ v) => requireText(v, 'content'),
  confidence: (/** @type {unknown} */ v) => requireNumber(v, 'confidence'),
  tags: (/** @type {unknown} */ v) => requireStringArray(v, 'tags'),
  validFrom: (/** @type {unknown} */ v) => requireNullableDayKey(v, 'validFrom'),
  validUntil: (/** @type {unknown} */ v) => requireNullableDayKey(v, 'validUntil'),
};

const JOURNAL_PATCH_FIELDS = {
  date: (/** @type {unknown} */ v) => requireDayKey(v, 'date'),
  text: (/** @type {unknown} */ v) => requireText(v, 'text'),
  tags: (/** @type {unknown} */ v) => requireStringArray(v, 'tags'),
};

const ACCOUNT_PATCH_FIELDS = {
  name: (/** @type {unknown} */ v) => requireText(v, 'name'),
  kind: (/** @type {unknown} */ v) => requireOneOf(v, 'kind', ACCOUNT_KINDS, 'cash'),
  currency: (/** @type {unknown} */ v) => requireString(v, 'currency'),
  origin: (/** @type {unknown} */ v) => requireNullableObject(v, 'origin'),
  archived: (/** @type {unknown} */ v) => requireBoolean(v, 'archived'),
};

const TRANSACTION_PATCH_FIELDS = {
  date: (/** @type {unknown} */ v) => requireDayKey(v, 'date'),
  amount: (/** @type {unknown} */ v) => requirePositiveMinorUnits(v, 'amount'),
  currency: (/** @type {unknown} */ v) => requireString(v, 'currency'),
  description: (/** @type {unknown} */ v) => requireString(v, 'description'),
  kind: (/** @type {unknown} */ v) => requireOneOf(v, 'kind', TRANSACTION_KINDS, 'expense'),
  accountId: (/** @type {unknown} */ v) => requireRefOfType(v, 'accountId', ['account']),
  counterAccountId: (/** @type {unknown} */ v) =>
    v === null ? null : requireRefOfType(v, 'counterAccountId', ['account']),
  categoryId: (/** @type {unknown} */ v) => (v === null ? null : requireString(v, 'categoryId')),
  note: (/** @type {unknown} */ v) => requireString(v, 'note'),
  origin: (/** @type {unknown} */ v) => requireNullableObject(v, 'origin'),
};

const PROFILE_PATCH_FIELDS = {
  name: (/** @type {unknown} */ v) => requireString(v, 'name'),
  role: (/** @type {unknown} */ v) => requireString(v, 'role'),
  city: (/** @type {unknown} */ v) => requireString(v, 'city'),
  focus: (/** @type {unknown} */ v) => requireString(v, 'focus'),
  habits: (/** @type {unknown} */ v) => requireArray(v, 'habits'),
  calorieTarget: (/** @type {unknown} */ v) => requireNumber(v, 'calorieTarget'),
  baseCurrency: (/** @type {unknown} */ v) => requireString(v, 'baseCurrency'),
  financeCategories: (/** @type {unknown} */ v) => requireArray(v, 'financeCategories'),
};

const DAILY_LOG_PATCH_FIELDS = {
  habits: (/** @type {unknown} */ v) => requireRecord(v, 'habits'),
  meals: (/** @type {unknown} */ v) => requireArray(v, 'meals'),
  measurements: (/** @type {unknown} */ v) => requireArray(v, 'measurements'),
  notes: (/** @type {unknown} */ v) => requireStringArray(v, 'notes'),
};

const SYNC_STATE_PATCH_FIELDS = {
  lastRunAt: (/** @type {unknown} */ v) => requireNullableString(v, 'lastRunAt'),
  status: (/** @type {unknown} */ v) => requireOneOf(v, 'status', ['ok', 'error', 'never'], 'never'),
  error: (/** @type {unknown} */ v) => requireString(v, 'error'),
  itemCount: (/** @type {unknown} */ v) => requireNumber(v, 'itemCount'),
};

const CAPTURE_PATCH_FIELDS = {
  destination: (/** @type {unknown} */ v) => requireOneOf(v, 'destination', DESTINATIONS, 'memory'),
};

/** @type {import('../contract.js').StoreAdapter} */
export const jsonAdapter = {
  name: 'json',

  async getProfile() {
    return (await readState()).profile;
  },

  async updateProfile(patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), PROFILE_PATCH_FIELDS);
    return updateState((state) => {
      state.profile = { ...state.profile, ...validated };
      return state.profile;
    });
  },

  async getTasks() {
    return (await readState()).tasks;
  },

  async getTask(id) {
    return (await readState()).tasks.find((task) => task.id === id) ?? null;
  },

  async createTask(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const title = requireText(draft.title, 'title');
    // 'overdue' is not in URGENCY_BANDS and cannot be requested: being late
    // is something time does to a task, never how it starts.
    const band = requireOneOf(draft.band, 'band', URGENCY_BANDS, 'today');
    const temperature = requireOneOf(draft.temperature, 'temperature', TEMPERATURES, 'warm');
    const bandSetOn = draft.bandSetOn === undefined
      ? toDayKey(new Date())
      : requireDayKey(draft.bandSetOn, 'bandSetOn');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Task} */
      const task = {
        ...envelope('task', draft.source),
        title,
        note: typeof draft.note === 'string' ? draft.note : '',
        band: /** @type {any} */ (band),
        bandSetOn,
        temperature: /** @type {any} */ (temperature),
        tags: Array.isArray(draft.tags) ? draft.tags.map(String) : [],
        // New work enters at the head of its band, including work that
        // arrived from a capture while you were not looking.
        position: 0,
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
    // Moving a task to a band restarts its clock. Without this, a task
    // dragged out of "overdue" back into "today" would still read as late.
    if (draft.band !== undefined && draft.bandSetOn === undefined) {
      draft.bandSetOn = toDayKey(new Date());
    }
    const validated = validatePatch(draft, TASK_PATCH_FIELDS);

    return updateState((state) => applyPatch(requireById(state.tasks, id, 'task'), validated));
  },

  async deleteTask(id) {
    await updateState((state) => {
      const index = state.tasks.findIndex((task) => task.id === id);
      if (index === -1) throw new Error('no task with id ' + id);
      state.tasks.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getAppointments() {
    return (await readState()).appointments;
  },

  async getAppointment(id) {
    return (await readState()).appointments.find((appointment) => appointment.id === id) ?? null;
  },

  async createAppointment(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const title = requireText(draft.title, 'title');
    const date = requireDayKey(draft.date, 'date');
    const startTime = requireTimeString(draft.startTime, 'startTime');
    const endTime = requireNullableTimeString(draft.endTime, 'endTime');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Appointment} */
      const appointment = {
        ...envelope('appointment', draft.source),
        title,
        date,
        startTime,
        endTime,
        calendarLabel: typeof draft.calendarLabel === 'string' ? draft.calendarLabel : '',
        origin: null,
      };
      state.appointments.push(appointment);
      return appointment;
    });
  },

  async deleteAppointment(id) {
    await updateState((state) => {
      const index = state.appointments.findIndex((appointment) => appointment.id === id);
      if (index === -1) throw new Error('no appointment with id ' + id);
      state.appointments.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getPeople() {
    return (await readState()).people;
  },

  async getPerson(id) {
    return (await readState()).people.find((person) => person.id === id) ?? null;
  },

  async createPerson(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const name = requireText(draft.name, 'name');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Person} */
      const person = {
        ...envelope('person', draft.source),
        name,
        organization: typeof draft.organization === 'string' ? draft.organization : '',
        kind: typeof draft.kind === 'string' ? draft.kind : '',
        note: typeof draft.note === 'string' ? draft.note : '',
      };
      state.people.push(person);
      return person;
    });
  },

  async updatePerson(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), PERSON_PATCH_FIELDS);
    return updateState((state) => applyPatch(requireById(state.people, id, 'person'), validated));
  },

  async getGoals() {
    return (await readState()).goals;
  },

  async getGoal(id) {
    return (await readState()).goals.find((goal) => goal.id === id) ?? null;
  },

  async createGoal(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const name = requireText(draft.name, 'name');
    const kind = requireOneOf(draft.kind, 'kind', GOAL_KINDS, 'objective');
    // A horizon is a label you chose, never an expiry. Nothing in this
    // codebase may clear a goal because a week ended.
    const horizon = requireOneOf(draft.horizon, 'horizon', ['week', 'month', 'open'], 'week');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Goal} */
      const goal = {
        ...envelope('goal', draft.source),
        name,
        kind: /** @type {any} */ (kind),
        horizon: /** @type {any} */ (horizon),
        done: draft.done === true,
        progress: draft.progress === undefined ? null : /** @type {any} */ (draft.progress),
        targetDate:
          draft.targetDate === undefined || draft.targetDate === null
            ? null
            : requireDayKey(draft.targetDate, 'targetDate'),
      };
      state.goals.push(goal);
      return goal;
    });
  },

  async updateGoal(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), GOAL_PATCH_FIELDS);
    return updateState((state) => applyPatch(requireById(state.goals, id, 'goal'), validated));
  },

  async deleteGoal(id) {
    await updateState((state) => {
      const index = state.goals.findIndex((goal) => goal.id === id);
      if (index === -1) throw new Error('no goal with id ' + id);
      state.goals.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getLinks(query) {
    const state = await readState();
    return state.links.filter((link) => {
      if (query?.from !== undefined && link.from !== query.from) return false;
      if (query?.to !== undefined && link.to !== query.to) return false;
      if (query?.rel !== undefined && link.rel !== query.rel) return false;
      return true;
    });
  },

  async createLink(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const from = requireRef(draft.from, 'from');
    const to = requireRef(draft.to, 'to');
    const rel = requireOneOf(draft.rel, 'rel', LINK_RELS, 'about');
    if (from === to) throw new Error('a link cannot join an entity to itself');

    return updateState((state) => {
      // Links are a set, not a bag: relating the same two things twice with
      // the same rel is the same fact, not two facts.
      const existing = state.links.find(
        (link) => link.from === from && link.to === to && link.rel === rel
      );
      if (existing) return existing;

      /** @type {import('../../domain/types.js').Link} */
      const link = {
        id: createId('link'),
        from,
        to,
        rel,
        confidence:
          typeof draft.confidence === 'number' ? draft.confidence : null,
        createdAt: now(),
        source: /** @type {any} */ (requireOneOf(draft.source, 'source', SOURCE_KINDS, 'user')),
      };
      state.links.push(link);
      return link;
    });
  },

  async deleteLink(id) {
    await updateState((state) => {
      const index = state.links.findIndex((link) => link.id === id);
      if (index === -1) throw new Error('no link with id ' + id);
      state.links.splice(index, 1);
      return undefined;
    });
  },

  async deleteLinksFor(ref) {
    await updateState((state) => {
      state.links = state.links.filter((link) => link.from !== ref && link.to !== ref);
      return undefined;
    });
  },

  async getCaptures(options) {
    return mostRecent((await readState()).captures, options);
  },

  async getCapture(id) {
    return (await readState()).captures.find((capture) => capture.id === id) ?? null;
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
        ...envelope('capture', draft.source ?? 'capture'),
        text,
        origin: typeof draft.origin === 'string' ? draft.origin : 'bar',
        destination,
        route: /** @type {any} */ (route),
      };
      state.captures.push(capture);
      return capture;
    });
  },

  async updateCapture(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), CAPTURE_PATCH_FIELDS);
    return updateState((state) => applyPatch(requireById(state.captures, id, 'capture'), validated));
  },

  async deleteCapture(id) {
    await updateState((state) => {
      const index = state.captures.findIndex((capture) => capture.id === id);
      if (index === -1) throw new Error('no capture with id ' + id);
      state.captures.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getMemoryEntries(options) {
    const state = await readState();
    const filtered =
      options?.type === undefined
        ? state.memory
        : state.memory.filter((entry) => entry.type === options.type);
    return mostRecent(filtered, options);
  },

  async createMemoryEntry(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const content = requireText(draft.content, 'content');
    const type = requireOneOf(draft.type, 'type', MEMORY_TYPES, 'fact');
    const source = requireOneOf(draft.source, 'source', SOURCE_KINDS, 'user');
    // A memory the system extracted must be able to say where it came from.
    // Without this rule the archive fills with confident claims that nothing
    // backs, which is exactly how a memory starts inventing.
    const derivedFrom = draft.derivedFrom;
    if (source !== 'user' && source !== 'seed' && derivedFrom === undefined) {
      throw new Error(
        'a memory with source "' + source + '" must carry derivedFrom, a reference to its origin'
      );
    }
    if (derivedFrom !== undefined) requireRef(derivedFrom, 'derivedFrom');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').MemoryEntry} */
      const entry = {
        ...envelope('memory', source),
        type: /** @type {any} */ (type),
        content,
        confidence: typeof draft.confidence === 'number' ? draft.confidence : 1,
        tags: Array.isArray(draft.tags) ? draft.tags.map(String) : [],
        validFrom:
          draft.validFrom === undefined || draft.validFrom === null
            ? null
            : requireDayKey(draft.validFrom, 'validFrom'),
        validUntil:
          draft.validUntil === undefined || draft.validUntil === null
            ? null
            : requireDayKey(draft.validUntil, 'validUntil'),
        embedding: null,
      };
      state.memory.push(entry);

      if (typeof derivedFrom === 'string') {
        state.links.push({
          id: createId('link'),
          from: entry.id,
          to: derivedFrom,
          rel: 'derived_from',
          confidence: null,
          createdAt: now(),
          source: /** @type {any} */ (source),
        });
      }
      return entry;
    });
  },

  async updateMemoryEntry(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), MEMORY_PATCH_FIELDS);
    return updateState((state) =>
      applyPatch(requireById(state.memory, id, 'memory entry'), validated)
    );
  },

  async deleteMemoryEntry(id) {
    await updateState((state) => {
      const index = state.memory.findIndex((entry) => entry.id === id);
      if (index === -1) throw new Error('no memory entry with id ' + id);
      state.memory.splice(index, 1);
      // Deleting a memory never touches the journal entry it came from: the
      // writing is the primary record, the memory was only a reading of it.
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getJournalEntries(from, to) {
    requireDayKey(from, 'from');
    requireDayKey(to, 'to');
    const state = await readState();
    return state.journal
      .filter((entry) => entry.date >= from && entry.date <= to)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  },

  async getJournalEntry(id) {
    return (await readState()).journal.find((entry) => entry.id === id) ?? null;
  },

  async createJournalEntry(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const text = requireText(draft.text, 'text');
    const date = draft.date === undefined
      ? toDayKey(new Date())
      : requireDayKey(draft.date, 'date');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').JournalEntry} */
      const entry = {
        ...envelope('journal', draft.source ?? 'user'),
        date,
        text,
        tags: Array.isArray(draft.tags) ? draft.tags.map(String) : [],
      };
      // Several entries a day are allowed on purpose: a morning thought and
      // an evening one are two things, not a document to be merged.
      state.journal.push(entry);
      return entry;
    });
  },

  async updateJournalEntry(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), JOURNAL_PATCH_FIELDS);
    return updateState((state) =>
      applyPatch(requireById(state.journal, id, 'journal entry'), validated)
    );
  },

  async deleteJournalEntry(id) {
    await updateState((state) => {
      const index = state.journal.findIndex((entry) => entry.id === id);
      if (index === -1) throw new Error('no journal entry with id ' + id);
      state.journal.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getEvents(options) {
    const state = await readState();
    const filtered = state.events.filter((event) => {
      if (options?.from !== undefined && event.date < options.from) return false;
      if (options?.to !== undefined && event.date > options.to) return false;
      return true;
    });
    return mostRecent(filtered, options);
  },

  async recordEvent(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const type = requireOneOf(draft.type, 'type', EVENT_TYPES, 'task.created');
    const at = typeof draft.at === 'string' ? draft.at : now();
    if (draft.subject !== undefined && draft.subject !== null) {
      requireRef(draft.subject, 'subject');
    }

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Event} */
      const event = {
        id: createId('event'),
        type,
        at,
        // The day key is stored so the timeline can be queried by day without
        // every reader re-deriving it -- and re-deriving it in the wrong zone.
        date: draft.date === undefined
          ? toDayKey(new Date(at))
          : requireDayKey(draft.date, 'date'),
        subject: typeof draft.subject === 'string' ? draft.subject : null,
        payload: typeof draft.payload === 'object' && draft.payload !== null
          ? /** @type {Record<string, unknown>} */ (draft.payload)
          : {},
        source: /** @type {any} */ (requireOneOf(draft.source, 'source', SOURCE_KINDS, 'user')),
      };
      state.events.push(event);
      return event;
    });
  },

  async getDailyLog(dayKey) {
    requireDayKey(dayKey, 'dayKey');
    const state = await readState();
    return state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
  },

  async updateDailyLog(dayKey, patch) {
    requireDayKey(dayKey, 'dayKey');
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), DAILY_LOG_PATCH_FIELDS);
    return updateState((state) => {
      const existing = state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
      const merged = { ...existing, ...validated, date: dayKey };
      state.dailyLogs[dayKey] = merged;
      return merged;
    });
  },

  async getDailyLogs(from, to) {
    requireDayKey(from, 'from');
    requireDayKey(to, 'to');
    const state = await readState();
    // Days with no entry come back empty rather than missing, so callers can
    // tell "nothing recorded" from "outside the window". The health averages
    // depend on that distinction: an unrecorded day is not a zero.
    return dayKeyRange(from, to).map((key) => state.dailyLogs[key] ?? emptyDailyLog(key));
  },

  async getAccounts() {
    return (await readState()).accounts;
  },

  async createAccount(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const name = requireText(draft.name, 'name');
    const kind = requireOneOf(draft.kind, 'kind', ACCOUNT_KINDS, 'cash');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').FinanceAccount} */
      const account = {
        ...envelope('account', draft.source),
        name,
        kind: /** @type {any} */ (kind),
        currency: typeof draft.currency === 'string' ? draft.currency : state.profile.baseCurrency,
        origin: /** @type {any} */ (draft.origin ?? null),
        archived: draft.archived === true,
      };
      state.accounts.push(account);
      return account;
    });
  },

  async updateAccount(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), ACCOUNT_PATCH_FIELDS);
    return updateState((state) => applyPatch(requireById(state.accounts, id, 'account'), validated));
  },

  async getObservations(options) {
    const state = await readState();
    return state.observations.filter((observation) => {
      if (options?.accountId !== undefined && observation.accountId !== options.accountId) {
        return false;
      }
      if (options?.from !== undefined && observation.date < options.from) return false;
      if (options?.to !== undefined && observation.date > options.to) return false;
      return true;
    });
  },

  async recordObservation(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const accountId = requireRefOfType(draft.accountId, 'accountId', ['account']);
    const kind = requireOneOf(draft.kind, 'kind', OBSERVATION_KINDS, 'balance');
    const amount = requireMinorUnits(draft.amount, 'amount');
    const date = requireDayKey(draft.date, 'date');

    return updateState((state) => {
      requireById(state.accounts, accountId, 'account');
      /** @type {import('../../domain/types.js').FinanceObservation} */
      const observation = {
        ...envelope('observation', draft.source ?? 'user'),
        accountId,
        kind: /** @type {any} */ (kind),
        amount,
        currency: typeof draft.currency === 'string' ? draft.currency : state.profile.baseCurrency,
        date,
        observedAt: typeof draft.observedAt === 'string' ? draft.observedAt : now(),
        origin: /** @type {any} */ (draft.origin ?? null),
      };
      state.observations.push(observation);
      return observation;
    });
  },

  async getTransactions(options) {
    const state = await readState();
    const filtered = state.transactions.filter((transaction) => {
      if (options?.from !== undefined && transaction.date < options.from) return false;
      if (options?.to !== undefined && transaction.date > options.to) return false;
      return true;
    });
    return mostRecent(filtered, options);
  },

  async createTransaction(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const kind = requireOneOf(draft.kind, 'kind', TRANSACTION_KINDS, 'expense');
    const amount = requirePositiveMinorUnits(draft.amount, 'amount');
    const date = requireDayKey(draft.date, 'date');
    const accountId = requireRefOfType(draft.accountId, 'accountId', ['account']);
    // A transfer without its other side would be counted as a disappearance.
    const counterAccountId =
      kind === 'transfer'
        ? requireRefOfType(draft.counterAccountId, 'counterAccountId', ['account'])
        : null;

    return updateState((state) => {
      requireById(state.accounts, accountId, 'account');
      /** @type {import('../../domain/types.js').Transaction} */
      const transaction = {
        ...envelope('transaction', draft.source ?? 'user'),
        date,
        amount,
        currency: typeof draft.currency === 'string' ? draft.currency : state.profile.baseCurrency,
        description: typeof draft.description === 'string' ? draft.description : '',
        kind: /** @type {any} */ (kind),
        accountId,
        counterAccountId,
        categoryId: typeof draft.categoryId === 'string' ? draft.categoryId : null,
        note: typeof draft.note === 'string' ? draft.note : '',
        origin: /** @type {any} */ (draft.origin ?? null),
      };
      state.transactions.push(transaction);
      return transaction;
    });
  },

  async updateTransaction(id, patch) {
    const validated = validatePatch(
      /** @type {Record<string, unknown>} */ (patch),
      TRANSACTION_PATCH_FIELDS
    );
    return updateState((state) => {
      const target = requireById(state.transactions, id, 'transaction');
      // Same rule createTransaction enforces: a transfer without its other
      // side would be counted as a disappearance. A per-field validator
      // cannot see this on its own -- it has to look at both the incoming
      // and the existing value together.
      const kind = 'kind' in validated ? validated.kind : target.kind;
      const counterAccountId =
        'counterAccountId' in validated ? validated.counterAccountId : target.counterAccountId;
      if (kind === 'transfer' && counterAccountId === null) {
        throw new Error('counterAccountId is required when kind is transfer');
      }
      return applyPatch(target, validated);
    });
  },

  async deleteTransaction(id) {
    await updateState((state) => {
      const index = state.transactions.findIndex((transaction) => transaction.id === id);
      if (index === -1) throw new Error('no transaction with id ' + id);
      state.transactions.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async upsertTransactionByOrigin(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const origin = /** @type {{ source?: unknown, externalId?: unknown } | null} */ (
      draft.origin ?? null
    );
    if (origin === null) {
      throw new Error('upsertTransactionByOrigin needs an origin with source and externalId');
    }
    const source = requireText(origin.source, 'origin.source');
    const externalId = requireText(origin.externalId, 'origin.externalId');

    const state = await readState();
    const existing = state.transactions.find(
      (transaction) =>
        transaction.origin !== null &&
        transaction.origin.source === source &&
        transaction.origin.externalId === externalId
    );

    if (existing === undefined) return jsonAdapter.createTransaction(input);

    // THE IMPORTER OWNS THE LEFT COLUMN, YOU OWN THE RIGHT ONE.
    //
    //   source-owned   date amount currency description kind accountId origin
    //   yours          categoryId note links
    //
    // Re-running an import must never wipe a category you set by hand. That
    // is the whole reason this method exists instead of a plain overwrite.
    return updateState((inner) => {
      const target = requireById(inner.transactions, existing.id, 'transaction');
      return applyPatch(target, {
        date: draft.date ?? target.date,
        amount: draft.amount ?? target.amount,
        currency: draft.currency ?? target.currency,
        description: draft.description ?? target.description,
        kind: draft.kind ?? target.kind,
        accountId: draft.accountId ?? target.accountId,
        counterAccountId: draft.counterAccountId ?? target.counterAccountId,
        origin: { ...origin, syncedAt: now() },
      });
    });
  },

  async getSnapshots(options) {
    return mostRecent((await readState()).snapshots, options);
  },

  async recordSnapshot(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const date = requireDayKey(draft.date, 'date');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').NetWorthSnapshot} */
      const snapshot = {
        id: createId('snapshot'),
        date,
        netWorth: requireMinorUnits(draft.netWorth, 'netWorth'),
        cash: requireMinorUnits(draft.cash ?? 0, 'cash'),
        invested: requireMinorUnits(draft.invested ?? 0, 'invested'),
        otherAssets: requireMinorUnits(draft.otherAssets ?? 0, 'otherAssets'),
        liabilities: requireMinorUnits(draft.liabilities ?? 0, 'liabilities'),
        currency: typeof draft.currency === 'string' ? draft.currency : state.profile.baseCurrency,
        // The rates are stored with the snapshot so the past stays fixed.
        // Converting historic figures at today's rate rewrites your history
        // every time you look at it.
        rates: typeof draft.rates === 'object' && draft.rates !== null
          ? /** @type {Record<string, number>} */ (draft.rates)
          : {},
        notes: typeof draft.notes === 'string' ? draft.notes : '',
        createdAt: now(),
        source: /** @type {any} */ (requireOneOf(draft.source, 'source', SOURCE_KINDS, 'derived')),
      };
      // One snapshot per day: a second run the same day corrects it rather
      // than adding a duplicate point to the series.
      const index = state.snapshots.findIndex((entry) => entry.date === date);
      if (index === -1) state.snapshots.push(snapshot);
      else state.snapshots[index] = { ...snapshot, id: state.snapshots[index].id };
      return snapshot;
    });
  },

  async getSyncStates() {
    return (await readState()).syncStates;
  },

  async updateSyncState(integration, patch) {
    const name = requireText(integration, 'integration');
    const validated = validatePatch(
      /** @type {Record<string, unknown>} */ (patch),
      SYNC_STATE_PATCH_FIELDS
    );
    return updateState((state) => {
      const existing = state.syncStates.find((entry) => entry.integration === name);
      if (existing !== undefined) {
        Object.assign(existing, validated, { integration: name });
        return existing;
      }
      /** @type {import('../../domain/types.js').SyncState} */
      const created = {
        integration: name,
        lastRunAt: null,
        status: 'never',
        error: '',
        itemCount: 0,
        ...validated,
      };
      state.syncStates.push(created);
      return created;
    });
  },

  async reset() {
    return resetState();
  },

  describeStorage() {
    return workingPath();
  },
};
