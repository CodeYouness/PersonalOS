/**
 * The local-path storage adapter: one JSON document on your own disk.
 *
 * Every function is named after the domain, never after the file. The fact
 * that a task is a row in an array inside a document is knowledge that stops
 * at this module's edge.
 */

import {
  ACCOUNT_KINDS,
  ACCOUNT_VALUATIONS,
  DESTINATIONS,
  EVENT_TYPES,
  FINANCE_CURRENCIES,
  GOAL_HORIZONS,
  GOAL_KINDS,
  HABIT_TYPES,
  LINK_RELS,
  MEASUREMENT_METRICS,
  MEMORY_TYPES,
  OBSERVATION_KINDS,
  SOURCE_KINDS,
  TEMPERATURES,
  TRADE_DIRECTIONS,
  URGENCY_BANDS,
} from '../../../personalos.config.js';
import { dayKeyRange, isDayKey, isTimeOfDay, toDayKey, today } from '../../domain/dates.js';
import { firstDayUnitsGoNegative } from '../../domain/derive/finance.js';
import { isActiveOn, justCompleted } from '../../domain/derive/habits.js';
import { caloriesFromMacros } from '../../domain/derive/nutrition.js';
import { createId } from '../../domain/ids.js';
import { requireRef, requireRefOfType } from '../../domain/refs.js';
import { readSeed, readState, resetState, updateState, updateStateWithBackup, workingPath } from './file.js';

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
 * @param {string} [fallback] what a missing value means; without one, a
 *   missing value is refused like any other outside the vocabulary
 * @returns {string}
 */
