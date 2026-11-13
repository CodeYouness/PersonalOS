/**
 * The action registry (ADR 0037, docs/domain.md "Action" and "Receipt").
 *
 * Every write a channel can make on your behalf -- a capture, an answer in
 * the check-in, later Telegram and the skills -- is a named action here,
 * with the params it takes as a JSON Schema (a model's tool input schema
 * too), a risk class and an undo. Running a list of them yields a receipt,
 * one line per action, and every action that ran is kept as a record in the
 * store, so the receipt survives a refresh and each line can be undone.
 *
 * The definitions wrap the store's existing writes and add no domain
 * behaviour: a refusal still lives in the store, and an action the store
 * refuses is filed as `failed`, writing nothing.
 *
 * Depends on lib/store.js, lib/domain/ and the configuration. The store never
 * imports this module.
 */

import { ACTION_ORIGINS, SOURCE_KINDS } from '../../personalos.config.js';
import { isDayKey } from '../domain/dates.js';
import { isRef } from '../domain/refs.js';
import { createActionRecord, getActionRecord, getActionRecords, updateActionRecord } from '../store.js';
import { energySet, moodSet } from './definitions/day-readings.js';
import { expenseRecord } from './definitions/expense-record.js';
import { habitSet } from './definitions/habit-set.js';
import { habitSkip } from './definitions/habit-skip.js';
import { journalAdd } from './definitions/journal-add.js';
import { taskCreate } from './definitions/task-create.js';
import { timeNone, timeSet } from './definitions/time.js';

/**
 * What an action runs under: the day it acts on, who is making it (one of
 * SOURCE_KINDS, stamped on what it creates) and where it came from.
 *
 * @typedef {object} ActionContext
 * @property {string} day day key
 * @property {string} source one of SOURCE_KINDS
 * @property {import('../domain/types.js').ActionOrigin} origin
 */

/**
 * One action. `parse` checks raw params with the domain's own rules and
 * returns the params that are run and kept -- resolved where that needs the
 * store, as an expense's account. `run` writes through the store and says
 * which record it wrote and what undo restores. `isLocked` says whether what
 * it wrote was touched since (ADR 0013's rule); without one, undo is always
 * allowed. `line` is the receipt line, in English.
 *
 * @typedef {object} ActionDefinition
 * @property {string} name
 * @property {'reversible' | 'proposal'} risk a reversible action is made at
 *   once; a proposal waits for you to accept it (not built yet)
 * @property {boolean} modelCallable whether a model may ask for it
 * @property {Record<string, unknown>} schema JSON Schema for the params
 * @property {(raw: unknown, ctx: ActionContext) => import('./params.js').ParseResult | Promise<import('./params.js').ParseResult>} parse
 * @property {(params: any, ctx: ActionContext) => Promise<{ recordRef: string | null, before: unknown }>} run
 * @property {(record: import('../domain/types.js').ActionRecord, ctx: ActionContext) => Promise<void>} undo
 * @property {(record: import('../domain/types.js').ActionRecord, ctx: ActionContext) => Promise<boolean>} [isLocked]
 * @property {(params: any, ctx: ActionContext) => string | Promise<string>} line
 */

/**
 * @typedef {{ name: string, params?: unknown }} ActionRequest
 */

/**
 * One line of a receipt. `rejected` was refused before it ran and wrote
 * nothing, so it has no record and no id; `undone` is a line undone since,
 * as a refresh shows it.
 *
 * @typedef {object} ReceiptLine
 * @property {string | null} actionId the kept record, null when none was kept
 * @property {string} name
 * @property {string} text
 * @property {'done' | 'undone' | 'failed' | 'rejected'} status
 * @property {boolean} undoable
 * @property {string | null} error
 */

/** @typedef {{ lines: ReceiptLine[] }} Receipt */

/**
 * @typedef {{ ok: true } | { ok: false, reason: 'not-found' | 'already-undone' | 'locked' | 'failed', error: string }} UndoResult
 */

/** Every action, in the order a listing shows them. */
const DEFINITIONS = Object.freeze([
  habitSet,
  habitSkip,
  moodSet,
  energySet,
  timeSet,
  timeNone,
  journalAdd,
  taskCreate,
  expenseRecord,
]);

/**
 * @param {unknown} error
 * @returns {string}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Throws on a context nothing could be filed under: a programming error in
 * the channel, never something said.
 *
 * @param {ActionContext} ctx
 * @returns {void}
 */
