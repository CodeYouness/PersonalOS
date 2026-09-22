/**
 * Schema migrations for the JSON document.
 *
 * Rules that make these safe to run against a file holding somebody's life:
 *
 * - Idempotent. Running a migration twice must be indistinguishable from
 *   running it once. Every step keys off `schemaVersion`, never off "does
 *   this field look old".
 * - Additive where possible. A migration adds and rewrites; it does not drop
 *   information it cannot reconstruct.
 * - The caller writes a backup first. See file.js -- the migration itself is
 *   a pure function so it can be tested without touching a disk.
 */

/** The version this build of the code writes and expects. */
export const CURRENT_SCHEMA_VERSION = 3;

/**
 * @param {any} state
 * @returns {number}
 */
export function schemaVersionOf(state) {
  return typeof state?.schemaVersion === 'number' ? state.schemaVersion : 1;
}

/**
 * @param {any} state
 * @returns {boolean}
 */
export function needsMigration(state) {
  return schemaVersionOf(state) < CURRENT_SCHEMA_VERSION;
}

/**
 * A document from a schema version this code has never heard of is not an
 * old document to migrate -- migrate() only knows how to move forward, never
 * back. Refusing it beats guessing at a shape that has not been written yet.
 *
 * @param {any} state
 * @param {string} source
 * @returns {void}
 */
export function assertKnownVersion(state, source) {
  const version = schemaVersionOf(state);
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      source + ' is at schema version ' + String(version) +
        ', newer than this code understands (' + String(CURRENT_SCHEMA_VERSION) +
        '). Refusing to guess at what changed.'
    );
  }
}

/**
 * Brings a document up to CURRENT_SCHEMA_VERSION. Pure: returns a new object
 * and never mutates the input.
 *
 * @param {any} state
 * @returns {any}
 */
export function migrate(state) {
  let migrated = structuredClone(state);
  if (schemaVersionOf(migrated) < 2) migrated = toVersion2(migrated);
  if (schemaVersionOf(migrated) < 3) migrated = toVersion3(migrated);
  return migrated;
}

