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

import { toDayKey } from '../../domain/dates.js';

/** The version this build of the code writes and expects. */
export const CURRENT_SCHEMA_VERSION = 12;

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
  if (schemaVersionOf(migrated) < 4) migrated = toVersion4(migrated);
  if (schemaVersionOf(migrated) < 5) migrated = toVersion5(migrated);
  if (schemaVersionOf(migrated) < 6) migrated = toVersion6(migrated);
  if (schemaVersionOf(migrated) < 7) migrated = toVersion7(migrated);
  if (schemaVersionOf(migrated) < 8) migrated = toVersion8(migrated);
  if (schemaVersionOf(migrated) < 9) migrated = toVersion9(migrated);
  if (schemaVersionOf(migrated) < 10) migrated = toVersion10(migrated);
  if (schemaVersionOf(migrated) < 11) migrated = toVersion11(migrated);
  if (schemaVersionOf(migrated) < 12) migrated = toVersion12(migrated);
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
 * v3 -> v4: gives every appointment the two-zone split ADR 0014 needs --
 * `note` (yours) and `confirmed` (false only when a sync stopped seeing an
 * appointment it once wrote but kept for a note or link you added). No v3
 * appointment could have either field, so every one defaults the same way.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion4(state) {
  return {
    ...state,
    schemaVersion: 4,
    appointments: (state.appointments ?? []).map((/** @type {any} */ appointment) => ({
      note: '',
      confirmed: true,
      ...appointment,
    })),
  };
}

/**
 * v4 -> v5: replaces a habit's `archived` boolean with `periods` (ADR 0015)
 * -- ordered, half-open day-key ranges over which it counts. Archiving used
 * to just flip a flag and stop counting the habit from today; a period is
 * what keeps that from rewriting the days it really was done.
 *
 * Each habit gets one period, opening on the day its earliest tick appears
 * in `dailyLogs`, or today if it was never recorded; closed at today if the
 * habit was archived, open otherwise.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion5(state) {
  const today = dayKeyOf(new Date().toISOString());
  const firstRecordedDay = firstRecordedDayByHabit(state.dailyLogs ?? {});

  return {
    ...state,
    schemaVersion: 5,
    profile: {
      ...state.profile,
      habits: (state.profile?.habits ?? []).map((/** @type {any} */ habit) => {
        const { archived, ...rest } = habit;
        return {
          ...rest,
          periods: [{ from: firstRecordedDay(habit.id) ?? today, to: archived ? today : null }],
        };
      }),
    },
  };
}

/**
 * v5 -> v6: a meal becomes a record a capture can produce (ADR 0019), so it
 * gets the `createdAt`/`updatedAt` pair the capture log's Undo and Refile
 * compare. Nobody knows when an existing meal was written, so both are the
 * moment the migration runs -- equal, which reads as "never touched". Every
 * other field is left exactly as it was.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion6(state) {
  const at = new Date().toISOString();
  /** @type {Record<string, any>} */
  const dailyLogs = {};
  for (const [day, log] of Object.entries(state.dailyLogs ?? {})) {
    dailyLogs[day] = {
      ...log,
      meals: (log.meals ?? []).map((/** @type {any} */ meal) => ({ createdAt: at, updatedAt: at, ...meal })),
    };
  }
  return { ...state, schemaVersion: 6, dailyLogs };
}

/**
 * v6 -> v7: a measurement becomes a record a capture can produce (ADR 0020),
 * so it gets the same `createdAt`/`updatedAt` pair v6 gave meals, for the
 * same reason and with the same value: the moment the migration runs.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion7(state) {
  const at = new Date().toISOString();
  /** @type {Record<string, any>} */
  const dailyLogs = {};
  for (const [day, log] of Object.entries(state.dailyLogs ?? {})) {
    dailyLogs[day] = {
      ...log,
      measurements: (log.measurements ?? []).map((/** @type {any} */ m) => ({ createdAt: at, updatedAt: at, ...m })),
    };
  }
  return { ...state, schemaVersion: 7, dailyLogs };
}