function requireContext(ctx) {
  if (!isDayKey(ctx?.day)) throw new Error('an action context needs a day key, received ' + JSON.stringify(ctx?.day));
  if (!SOURCE_KINDS.includes(ctx.source)) {
    throw new Error('an action context needs a source from ' + SOURCE_KINDS.join(', ') + ', received ' + JSON.stringify(ctx.source));
  }
  const origin = ctx.origin;
  if (!(/** @type {readonly string[]} */ (ACTION_ORIGINS)).includes(origin?.type) || !(origin.id === null || isRef(origin.id))) {
    throw new Error('an action context needs an origin from ' + ACTION_ORIGINS.join(', ') + ', received ' + JSON.stringify(origin));
  }
}

/**
 * The context a kept record ran under, for its undo.
 *
 * @param {import('../domain/types.js').ActionRecord} record
 * @returns {ActionContext}
 */
function contextOf(record) {
  return { day: record.day, source: record.source, origin: record.origin };
}

/**
 * @param {string} name
 * @param {string} error
 * @returns {ReceiptLine}
 */
function rejectedLine(name, error) {
  return { actionId: null, name, text: 'Not done: ' + error, status: 'rejected', undoable: false, error };
}

/**
 * A registry over a list of definitions. The module's own exports are the
 * registry of every action; a test builds one over the definitions it needs.
 *
 * @param {readonly ActionDefinition[]} definitions
 */