/**
 * v2 -> v3: introduces `appointments`, empty. Nothing else changes -- there
 * is no v2 data an appointment could ever have come from.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion3(state) {
  return {
    ...state,
    schemaVersion: 3,
    appointments: state.appointments ?? [],
  };
}

/**
 * v1 -> v2, the Foundation v2 shape.
 *
 * What changes and why:
 *
 * - Relations move out of entities and into a `links` collection. The only
 *   v1 relation was task.personId, which becomes task --involves--> person.
 * - Tasks gain `bandSetOn`, and the band `overdue` disappears. A task stored
 *   as overdue was a derived value written into canonical data; it becomes
 *   `today` with a bandSetOn in the past, which derives back to overdue.
 * - Memory entries gain a type, a confidence and a validity window.
 * - Goals stop being two fixed lists and become a collection with a horizon
 *   label -- a label, never an expiry.
 * - `activity` becomes `events`, with a day key so a timeline can be queried.
 * - Journal and the finance collections are introduced empty.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion2(state) {
  const at = new Date().toISOString();
  /** @type {any[]} */
  const links = [];
  let linkCounter = 0;

  /** @param {string} from @param {string} to @param {string} rel */
  const link = (from, to, rel) => {
    linkCounter += 1;
    links.push({
      id: 'link_m2_' + linkCounter,
      from,
      to,
      rel,
      confidence: null,
      createdAt: at,
      source: 'derived',
    });
  };

  const tasks = (state.tasks ?? []).map((/** @type {any} */ task) => {
    if (typeof task.personId === 'string' && task.personId !== '') {
      link(task.id, task.personId, 'involves');
    }
    const wasOverdue = task.band === 'overdue';
    const { personId, ...rest } = task;
    return {
      ...rest,
      band: wasOverdue ? 'today' : task.band,
      // A task that was stored as overdue keeps being overdue, because its
      // band was set on a day that has passed. Nothing is invented: the
      // creation day is the most honest date available.
      bandSetOn: wasOverdue ? dayKeyOf(task.createdAt) : dayKeyOf(at),
      updatedAt: task.updatedAt ?? at,
      source: task.source ?? 'seed',
    };
  });

  const captures = (state.captures ?? []).map((/** @type {any} */ capture) => {
    if (typeof capture.targetId === 'string' && capture.targetId !== '') {
      link(capture.id, capture.targetId, 'about');
    }
    const { targetId, source: origin, ...rest } = capture;
    return {
      ...rest,
      // v1 stored the arrival channel in a field called `source`; v2 calls
      // that `origin` and reserves `source` for who created the record.
      origin: typeof origin === 'string' ? origin : 'bar',
      updatedAt: capture.updatedAt ?? at,
      source: 'capture',
    };
  });

  const memory = (state.memory ?? []).map((/** @type {any} */ entry) => ({
    id: entry.id,
    type: 'fact',
    content: entry.text ?? entry.content ?? '',
    confidence: 1,
    tags: [],
    validFrom: null,
    validUntil: null,
    embedding: null,
    createdAt: entry.createdAt ?? at,
    updatedAt: entry.updatedAt ?? at,
    source: entry.source === 'capture' ? 'capture' : 'seed',
  }));

  /** @type {any[]} */
  const goals = [];
  let goalCounter = 0;
  for (const horizon of ['week', 'month']) {
    for (const goal of state.goals?.[horizon] ?? []) {
      goalCounter += 1;
      goals.push({
        id: goal.id ?? 'goal_m2_' + goalCounter,
        name: goal.name,
        kind: 'objective',
        horizon,
        done: goal.done === true,
        progress: goal.progress ?? null,
        targetDate: null,
        createdAt: at,
        updatedAt: at,
        source: 'seed',
      });
    }
  }

  const events = (state.activity ?? []).map((/** @type {any} */ entry) => ({
    id: entry.id,
    type: EVENT_TYPE_FROM_V1[entry.action] ?? 'task.created',
    at: entry.at ?? at,
    date: dayKeyOf(entry.at ?? at),
    subject: typeof entry.subjectId === 'string' && entry.subjectId !== ''
      ? entry.subjectId
      : null,
    payload: entry.detail ? { detail: entry.detail } : {},
    source: 'seed',
  }));

  const { activity, ...withoutActivity } = state;

  return {
    ...withoutActivity,
    schemaVersion: 2,
    profile: {
      baseCurrency: 'EUR',
      financeCategories: [],
      ...state.profile,
      habits: (state.profile?.habits ?? []).map((/** @type {any} */ habit) => ({
        archived: false,
        ...habit,
      })),
    },
    tasks,
    people: (state.people ?? []).map((/** @type {any} */ person) => ({
      ...person,
      updatedAt: person.updatedAt ?? at,
      source: person.source ?? 'seed',
    })),
    goals,
    links,
    captures,
    memory,
    journal: state.journal ?? [],
    events,
    dailyLogs: state.dailyLogs ?? {},
    accounts: state.accounts ?? [],
    observations: state.observations ?? [],
    transactions: state.transactions ?? [],
    snapshots: state.snapshots ?? [],
    syncStates: state.syncStates ?? [],
  };
}

/**
 * v1 action strings to the v2 closed vocabulary.
 *
 * @type {Record<string, string>}
 */
const EVENT_TYPE_FROM_V1 = Object.freeze({
  'capture.filed': 'capture.filed',
  'task.completed': 'task.completed',
  'task.created': 'task.created',
});

/**
 * The day part of an ISO instant. Deliberately not the timezone-aware
 * function from lib/domain/dates.js: a migration must produce the same result
 * whatever machine it runs on, and these are historic records whose exact day
 * boundary nobody can recover anyway.
 *
 * @param {string} instant
 * @returns {string}
 */
function dayKeyOf(instant) {
  return String(instant).slice(0, 10);
}