/**
 * v7 -> v8: a goal gets `horizonSetOn` (ADR 0021), the day its horizon was
 * chosen, so its age can be counted from a re-promise. No v7 goal ever had
 * its horizon changed through a screen, so the day it was made is the day
 * its horizon was set -- resolved in the user's timezone, unlike v2's
 * `dayKeyOf`: this is the same day key the live code would have written.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion8(state) {
  return {
    ...state,
    schemaVersion: 8,
    goals: (state.goals ?? []).map((/** @type {any} */ goal) => ({
      horizonSetOn: toDayKey(new Date(goal.createdAt)),
      ...goal,
    })),
  };
}

/**
 * v8 -> v9: the sign of an observation becomes meaningful (#120). Net worth
 * used to take the absolute value of every observation, so a liability was
 * written either way. From now on a liability is the positive amount owed
 * and a negative one is refused, so every negative liability observation is
 * turned positive -- the same debt, written the one way. Cash, investment and
 * asset observations keep their sign: a negative one is an overdraft.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion9(state) {
  const liabilities = new Set(
    (state.accounts ?? [])
      .filter((/** @type {any} */ account) => account.kind === 'liability')
      .map((/** @type {any} */ account) => account.id)
  );
  return {
    ...state,
    schemaVersion: 9,
    observations: (state.observations ?? []).map((/** @type {any} */ observation) =>
      liabilities.has(observation.accountId) && observation.amount < 0
        ? { ...observation, amount: -observation.amount }
        : observation
    ),
  };
}

/**
 * v9 -> v10: an account's `archived` flag becomes `archivedOn`, the day it
 * was archived (#115). Net worth's history counts an archived account on
 * every day before that one -- closing a loan must not raise last year's
 * net worth -- and a flag cannot say which days those are. Nobody knows when
 * an existing archived account was closed, so it is today, the day this
 * runs, resolved in the user's timezone like v8; an open one is null.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion10(state) {
  const todayKey = toDayKey(new Date());
  return {
    ...state,
    schemaVersion: 10,
    accounts: (state.accounts ?? []).map((/** @type {any} */ account) => {
      const { archived, ...rest } = account;
      return { ...rest, archivedOn: archived === true ? todayKey : null };
    }),
  };
}

/**
 * v10 -> v11: an account is valued one of two ways (#116) -- by balance, or
 * by units through its trades and prices -- and `trades` and `prices` are
 * introduced, empty. Every existing account was valued by its balances, so
 * that is what it is.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion11(state) {
  return {
    ...state,
    schemaVersion: 11,
    accounts: (state.accounts ?? []).map((/** @type {any} */ account) => ({ valuation: 'balance', ...account })),
    trades: state.trades ?? [],
    prices: state.prices ?? [],
  };
}

/**
 * v11 -> v12: a transaction's amount becomes signed from its account's side
 * and `kind` goes (ADR 0023). `income` is `+amount`, `expense` is `-amount`,
 * and a `transfer` is `-amount` -- money that left its account -- with its
 * counter account kept, which is now the one thing that makes it a transfer.
 * A transfer's category is cleared: transfers were excluded from every total,
 * so it never counted under one. A counter account on anything else is
 * cleared, or it would turn income or spending into a transfer; and a
 * transfer with no counter account -- the old re-import could write one --
 * becomes not counted, so it stays out of the totals it was out of. Every
 * other transaction gets `notCounted: false`, and every one no `tags`.
 *
 * @param {any} state
 * @returns {any}
 */
function toVersion12(state) {
  return {
    ...state,
    schemaVersion: 12,
    transactions: (state.transactions ?? []).map((/** @type {any} */ transaction) => {
      const { kind, ...rest } = transaction;
      const transfer = kind === 'transfer';
      return {
        ...rest,
        amount: kind === 'income' || transaction.amount === 0 ? transaction.amount : -transaction.amount,
        counterAccountId: transfer ? transaction.counterAccountId : null,
        categoryId: transfer ? null : transaction.categoryId,
        notCounted: transfer && transaction.counterAccountId === null,
        tags: [],
      };
    }),
  };
}

/**
 * @param {Record<string, any>} dailyLogs
 * @returns {(habitId: string) => string | null}
 */
function firstRecordedDayByHabit(dailyLogs) {
  const days = Object.keys(dailyLogs).sort();
  return (habitId) => days.find((day) => Object.hasOwn(dailyLogs[day]?.habits ?? {}, habitId)) ?? null;
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