function requireOneOf(value, field, allowed, fallback) {
  if ((value === undefined || value === null) && fallback !== undefined) return fallback;
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
  if (!isTimeOfDay(value)) {
    throw new Error(field + ' must be an HH:MM time, received ' + JSON.stringify(value));
  }
  return /** @type {string} */ (value);
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
 * A transaction's amount: signed from its account's side, negative when money
 * left it (ADR 0023). Zero is refused -- a movement of nothing is a typo.
 *
 * @param {unknown} value
 * @returns {number}
 */
function requireSignedAmount(value) {
  const amount = requireMinorUnits(value, 'amount');
  if (amount === 0) throw new Error('amount must not be zero: negative when money left the account, positive when it came in');
  return amount;
}

/**
 * Money is in EUR until exchange rates exist (#111); any other currency is
 * refused. Money that names none is in the first of FINANCE_CURRENCIES.
 *
 * @param {unknown} value
 * @returns {string}
 */
function requireCurrency(value) {
  return requireOneOf(value, 'currency', FINANCE_CURRENCIES, FINANCE_CURRENCIES[0]);
}

/**
 * A count of 10^-8 units in a trade: a positive integer. Never a float, for
 * the same reason money is not -- a fraction of a coin is exact here.
 *
 * @param {unknown} value
 * @returns {number}
 */
function requireUnits(value) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('units must be a positive integer count of 10^-8 units, received ' + JSON.stringify(value));
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {number}
 */
function requireNonNegativeMinorUnits(value, field) {
  const amount = requireMinorUnits(value, field);
  if (amount < 0) throw new Error(field + ' must not be negative, received ' + JSON.stringify(value));
  return amount;
}

/**
 * Only an investment chooses how it is valued; cash, an asset and a debt are
 * always valued by balance (#116).
 *
 * @param {string} kind
 * @param {string} valuation
 * @returns {void}
 */
function requireValuationForKind(kind, valuation) {
  if (kind !== 'investment' && valuation !== 'balance') {
    throw new Error('only an investment can be valued by units; a ' + kind + ' account is valued by balance');
  }
}

/**
 * An account has one answer to what it is worth: its balances, or its
 * trades and prices. Recording the other kind is refused.
 *
 * @param {import('../../domain/types.js').FinanceAccount} account
 * @param {'balance' | 'units'} valuation what the record being written needs
 * @returns {void}
 */
function requireValuation(account, valuation) {
  if (account.valuation === valuation) return;
  throw new Error(
    account.valuation === 'units'
      ? 'this account is valued by units: record a trade or a price, not a balance'
      : 'this account is valued by balance: a trade or a price needs an account valued by units'
  );
}

/**
 * Refuses a holding's trades -- as they would stand after a write -- that
 * leave it holding fewer than zero units on any day.
 *
 * @param {import('../../domain/types.js').Trade[]} trades one account's
 * @returns {void}
 */
function requireUnitsNeverNegative(trades) {
  const day = firstDayUnitsGoNegative(trades);
  if (day !== null) throw new Error('this would take the units held below zero on ' + day);
}

/**
 * Whether an account has anything recorded against it. Its valuation and
 * its kind are fixed from then on, so its history never changes meaning
 * underneath it.
 *
 * @param {import('./file.js').PersonalOsState} state
 * @param {string} accountId
 * @returns {boolean}
 */
function hasFinanceData(state, accountId) {
  return [state.observations, state.trades, state.prices].some((rows) => rows.some((row) => row.accountId === accountId));
}

/**
 * The sign of an observation is meaningful (docs/domain.md). A cash,
 * investment or asset balance is signed -- an overdraft is negative. A
 * liability is the positive amount owed, so a negative one is a sign typo
 * that would turn a debt into an asset, and is refused.
 *
 * @param {import('../../domain/types.js').FinanceAccount} account
 * @param {number} amount minor units
 * @returns {void}
 */
function requireSignForAccount(account, amount) {
  if (account.kind === 'liability' && amount < 0) {
    throw new Error('a debt is recorded as the positive amount owed, not a negative one');
  }
}

/**
 * Refuses money moving on an account after the day it was archived. The day
 * itself is allowed: closing an account moves its last money out that day.
 *
 * @param {import('../../domain/types.js').FinanceAccount} account
 * @param {string} date day key
 * @returns {void}
 */
function requireOpenOn(account, date) {
  if (account.archivedOn !== null && date > account.archivedOn) {
    throw new Error(account.name + ' was archived on ' + account.archivedOn + '; nothing moves on it on ' + date);
  }
}

/**
 * A transaction as it would stand after a write, checked against the rest of
 * the data (ADR 0023). Every write path -- create, correct, re-import --
 * meets the same rules, because each reads more than one field:
 *
 * - its account, and its counter account when it has one, exist and were
 *   open on its date;
 * - a transfer is between two accounts, never one with itself;
 * - a transfer carries no category: money moved between your own accounts is
 *   neither income nor spending.
 *
 * It checks the whole record, not only the fields a write changes -- unlike
 * updateObservation's sign check -- because each rule reads two fields, and
 * either can be the one that changed.
 *
 * @param {import('./file.js').PersonalOsState} state
 * @param {Pick<import('../../domain/types.js').Transaction, 'date' | 'accountId' | 'counterAccountId' | 'categoryId'>} transaction
 * @returns {void}
 */
function requireValidTransaction(state, transaction) {
  requireOpenOn(requireById(state.accounts, transaction.accountId, 'account'), transaction.date);
  if (transaction.counterAccountId !== null) {
    if (transaction.counterAccountId === transaction.accountId) {
      throw new Error('a transfer from an account to itself moves nothing');
    }
    requireOpenOn(requireById(state.accounts, transaction.counterAccountId, 'counter account'), transaction.date);
    if (transaction.categoryId !== null) {
      throw new Error('a transfer carries no category: money moved between your own accounts is neither income nor spending');
    }
  }
}

/**
 * The source's zone of an import (ADR 0023): only the fields it owns, and
 * only those the input carries, whatever else it sends.
 *
 * @param {Record<string, unknown>} draft
 * @returns {Record<string, unknown>}
 */
function pickSourceZone(draft) {
  /** @type {Record<string, unknown>} */
  const zone = {};
  for (const key of Object.keys(TRANSACTION_SOURCE_FIELDS)) {
    if (draft[key] !== undefined) zone[key] = draft[key];
  }
  return validatePatch(zone, TRANSACTION_SOURCE_FIELDS);
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
 * An ISO instant -- the shape `now()` writes -- or null for unknown.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {string | null}
 */
function requireNullableInstant(value, field) {
  if (value === null) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || !value.includes('T')) {
    throw new Error(field + ' must be an ISO instant or null, received ' + JSON.stringify(value));
  }
  return value;
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
 * A meal's number (ADR 0019): a non-negative integer, or null for unknown.
 * Never a fraction and never a negative -- a gram of fat is not a place for
 * a model's rounding noise to be stored.
 *
 * @param {unknown} value
 * @param {string} field
 * @returns {number | null}
 */
function requireNullableCount(value, field) {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(field + ' must be a non-negative integer or null, received ' + JSON.stringify(value));
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
 * A task's tags as stored: trimmed, lowercased, each once -- "Billing" and
 * "billing " are one tag. A blank one is refused rather than dropped, so a
 * caller never believes it saved a tag that silently vanished.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function requireTags(value) {
  const tags = requireStringArray(value, 'tags').map((tag) => tag.trim().toLowerCase());
  if (tags.includes('')) throw new Error('tags must not be blank');
  return [...new Set(tags)];
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
  const { current, target } = requireRecord(value, field);
  // Whole numbers, a target of at least one; current may pass the target --
  // doing more than you promised is not refused (docs/domain.md).
  if (
    typeof current !== 'number' || typeof target !== 'number' ||
    !Number.isInteger(current) || !Number.isInteger(target) || current < 0 || target < 1
  ) {
    throw new Error(
      field + ' must be null or { current, target }, whole numbers with current >= 0 and target >= 1, received ' +
        JSON.stringify(value)
    );
  }
  return { current, target };
}

/**
 * At least one, ordered, non-overlapping, half-open day-key range; only the
 * last may be open (`to: null`). Mirrors the invariant isActiveOn (in
 * lib/domain/derive/habits.js) assumes already holds -- see ADR 0015. Empty
 * is rejected: a habit with no period could never be active on any day.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function arePeriodsWellFormed(value) {
  if (!Array.isArray(value) || value.length === 0) return false;
  for (let index = 0; index < value.length; index += 1) {
    const period = value[index];
    if (typeof period !== 'object' || period === null || Array.isArray(period)) return false;
    if (!isDayKey(period.from)) return false;
    if (period.to !== null && !isDayKey(period.to)) return false;
    if (period.to !== null && period.to < period.from) return false;
    if (index < value.length - 1) {
      if (period.to === null) return false;
      const next = value[index + 1];
      if (typeof next !== 'object' || next === null || !isDayKey(next.from) || next.from < period.to) return false;
    }
  }
  return true;
}

/**
 * Archiving closes the open period at today; restoring opens a new one from
 * today. A closed period is never mutated and never dropped -- that is the
 * bug ADR 0015 exists to prevent, since it would make every day the habit
 * *was* active invisible.
 *
 * Both directions are idempotent: asking for the state a habit is already in
 * leaves its periods exactly as they were, so a double-click cannot stack up
 * empty periods.
 *
 * @param {import('../../domain/types.js').HabitPeriod[]} periods
 * @param {boolean} archived
 * @returns {import('../../domain/types.js').HabitPeriod[]}
 */
function setArchived(periods, archived) {
  const last = periods[periods.length - 1];
  const isOpen = last !== undefined && last.to === null;
  if (archived === !isOpen) return periods;

  return archived
    ? [...periods.slice(0, -1), { ...last, to: today() }]
    : [...periods, { from: today(), to: null }];
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {import('../../domain/types.js').Habit}
 */
function requireHabit(value, field) {
  const habit = requireRecord(value, field);
  if (habit.type !== 'check' && habit.type !== 'counter') {
    throw new Error(
      field + '.type must be one of ' + HABIT_TYPES.join(', ') + ', received ' + JSON.stringify(habit.type)
    );
  }
  const label = requireText(habit.label, field + '.label');
  if (label.length > 60) throw new Error(field + '.label must be 60 characters or fewer');

  const target = habit.target;
  if (habit.type === 'check' && target !== null) {
    throw new Error(field + '.target must be null for a check habit, received ' + JSON.stringify(target));
  }
  if (habit.type === 'counter' && (typeof target !== 'number' || !Number.isInteger(target) || target < 1)) {
    throw new Error(
      field + '.target must be an integer of at least 1 for a counter habit, received ' + JSON.stringify(target)
    );
  }

  if (!arePeriodsWellFormed(habit.periods)) {
    throw new Error(
      field + '.periods must be ordered, non-overlapping day-key ranges with only the last one open'
    );
  }

  return /** @type {any} */ ({
    id: requireText(habit.id, field + '.id'),
    label,
    type: habit.type,
    target,
    periods: habit.periods,
  });
}

/**
 * @param {unknown} value
 * @param {string} field
 * @returns {import('../../domain/types.js').Habit[]}
 */
function requireHabits(value, field) {
  return requireArray(value, field).map((habit, index) => requireHabit(habit, field + '[' + index + ']'));
}

/**
 * A logged value's type follows from the habit it belongs to: a check takes
 * a boolean, a counter a non-negative integer (it may run past its target,
 * but never below zero -- see docs/spec.md's Habits section).
 *
 * @param {import('../../domain/types.js').Habit} habit
 * @param {unknown} value
 * @returns {boolean | number}
 */
function requireHabitValue(habit, value) {
  if (habit.type === 'check') return requireBoolean(value, 'value');
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error('value must be a non-negative integer for a counter habit, received ' + JSON.stringify(value));
  }
  return value;
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
  // No fallback on a patch: a null band is a mistake to refuse, not a
  // request to reset the task to `today`.
  band: (/** @type {unknown} */ v) => requireOneOf(v, 'band', URGENCY_BANDS),
  bandSetOn: (/** @type {unknown} */ v) => requireDayKey(v, 'bandSetOn'),
  temperature: (/** @type {unknown} */ v) => requireOneOf(v, 'temperature', TEMPERATURES),
  tags: requireTags,
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
  // No fallback on a patch: a null is a mistake to refuse, not a request to
  // reset the goal to a default.
  kind: (/** @type {unknown} */ v) => requireOneOf(v, 'kind', GOAL_KINDS),
  horizon: (/** @type {unknown} */ v) => requireOneOf(v, 'horizon', GOAL_HORIZONS),
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
  currency: (/** @type {unknown} */ v) => requireOneOf(v, 'currency', FINANCE_CURRENCIES),
  origin: (/** @type {unknown} */ v) => requireNullableObject(v, 'origin'),
  // Not a field: a request to set or clear `archivedOn`, which updateAccount
  // turns into the day itself, as a habit's `archived` is (ADR 0015).
  archived: (/** @type {unknown} */ v) => requireBoolean(v, 'archived'),
  valuation: (/** @type {unknown} */ v) => requireOneOf(v, 'valuation', ACCOUNT_VALUATIONS),
};

// A hand correction of a trade. Its account is not here: a trade moved to
// another holding is a different trade.
const TRADE_PATCH_FIELDS = {
  date: (/** @type {unknown} */ v) => requireDayKey(v, 'date'),
  direction: (/** @type {unknown} */ v) => requireOneOf(v, 'direction', TRADE_DIRECTIONS),
  units: requireUnits,
  price: (/** @type {unknown} */ v) => requireNonNegativeMinorUnits(v, 'price'),
  fee: (/** @type {unknown} */ v) => requireNonNegativeMinorUnits(v, 'fee'),
};

// A hand correction of a price, for the same reason without its account.
const PRICE_PATCH_FIELDS = {
  date: (/** @type {unknown} */ v) => requireDayKey(v, 'date'),
  price: (/** @type {unknown} */ v) => requireNonNegativeMinorUnits(v, 'price'),
};

// A hand correction of a balance. The account and the currency are not
// here: a balance moved to another account is a different balance.
const OBSERVATION_PATCH_FIELDS = {
  amount: (/** @type {unknown} */ v) => requireMinorUnits(v, 'amount'),
  date: (/** @type {unknown} */ v) => requireDayKey(v, 'date'),
};

// The source's zone and the user's (ADR 0023), each validator the one
// createTransaction uses. A hand correction may touch either; a re-import
// only the first.
const TRANSACTION_SOURCE_FIELDS = {
  date: (/** @type {unknown} */ v) => requireDayKey(v, 'date'),
  amount: requireSignedAmount,
  currency: requireCurrency,
  description: (/** @type {unknown} */ v) => requireString(v, 'description'),
  accountId: (/** @type {unknown} */ v) => requireRefOfType(v, 'accountId', ['account']),
};

const TRANSACTION_PATCH_FIELDS = {
  ...TRANSACTION_SOURCE_FIELDS,
  counterAccountId: (/** @type {unknown} */ v) =>
    v === null ? null : requireRefOfType(v, 'counterAccountId', ['account']),
  categoryId: (/** @type {unknown} */ v) => (v === null ? null : requireString(v, 'categoryId')),
  notCounted: (/** @type {unknown} */ v) => requireBoolean(v, 'notCounted'),
  tags: requireTags,
  note: (/** @type {unknown} */ v) => requireString(v, 'note'),
  origin: (/** @type {unknown} */ v) => requireNullableObject(v, 'origin'),
};

const PROFILE_PATCH_FIELDS = {
  name: (/** @type {unknown} */ v) => requireString(v, 'name'),
  role: (/** @type {unknown} */ v) => requireString(v, 'role'),
  city: (/** @type {unknown} */ v) => requireString(v, 'city'),
  focus: (/** @type {unknown} */ v) => requireString(v, 'focus'),
  habits: (/** @type {unknown} */ v) => requireHabits(v, 'habits'),
  calorieTarget: (/** @type {unknown} */ v) => requireNumber(v, 'calorieTarget'),
  baseCurrency: (/** @type {unknown} */ v) => requireString(v, 'baseCurrency'),
  financeCategories: (/** @type {unknown} */ v) => requireArray(v, 'financeCategories'),
};

/**
 * What a hand edit of one habit may touch. `type` is deliberately absent:
 * a check's history is booleans and a counter's is numbers, so flipping the
 * type would reinterpret every day already logged. `archived` is here but is
 * not a field -- it is a request to close or open a period (ADR 0015), which
 * updateHabit turns into the period edit itself.
 */
const HABIT_PATCH_FIELDS = {
  label: (/** @type {unknown} */ v) => requireText(v, 'label'),
  target: (/** @type {unknown} */ v) => requireNumber(v, 'target'),
  archived: (/** @type {unknown} */ v) => requireBoolean(v, 'archived'),
};

const DAILY_LOG_PATCH_FIELDS = {
  habits: (/** @type {unknown} */ v) => requireRecord(v, 'habits'),
  meals: (/** @type {unknown} */ v) => requireArray(v, 'meals'),
  measurements: (/** @type {unknown} */ v) => requireArray(v, 'measurements'),
  notes: (/** @type {unknown} */ v) => requireStringArray(v, 'notes'),
};

// A hand correction on the Nutrition card. `estimated` is not here: any
// correction clears it (updateMeal), and nothing may set it back by hand.
const MEAL_PATCH_FIELDS = {
  name: (/** @type {unknown} */ v) => requireText(v, 'name'),
  time: (/** @type {unknown} */ v) => requireNullableTimeString(v, 'time'),
  calories: (/** @type {unknown} */ v) => requireNullableCount(v, 'calories'),
  protein: (/** @type {unknown} */ v) => requireNullableCount(v, 'protein'),
  carbs: (/** @type {unknown} */ v) => requireNullableCount(v, 'carbs'),
  fat: (/** @type {unknown} */ v) => requireNullableCount(v, 'fat'),
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

// title/date/startTime/endTime/calendarLabel/origin are the sync's to
// overwrite (ADR 0014) -- only upsertAppointmentByOrigin touches them. A
// hand patch through this map may only touch what the user owns, plus the
// `confirmed` flag a sync clears when the source stops mentioning it.
const APPOINTMENT_PATCH_FIELDS = {
  note: (/** @type {unknown} */ v) => requireString(v, 'note'),
  confirmed: (/** @type {unknown} */ v) => requireBoolean(v, 'confirmed'),
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

  async createHabit(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    // Built whole and then run through the one habit validator, rather than
    // field by field: the rules that tie type to target live there, and a
    // second copy of them here is a second copy to get wrong.
    const habit = requireHabit(
      {
        id: createId('habit'),
        label: draft.label,
        type: draft.type,
        // Omitted means "not given" and becomes null; a target that is
        // present and wrong for the type is rejected rather than quietly
        // dropped -- a check habit arriving with a target means the caller
        // and the store disagree about what is being created.
        target: draft.target === undefined ? null : draft.target,
        // A habit starts counting today, never retroactively -- yesterday
        // was not a day you failed at something you had not started.
        periods: [{ from: today(), to: null }],
      },
      'habit'
    );

    return updateState((state) => {
      state.profile.habits = [...state.profile.habits, habit];
      return habit;
    });
  },

  async updateHabit(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), HABIT_PATCH_FIELDS);
    const { archived, ...fields } = validated;

    return updateState((state) => {
      const existing = requireById(state.profile.habits, id, 'habit');
      const periods =
        archived === undefined ? existing.periods : setArchived(existing.periods, Boolean(archived));

      const updated = requireHabit({ ...existing, ...fields, periods }, 'habit');
      state.profile.habits = state.profile.habits.map((habit) => (habit.id === id ? updated : habit));
      return updated;
    });
  },

  async reorderHabits(ids) {
    const order = requireStringArray(ids, 'ids');

    return updateState((state) => {
      const current = state.profile.habits;
      // An exact permutation, not a subset and not a superset: anything else
      // would silently drop a habit or invent one, and the array *is* the
      // order, so there is no position field left behind to repair it from.
      const unique = new Set(order);
      if (
        unique.size !== order.length ||
        order.length !== current.length ||
        !current.every((habit) => unique.has(habit.id))
      ) {
        throw new Error('ids must be an exact permutation of the ' + current.length + ' existing habit ids');
      }

      state.profile.habits = order.map((habitId) => requireById(current, habitId, 'habit'));
      return state.profile.habits;
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
        tags: draft.tags === undefined ? [] : requireTags(draft.tags),
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
        note: typeof draft.note === 'string' ? draft.note : '',
        confirmed: true,
        origin: /** @type {any} */ (draft.origin ?? null),
      };
      state.appointments.push(appointment);
      return appointment;
    });
  },

  async updateAppointment(id, patch) {
    const validated = validatePatch(
      /** @type {Record<string, unknown>} */ (patch),
      APPOINTMENT_PATCH_FIELDS
    );
    return updateState((state) => {
      const target = requireById(state.appointments, id, 'appointment');
      return applyPatch(target, validated);
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

  async upsertAppointmentByOrigin(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const origin = /** @type {{ source?: unknown, externalId?: unknown } | null} */ (
      draft.origin ?? null
    );
    if (origin === null) {
      throw new Error('upsertAppointmentByOrigin needs an origin with source and externalId');
    }
    const source = requireText(origin.source, 'origin.source');
    const externalId = requireText(origin.externalId, 'origin.externalId');
    const title = requireText(draft.title, 'title');
    const date = requireDayKey(draft.date, 'date');
    const startTime = requireTimeString(draft.startTime, 'startTime');
    const endTime = requireNullableTimeString(draft.endTime, 'endTime');

    const state = await readState();
    const existing = state.appointments.find(
      (appointment) =>
        appointment.origin !== null &&
        appointment.origin.source === source &&
        appointment.origin.externalId === externalId
    );

    if (existing === undefined) {
      return jsonAdapter.createAppointment({ ...draft, source: draft.source ?? 'integration' });
    }

    // Same two-zone split as upsertTransactionByOrigin (ADR 0009), extended
    // to appointments by ADR 0014: the sync owns the left column and never
    // touches note/links. Re-confirming the appointment here undoes any
    // earlier `confirmed: false` flag from a run where the source dropped it.
    return updateState((inner) => {
      const target = requireById(inner.appointments, existing.id, 'appointment');
      return applyPatch(target, {
        title,
        date,
        startTime,
        endTime,
        calendarLabel: typeof draft.calendarLabel === 'string' ? draft.calendarLabel : target.calendarLabel,
        confirmed: true,
        origin: { ...origin, syncedAt: now() },
      });
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
    const horizon = requireOneOf(draft.horizon, 'horizon', GOAL_HORIZONS, 'week');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Goal} */
      const goal = {
        ...envelope('goal', draft.source),
        name,
        kind: /** @type {any} */ (kind),
        horizon: /** @type {any} */ (horizon),
        horizonSetOn: toDayKey(new Date()),
        done: draft.done === true,
        progress: draft.progress === undefined ? null : requireProgress(draft.progress, 'progress'),
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
    return updateState((state) => {
      const goal = requireById(state.goals, id, 'goal');
      // What you closed stays as you closed it: a done goal is reopened
      // before anything else about it changes.
      if (goal.done && Object.keys(validated).some((key) => key !== 'done')) {
        throw new Error('reopen this goal before editing it');
      }
      // A different horizon is the promise made again, so its age starts
      // over (ADR 0021). The same horizon chosen again is not a change.
      if (validated.horizon !== undefined && validated.horizon !== goal.horizon) {
        validated.horizonSetOn = toDayKey(new Date());
      }
      return applyPatch(goal, validated);
    });
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

  async createMeal(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const dayKey = requireDayKey(draft.date, 'date');
    if (dayKey > today()) throw new Error('date must not be in the future, received ' + JSON.stringify(draft.date));
    const at = now();
    /** @type {import('../../domain/types.js').Meal} */
    const meal = {
      id: createId('meal'),
      time: requireNullableTimeString(draft.time, 'time'),
      name: requireText(draft.name, 'name'),
      calories: requireNullableCount(draft.calories ?? null, 'calories'),
      protein: requireNullableCount(draft.protein ?? null, 'protein'),
      carbs: requireNullableCount(draft.carbs ?? null, 'carbs'),
      fat: requireNullableCount(draft.fat ?? null, 'fat'),
      estimated: draft.estimated === undefined ? false : requireBoolean(draft.estimated, 'estimated'),
      createdAt: at,
      updatedAt: at,
    };

    return updateState((state) => {
      const log = state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
      log.meals = [...log.meals, meal];
      state.dailyLogs[dayKey] = log;
      return meal;
    });
  },

  async getMeal(id) {
    const state = await readState();
    for (const log of Object.values(state.dailyLogs)) {
      const meal = log.meals.find((entry) => entry.id === id);
      if (meal !== undefined) return meal;
    }
    return null;
  },

  async updateMeal(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), MEAL_PATCH_FIELDS);

    return updateState((state) => {
      const meal = Object.values(state.dailyLogs).flatMap((log) => log.meals).find((entry) => entry.id === id);
      if (meal === undefined) throw new Error('no meal with id ' + id);
      const next = { ...meal, ...validated };
      // Calories are their own number (ADR 0019). A macro change recomputes
      // them with the formula -- when all three macros are known, since the
      // formula has no answer otherwise -- unless calories came in the same
      // edit; a calories change alone leaves the macros as they were.
      if (['protein', 'carbs', 'fat'].some((key) => key in validated) && !('calories' in validated)) {
        const { protein, carbs, fat } = next;
        if (protein !== null && carbs !== null && fat !== null) {
          next.calories = caloriesFromMacros({ protein, carbs, fat });
        }
      }
      // Any hand correction makes the numbers yours, not the model's.
      return applyPatch(meal, { ...next, estimated: false });
    });
  },

  async deleteMeal(id) {
    await updateState((state) => {
      const log = Object.values(state.dailyLogs).find((entry) => entry.meals.some((meal) => meal.id === id));
      if (log === undefined) throw new Error('no meal with id ' + id);
      log.meals = log.meals.filter((meal) => meal.id !== id);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async createMeasurement(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const dayKey = requireDayKey(draft.date, 'date');
    if (dayKey > today()) throw new Error('date must not be in the future, received ' + JSON.stringify(draft.date));
    const metric = requireOneOf(draft.metric, 'metric', Object.keys(MEASUREMENT_METRICS));
    const value = requireNumber(draft.value, 'value');
    if (!Number.isFinite(value) || value <= 0) throw new Error('value must be a positive number, received ' + JSON.stringify(value));
    const at = now();
    /** @type {import('../../domain/types.js').Measurement} */
    const measurement = {
      id: createId('measurement'),
      metric,
      value,
      unit: MEASUREMENT_METRICS[metric],
      recordedAt: requireNullableInstant(draft.recordedAt ?? null, 'recordedAt'),
      createdAt: at,
      updatedAt: at,
    };

    return updateState((state) => {
      const log = state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
      log.measurements = [...log.measurements, measurement];
      state.dailyLogs[dayKey] = log;
      return measurement;
    });
  },

  async getMeasurement(id) {
    const state = await readState();
    for (const log of Object.values(state.dailyLogs)) {
      const measurement = log.measurements.find((entry) => entry.id === id);
      if (measurement !== undefined) return measurement;
    }
    return null;
  },

  async deleteMeasurement(id) {
    await updateState((state) => {
      const log = Object.values(state.dailyLogs).find((entry) => entry.measurements.some((m) => m.id === id));
      if (log === undefined) throw new Error('no measurement with id ' + id);
      log.measurements = log.measurements.filter((m) => m.id !== id);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async logHabitValue({ date, habitId, value }) {
    const dayKey = requireDayKey(date, 'date');
    if (dayKey > today()) throw new Error('date must not be in the future, received ' + JSON.stringify(date));

    return updateState((state) => {
      const habit = requireById(state.profile.habits, habitId, 'habit');
      if (!isActiveOn(habit, dayKey)) {
        throw new Error('habit ' + habitId + ' was not active on ' + dayKey);
      }
      const validValue = requireHabitValue(habit, value);

      const log = state.dailyLogs[dayKey] ?? emptyDailyLog(dayKey);
      const previousValue = /** @type {boolean | number | undefined} */ (log.habits[habitId]);
      log.habits = { ...log.habits, [habitId]: validValue };
      state.dailyLogs[dayKey] = log;

      // Written inside the same transaction that reads the previous value,
      // so a concurrent write on another habit can never make this fire (or
      // not fire) based on a stale read.
      if (justCompleted(habit, previousValue, validValue)) {
        state.events.push({
          id: createId('event'),
          type: 'habit.ticked',
          at: now(),
          date: dayKey,
          subject: habitId,
          payload: {},
          source: 'user',
        });
      }

      return log;
    });
  },

  async getAccounts() {
    return (await readState()).accounts;
  },

  async getAccount(id) {
    return (await readState()).accounts.find((account) => account.id === id) ?? null;
  },

  async createAccount(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const name = requireText(draft.name, 'name');
    const kind = requireOneOf(draft.kind, 'kind', ACCOUNT_KINDS, 'cash');
    const valuation = requireOneOf(draft.valuation, 'valuation', ACCOUNT_VALUATIONS, 'balance');
    requireValuationForKind(kind, valuation);
    const currency = requireCurrency(draft.currency);

    return updateState((state) => {
      /** @type {import('../../domain/types.js').FinanceAccount} */
      const account = {
        ...envelope('account', draft.source),
        name,
        kind: /** @type {any} */ (kind),
        currency,
        origin: /** @type {any} */ (draft.origin ?? null),
        archivedOn: null,
        valuation: /** @type {any} */ (valuation),
      };
      state.accounts.push(account);
      return account;
    });
  },

  async updateAccount(id, patch) {
    const { archived, ...fields } = validatePatch(/** @type {Record<string, unknown>} */ (patch), ACCOUNT_PATCH_FIELDS);
    return updateState((state) => {
      const account = requireById(state.accounts, id, 'account');
      const kind = /** @type {string} */ (fields.kind ?? account.kind);
      const valuation = /** @type {string} */ (fields.valuation ?? account.valuation);
      requireValuationForKind(kind, valuation);
      if (valuation !== account.valuation && hasFinanceData(state, id)) {
        throw new Error('the valuation of an account is fixed once it has a balance, a trade or a price');
      }
      // The kind decides what the sign of a balance means -- an overdraft
      // would become a negative debt -- so it is fixed the same way.
      if (kind !== account.kind && hasFinanceData(state, id)) {
        throw new Error('the kind of an account is fixed once it has a balance, a trade or a price');
      }
      /** @type {Record<string, unknown>} */
      const changes = { ...fields };
      // Archiving records the day; archiving again keeps the first one, so
      // the days the account counted stay the days it was open.
      if (archived === true && account.archivedOn === null) {
        changes.archivedOn = today();
        // Nothing moves on an account after the day it was archived (ADR
        // 0023), so a transaction already dated later is refused here too.
        const later = state.transactions.find(
          (row) => (row.accountId === id || row.counterAccountId === id) && row.date > /** @type {string} */ (changes.archivedOn)
        );
        if (later !== undefined) {
          throw new Error('this account has money moving on ' + later.date + ', after today; move or delete it before archiving');
        }
      }
      if (archived === false) changes.archivedOn = null;
      return applyPatch(account, changes);
    });
  },

  async deleteAccount(id) {
    await updateState((state) => {
      requireById(state.accounts, id, 'account');
      // A transaction is money that moved, and the original is never lost
      // (rule 7): its account stays, archived, rather than leaving it
      // pointing at nothing.
      if (state.transactions.some((row) => row.accountId === id || row.counterAccountId === id)) {
        throw new Error('this account has transactions; archive it instead');
      }
      const removed = new Set([
        id,
        ...[...state.observations, ...state.trades, ...state.prices].filter((row) => row.accountId === id).map((row) => row.id),
      ]);
      state.accounts = state.accounts.filter((row) => row.id !== id);
      state.observations = state.observations.filter((row) => !removed.has(row.id));
      state.trades = state.trades.filter((row) => !removed.has(row.id));
      state.prices = state.prices.filter((row) => !removed.has(row.id));
      state.links = state.links.filter((link) => !removed.has(link.from) && !removed.has(link.to));
      return undefined;
    });
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
    const currency = requireCurrency(draft.currency);

    return updateState((state) => {
      const account = requireById(state.accounts, accountId, 'account');
      requireValuation(account, 'balance');
      requireSignForAccount(account, amount);
      /** @type {import('../../domain/types.js').FinanceObservation} */
      const observation = {
        ...envelope('observation', draft.source ?? 'user'),
        accountId,
        kind: /** @type {any} */ (kind),
        amount,
        currency,
        date,
        observedAt: typeof draft.observedAt === 'string' ? draft.observedAt : now(),
        origin: /** @type {any} */ (draft.origin ?? null),
      };
      state.observations.push(observation);
      return observation;
    });
  },

  async updateObservation(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), OBSERVATION_PATCH_FIELDS);
    return updateState((state) => {
      const observation = requireById(state.observations, id, 'observation');
      if (typeof validated.amount === 'number') {
        requireSignForAccount(requireById(state.accounts, observation.accountId, 'account'), validated.amount);
      }
      return applyPatch(observation, validated);
    });
  },

  async deleteObservation(id) {
    await updateState((state) => {
      const index = state.observations.findIndex((observation) => observation.id === id);
      if (index === -1) throw new Error('no observation with id ' + id);
      state.observations.splice(index, 1);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getTrades(options) {
    const state = await readState();
    return state.trades.filter((trade) => options?.accountId === undefined || trade.accountId === options.accountId);
  },

  async createTrade(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const accountId = requireRefOfType(draft.accountId, 'accountId', ['account']);
    const date = requireDayKey(draft.date, 'date');
    const direction = requireOneOf(draft.direction, 'direction', TRADE_DIRECTIONS);
    const units = requireUnits(draft.units);
    const price = requireNonNegativeMinorUnits(draft.price, 'price');
    const fee = requireNonNegativeMinorUnits(draft.fee ?? 0, 'fee');
    const currency = requireCurrency(draft.currency);

    return updateState((state) => {
      requireValuation(requireById(state.accounts, accountId, 'account'), 'units');
      /** @type {import('../../domain/types.js').Trade} */
      const trade = {
        ...envelope('trade', draft.source ?? 'user'),
        accountId,
        date,
        direction: /** @type {any} */ (direction),
        units,
        price,
        fee,
        currency,
      };
      requireUnitsNeverNegative([...state.trades.filter((row) => row.accountId === accountId), trade]);
      state.trades.push(trade);
      return trade;
    });
  },

  async updateTrade(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), TRADE_PATCH_FIELDS);
    return updateState((state) => {
      const trade = requireById(state.trades, id, 'trade');
      // Checked as the holding's trades would stand after the change: a
      // smaller or later buy can strand a sell that depended on it.
      requireUnitsNeverNegative(
        state.trades.filter((row) => row.accountId === trade.accountId).map((row) => (row.id === id ? { ...row, ...validated } : row))
      );
      return applyPatch(trade, validated);
    });
  },

  async deleteTrade(id) {
    await updateState((state) => {
      const trade = requireById(state.trades, id, 'trade');
      requireUnitsNeverNegative(state.trades.filter((row) => row.accountId === trade.accountId && row.id !== id));
      state.trades = state.trades.filter((row) => row.id !== id);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
    });
  },

  async getPrices(options) {
    const state = await readState();
    return state.prices.filter((price) => options?.accountId === undefined || price.accountId === options.accountId);
  },

  async recordPrice(input) {
    const draft = /** @type {Record<string, unknown>} */ (input);
    const accountId = requireRefOfType(draft.accountId, 'accountId', ['account']);
    const date = requireDayKey(draft.date, 'date');
    const amount = requireNonNegativeMinorUnits(draft.price, 'price');
    const currency = requireCurrency(draft.currency);

    return updateState((state) => {
      requireValuation(requireById(state.accounts, accountId, 'account'), 'units');
      // One price per holding per day: a second one for the same day
      // corrects it, rather than leaving two answers for one date.
      const existing = state.prices.find((row) => row.accountId === accountId && row.date === date);
      if (existing !== undefined) return applyPatch(existing, { price: amount });
      /** @type {import('../../domain/types.js').Price} */
      const price = {
        ...envelope('price', draft.source ?? 'user'),
        accountId,
        date,
        price: amount,
        currency,
      };
      state.prices.push(price);
      return price;
    });
  },

  async updatePrice(id, patch) {
    const validated = validatePatch(/** @type {Record<string, unknown>} */ (patch), PRICE_PATCH_FIELDS);
    return updateState((state) => {
      const price = requireById(state.prices, id, 'price');
      const date = validated.date ?? price.date;
      if (state.prices.some((row) => row.id !== id && row.accountId === price.accountId && row.date === date)) {
        throw new Error('this holding already has a price on ' + date + '; correct that one instead');
      }
      return applyPatch(price, validated);
    });
  },

  async deletePrice(id) {
    await updateState((state) => {
      requireById(state.prices, id, 'price');
      state.prices = state.prices.filter((row) => row.id !== id);
      state.links = state.links.filter((link) => link.from !== id && link.to !== id);
      return undefined;
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
    const date = requireDayKey(draft.date, 'date');
    const amount = requireSignedAmount(draft.amount);
    const currency = requireCurrency(draft.currency);
    const accountId = requireRefOfType(draft.accountId, 'accountId', ['account']);
    const counterAccountId = TRANSACTION_PATCH_FIELDS.counterAccountId(draft.counterAccountId ?? null);
    const categoryId = TRANSACTION_PATCH_FIELDS.categoryId(draft.categoryId ?? null);
    const notCounted = requireBoolean(draft.notCounted ?? false, 'notCounted');
    const tags = requireTags(draft.tags ?? []);
    const description = requireString(draft.description ?? '', 'description');
    const note = requireString(draft.note ?? '', 'note');
    const origin = requireNullableObject(draft.origin ?? null, 'origin');

    return updateState((state) => {
      /** @type {import('../../domain/types.js').Transaction} */
      const transaction = {
        ...envelope('transaction', draft.source ?? 'user'),
        date,
        amount,
        currency,
        description,
        accountId,
        counterAccountId,
        categoryId,
        notCounted,
        tags,
        note,
        origin: /** @type {any} */ (origin),
      };
      requireValidTransaction(state, transaction);
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
      /** @type {Record<string, unknown>} */
      const changes = { ...validated };
      // Choosing a counter account makes a movement a transfer, and a
      // transfer has no category: it is cleared rather than refused, so
      // "this was a transfer" is one correction. A category sent with it is
      // a contradiction, and requireValidTransaction refuses it.
      if (typeof changes.counterAccountId === 'string' && !('categoryId' in changes)) changes.categoryId = null;
      requireValidTransaction(state, /** @type {import('../../domain/types.js').Transaction} */ ({ ...target, ...changes }));
      return applyPatch(target, changes);
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

    // A line seen for the first time is created whole: what it carries for
    // your zone -- a transfer's counter account, a category -- is where it
    // starts, the way a one-off import files it. From then on it is yours.
    if (existing === undefined) return jsonAdapter.createTransaction(input);

    // THE IMPORTER OWNS THE LEFT COLUMN, YOU OWN THE RIGHT ONE (ADR 0023).
    //
    //   source-owned   date amount currency description accountId origin
    //   yours          categoryId counterAccountId notCounted tags note links
    //
    // Re-running an import must never wipe a category you set by hand, or
    // undo a transfer you recognised. That is the whole reason this method
    // exists instead of a plain overwrite: only the left column is read
    // from the input, whatever else it carries.
    const sourceZone = pickSourceZone(draft);
    return updateState((inner) => {
      const target = requireById(inner.transactions, existing.id, 'transaction');
      requireValidTransaction(inner, /** @type {import('../../domain/types.js').Transaction} */ ({ ...target, ...sourceZone }));
      return applyPatch(target, { ...sourceZone, origin: { ...origin, syncedAt: now() } });
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

  async removeDemoFinance() {
    const seed = await readSeed();
    // What the seed put there: a row it ships, by id, or one marked `seed`.
    // Not by `source` alone -- the seed's transactions say `integration`
    // and its snapshot `derived`, and removing their accounts without them
    // would leave money pointing at nothing.
    /** @param {{ id: string, source: string }[]} shipped */
    const isDemo = (shipped) => {
      const ids = new Set(shipped.map((row) => row.id));
      return (/** @type {{ id: string, source: string }} */ row) => row.source === 'seed' || ids.has(row.id);
    };

    const { backupPath, result } = await updateStateWithBackup('demo-finance', (state) => {
      const demoAccount = isDemo(seed.accounts);
      const removedAccounts = new Set(state.accounts.filter(demoAccount).map((account) => account.id));
      // Anything hanging off a removed account goes with it, whoever wrote it.
      /** @param {{ accountId: string, counterAccountId?: string | null }} row */
      const onRemovedAccount = (row) =>
        removedAccounts.has(row.accountId) || (typeof row.counterAccountId === 'string' && removedAccounts.has(row.counterAccountId));

      const demoObservation = isDemo(seed.observations);
      const demoTrade = isDemo(seed.trades);
      const demoPrice = isDemo(seed.prices);
      const demoTransaction = isDemo(seed.transactions);
      const demoSnapshot = isDemo(seed.snapshots);
      const observations = state.observations.filter((row) => demoObservation(row) || onRemovedAccount(row));
      const trades = state.trades.filter((row) => demoTrade(row) || onRemovedAccount(row));
      const prices = state.prices.filter((row) => demoPrice(row) || onRemovedAccount(row));
      const transactions = state.transactions.filter((row) => demoTransaction(row) || onRemovedAccount(row));
      const snapshots = state.snapshots.filter(demoSnapshot);

      const removedIds = new Set([
        ...removedAccounts,
        ...[...observations, ...trades, ...prices, ...transactions, ...snapshots].map((row) => row.id),
      ]);
      const links = state.links.filter((link) => removedIds.has(link.from) || removedIds.has(link.to));

      state.accounts = state.accounts.filter((row) => !removedIds.has(row.id));
      state.observations = state.observations.filter((row) => !removedIds.has(row.id));
      state.trades = state.trades.filter((row) => !removedIds.has(row.id));
      state.prices = state.prices.filter((row) => !removedIds.has(row.id));
      state.transactions = state.transactions.filter((row) => !removedIds.has(row.id));
      state.snapshots = state.snapshots.filter((row) => !removedIds.has(row.id));
      state.links = state.links.filter((link) => !removedIds.has(link.from) && !removedIds.has(link.to));

      return {
        accounts: removedAccounts.size,
        observations: observations.length,
        trades: trades.length,
        prices: prices.length,
        transactions: transactions.length,
        snapshots: snapshots.length,
        links: links.length,
      };
    });
    return { backupPath, removed: result };
  },

  async reset() {
    return resetState();
  },

  describeStorage() {
    return workingPath();
  },
};