export function createRegistry(definitions) {
  /** @type {Map<string, ActionDefinition>} */
  const byName = new Map(definitions.map((definition) => [definition.name, definition]));

  /**
   * @param {string} name
   * @returns {ActionDefinition | null}
   */
  function getAction(name) {
    return byName.get(name) ?? null;
  }

  /**
   * @param {{ modelCallable?: boolean }} [options] only those a model may,
   *   or may not, ask for
   * @returns {ActionDefinition[]}
   */
  function listActions(options = {}) {
    return definitions.filter(
      (definition) => options.modelCallable === undefined || definition.modelCallable === options.modelCallable
    );
  }

  /**
   * The done actions made for the record an action wrote -- those whose
   * origin is that record, as the records drawn from a check-in's open
   * answer are made for its journal entry. They stand on it, so they are
   * undone with it. Made the same day, so only that day is read; newest
   * first, as the store returns them.
   *
   * @param {import('../domain/types.js').ActionRecord} record
   * @returns {Promise<import('../domain/types.js').ActionRecord[]>}
   */
  async function drawnFrom(record) {
    if (record.recordRef === null) return [];
    const day = await getActionRecords({ day: record.day });
    return day.filter((other) => other.origin.id === record.recordRef && other.status === 'done');
  }

  /**
   * Whether a kept record's line may be undone now: done, reversible, what
   * it wrote not touched since, and every action drawn from it undoable as
   * well. A check that throws counts as locked.
   *
   * @param {import('../domain/types.js').ActionRecord} record
   * @returns {Promise<boolean>}
   */
  async function canUndo(record) {
    const definition = getAction(record.name);
    if (record.status !== 'done' || definition === null || definition.risk !== 'reversible') return false;
    try {
      if (await definition.isLocked?.(record, contextOf(record))) return false;
      for (const drawn of await drawnFrom(record)) {
        if (!(await canUndo(drawn))) return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Runs one request, keeping its record. Never throws: whatever goes wrong
   * becomes the line.
   *
   * @param {unknown} request
   * @param {ActionContext} ctx
   * @returns {Promise<ReceiptLine>}
   */
  async function runOne(request, ctx) {
    const raw = /** @type {Partial<ActionRequest> | null} */ (typeof request === 'object' ? request : null);
    const name = typeof raw?.name === 'string' ? raw.name : '';
    const definition = getAction(name);
    if (definition === null) return rejectedLine(name, 'no action named ' + JSON.stringify(name));
    // The risk class is kept for the day proposals are built; until then a
    // proposal is refused rather than made without being accepted.
    if (definition.risk !== 'reversible') return rejectedLine(name, 'proposals are not built yet: ' + name + ' was not made');

    let parsed;
    try {
      parsed = await definition.parse(raw?.params, ctx);
    } catch (error) {
      parsed = /** @type {import('./params.js').ParseResult} */ ({ ok: false, error: messageOf(error) });
    }
    if (!parsed.ok) return rejectedLine(name, parsed.error);
    const params = parsed.params;

    let text;
    try {
      text = await definition.line(params, ctx);
    } catch {
      text = name;
    }

    const kept = {
      name,
      params,
      day: ctx.day,
      origin: ctx.origin,
      text,
      source: ctx.source,
    };

    let written;
    try {
      written = await definition.run(params, ctx);
    } catch (error) {
      const message = messageOf(error);
      try {
        const record = await createActionRecord({ ...kept, recordRef: null, before: null, status: 'failed', error: message });
        return { actionId: record.id, name, text, status: 'failed', undoable: false, error: message };
      } catch {
        return { actionId: null, name, text, status: 'failed', undoable: false, error: message };
      }
    }

    try {
      const record = await createActionRecord({ ...kept, ...written, status: 'done', error: null });
      return { actionId: record.id, name, text, status: 'done', undoable: true, error: null };
    } catch (error) {
      // Made, but with no record there is nothing to undo it by: the line
      // says so rather than offering an undo that cannot be kept.
      return {
        actionId: null,
        name,
        text,
        status: 'done',
        undoable: false,
        error: 'made, but its record could not be kept: ' + messageOf(error),
      };
    }
  }

  /**
   * Runs a list of requests in order and returns one line for each. A list
   * is not atomic: each write is its own queued write (ADR 0011), and one
   * that fails never stops the others. A request with an unknown name or
   * params its action refuses writes nothing and keeps no record.
   *
   * @param {unknown[]} requests
   * @param {ActionContext} ctx
   * @returns {Promise<Receipt>}
   */
  async function runActions(requests, ctx) {
    requireContext(ctx);
    /** @type {ReceiptLine[]} */
    const lines = [];
    for (const request of requests) {
      lines.push(await runOne(request, ctx));
    }
    return { lines };
  }

  /**
   * Undoes one action: refused when there is no such record, when it is
   * already undone, when it failed and wrote nothing, and when what it wrote
   * was touched since -- your own work on it outranks a correction from a
   * receipt (ADR 0013). On success the record is marked undone.
   *
   * The actions drawn from the record it wrote (`drawnFrom`) are undone
   * first, with it: a journal entry taken back takes the habit ticked and
   * the money spent that were read from it. One of them touched since locks
   * the whole undo, so nothing is left claiming an entry that is gone.
   *
   * @param {string} actionId
   * @returns {Promise<UndoResult>}
   */
  async function undoAction(actionId) {
    const record = await getActionRecord(actionId);
    if (record === null) return { ok: false, reason: 'not-found', error: 'no action with id ' + actionId };
    if (record.status === 'undone') return { ok: false, reason: 'already-undone', error: 'this action is already undone' };
    if (record.status !== 'done') return { ok: false, reason: 'failed', error: 'this action failed and wrote nothing to undo' };
    const definition = getAction(record.name);
    if (definition === null || definition.risk !== 'reversible') {
      return { ok: false, reason: 'failed', error: 'no reversible action named ' + JSON.stringify(record.name) };
    }

    // ponytail: check-then-act above the adapter (ADR 0011), as completeTask
    // -- two undos racing could both pass the lock check and both restore.
    // The second is refused when it marks the record, after its restore has
    // run; move the check into one adapter write if a second writer appears.
    const ctx = contextOf(record);
    try {
      if (await definition.isLocked?.(record, ctx)) {
        return { ok: false, reason: 'locked', error: 'what this action wrote has been changed since, so it is no longer undone from here' };
      }
      const drawn = await drawnFrom(record);
      for (const other of drawn) {
        if (!(await canUndo(other))) {
          return { ok: false, reason: 'locked', error: 'something drawn from it has been changed since, so it is no longer undone from here' };
        }
      }
      // Newest first, then the record itself. Not atomic, as a list of
      // actions is not: one that fails stops the undo with what it says.
      for (const other of drawn) {
        const undone = await undoAction(other.id);
        if (!undone.ok && undone.reason !== 'already-undone') {
          return { ok: false, reason: 'failed', error: 'could not undo what was drawn from it: ' + undone.error };
        }
      }
      await definition.undo(record, ctx);
    } catch (error) {
      return { ok: false, reason: 'failed', error: messageOf(error) };
    }

    try {
      await updateActionRecord(record.id, { status: 'undone' });
    } catch (error) {
      const message = messageOf(error);
      return { ok: false, reason: /already undone/.test(message) ? 'already-undone' : 'failed', error: message };
    }
    return { ok: true };
  }

  /**
   * The receipt as kept, rebuilt from the records -- a day's, an origin's,
   * or both -- in the order the actions were made. Rejected requests were
   * never kept, so they are not on it. Reading it writes nothing and calls
   * nothing outside the store (rule 3).
   *
   * @param {{ day?: string, origin?: { type: string, id?: string | null } }} query
   * @returns {Promise<Receipt>}
   */
  async function receiptFor(query) {
    const records = (await getActionRecords(query)).reverse();
    /** @type {ReceiptLine[]} */
    const lines = [];
    for (const record of records) {
      lines.push({
        actionId: record.id,
        name: record.name,
        text: record.text,
        status: record.status,
        undoable: await canUndo(record),
        error: record.error,
      });
    }
    return { lines };
  }

  return { getAction, listActions, runActions, undoAction, receiptFor };
}

export const { getAction, listActions, runActions, undoAction, receiptFor } = createRegistry(DEFINITIONS);
