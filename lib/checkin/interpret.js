/**
 * The check-in's open answer, read for records by the small model -- the
 * second tier of ADR 0037's router. "Ho fatto palestra e speso 18 euro di
 * pranzo" is a journal entry first; this reads it for the habit ticked and
 * the money spent, as a list of action requests.
 *
 * It only reads. The journal entry is saved before it runs, and what it
 * returns is filed by the caller through the action registry, whose own
 * `parse` checks every request -- an unknown habit, an amount as a float, a
 * category that is not yours is refused there, never trusted here. What is
 * checked here is the list's shape: a request naming an action the model was
 * not offered is dropped, `journal.add` first among them, since the entry is
 * already kept and the model must never file it twice.
 *
 * The model is offered every action the registry marks model-callable but
 * `journal.add`, each with its own params schema -- one schema, the
 * registry's, never a copy. It is told the day, the habits the day asks
 * about, your expense categories and the names of the accounts money can be
 * spent from, and nothing more.
 *
 * The one module of the check-in that reaches a model
 * (tests/lint/checkin-no-model.test.js): computing the questions and filing
 * a closed answer never import it.
 */

import { limits, TIME_AREAS } from '../../personalos.config.js';
import { listActions } from '../actions/registry.js';
import { callTool } from '../ai/provider.js';
import { env, hasModelAccess } from '../config/env.js';
import { isMovableAccount } from '../domain/derive/finance.js';
import { getAccounts, getClassifyContext } from '../store.js';

/** The tool the model must answer with. */
export const FILE_ACTIONS_TOOL = 'file_actions';

/**
 * The most requests one sentence files. A sentence names a few things; a
 * longer list is the model reading more than was said.
 */
export const MAX_REQUESTS = 8;

/** Never offered, and dropped if asked for: the open answer is already this entry. */
const NEVER_OFFERED = Object.freeze(['journal.add']);

/**
 * A habit the day asks about, as the model is told it.
 *
 * @typedef {object} HabitContext
 * @property {string} id
 * @property {string} name
 * @property {'check' | 'counter'} type
 * @property {number | null} target a counter's target that day, null for a check
 */

/**
 * Everything the model is told besides the sentence.
 *
 * @typedef {object} OpenAnswerContext
 * @property {string} day the day the answer is about, a day key
 * @property {HabitContext[]} habits
 * @property {{ id: string, name: string }[]} categories
 * @property {string[]} accounts the names of the accounts money is spent from
 */

/**
 * @typedef {{ outcome: 'actions', requests: import('../actions/registry.js').ActionRequest[] } | { outcome: 'no-model' } | { outcome: 'failed' }} OpenAnswerReading
 *   `actions` may be empty: a sentence with nothing to file is an answer
 */

/**
 * The actions the model may ask for, in the registry's order.
 *
 * @returns {import('../actions/registry.js').ActionDefinition[]}
 */
export function offeredActions() {
  return listActions({ modelCallable: true }).filter((definition) => !NEVER_OFFERED.includes(definition.name));
}

/**
 * The context the model is told, read from the store: your open expense
 * categories and the accounts money can move on, with the habits the
 * caller already has from the day's questions. Writes nothing.
 *
 * @param {string} day
 * @param {HabitContext[]} habits
 * @returns {Promise<OpenAnswerContext>}
 */
export async function openAnswerContext(day, habits) {
  const [{ categories = [] }, accounts] = await Promise.all([getClassifyContext(), getAccounts()]);
  return { day, habits, categories, accounts: accounts.filter(isMovableAccount).map((account) => account.name) };
}

/**
 * Reads an open answer on the configured model and never throws: with no
 * key it calls nothing and reads nothing (`no-model`); a model that errors,
 * times out, is cut off or answers junk is `failed`, and the caller files
 * nothing more than the journal entry it already saved. What the check-in
 * hands `answerCheckin` (./day.js) to read an open answer with.
 *
 * @param {string} text the answer, word for word
 * @param {{ day: string, habits: HabitContext[] }} about the day, and the
 *   habits it asks about
 * @returns {Promise<OpenAnswerReading>}
 */
export async function readOpenAnswer(text, { day, habits }) {
  if (!hasModelAccess()) return { outcome: 'no-model' };
  try {
    const { requests } = await interpretOpenAnswerWithModel(text, {
      model: env.models.checkin,
      context: await openAnswerContext(day, habits),
      timeoutMs: limits.checkinTimeoutMs,
    });
    return { outcome: 'actions', requests };
  } catch (error) {
    console.error('[checkin] the open answer was not read, only its journal entry is filed:', error);
    return { outcome: 'failed' };
  }
}

/**
 * Reads an open answer on a given model and returns the requests it asks
 * for, shape-checked, and how many it dropped. Throws when there is nothing
 * to trust -- no tool call, a reply cut off at `max_tokens`, an input with no
 * list -- so a model that does not work cannot pass for one that found
 * nothing (`npm run eval:classify -- --suite checkin` calls it directly).
 *
 * @param {string} text
 * @param {{ model: string, context: OpenAnswerContext, timeoutMs?: number }} options
 * @returns {Promise<{ requests: import('../actions/registry.js').ActionRequest[], dropped: number, usage: import('../ai/provider.js').ToolCallResult['usage'] }>}
 */
export async function interpretOpenAnswerWithModel(text, { model, context, timeoutMs }) {
  const offered = offeredActions();
  const reply = await callTool({
    model,
    maxTokens: limits.checkinMaxTokens,
    system: systemPrompt(context),
    tool: fileActionsTool(offered),
    messages: [{ role: 'user', content: text }],
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });

  // A list cut off at the ceiling is short of its last request, or holds
  // it half-written: filing the rest would pass a part for the whole.
  if (reply.stopReason === 'max_tokens') throw new Error('the open answer was cut off at max_tokens');

  const raw = /** @type {{ actions?: unknown } | null} */ (typeof reply.input === 'object' ? reply.input : null)?.actions;
  if (!Array.isArray(raw)) throw new Error('the model answered no list of actions: ' + JSON.stringify(reply.input));
  const { requests, dropped } = checkRequests(raw, offered.map((definition) => definition.name));
  return { requests, dropped, usage: reply.usage };
}

/**
 * The model's list, shape-checked: each item an object naming an offered
 * action, with params as an object (none for an action that takes none),
 * at most `MAX_REQUESTS`. The params' values are the registry's to check.
 *
 * @param {unknown[]} raw
 * @param {readonly string[]} names the actions offered
 * @returns {{ requests: import('../actions/registry.js').ActionRequest[], dropped: number }}
 */
export function checkRequests(raw, names) {
  /** @type {import('../actions/registry.js').ActionRequest[]} */
  const requests = [];
  let dropped = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      dropped += 1;
      continue;
    }
    const { action, params } = /** @type {{ action?: unknown, params?: unknown }} */ (item);
    const paramsOk = params === undefined || (typeof params === 'object' && params !== null && !Array.isArray(params));
    if (typeof action !== 'string' || !names.includes(action) || !paramsOk || requests.length >= MAX_REQUESTS) {
      dropped += 1;
      continue;
    }
    requests.push({ name: action, params: params ?? {} });
  }
  return { requests, dropped };
}

/**
 * The one tool: a list of `{ action, params }`, each action one of the
 * offered ones with its params schema as the registry declares it.
 *
 * @param {readonly import('../actions/registry.js').ActionDefinition[]} offered
 * @returns {import('../ai/provider.js').ToolSpec}
 */
export function fileActionsTool(offered) {
  return {
    name: FILE_ACTIONS_TOOL,
    description:
      'File what the sentence says happened today as a list of actions, one per record. ' +
      'An empty list when it says nothing that fits an action.',
    inputSchema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          maxItems: MAX_REQUESTS,
          items: {
            anyOf: offered.map((definition) => ({
              type: 'object',
              properties: {
                action: { type: 'string', const: definition.name },
                params: definition.schema,
              },
              required: ['action', 'params'],
              additionalProperties: false,
            })),
          },
        },
      },
      required: ['actions'],
    },
  };
}

/**
 * @param {OpenAnswerContext} context
 * @returns {string}
 */
export function systemPrompt(context) {
  const habits =
    context.habits.length === 0
      ? 'No habit is scheduled today: file none.'
      : 'The habits scheduled today -- use only these ids:\n' +
        context.habits
          .map((habit) =>
            habit.type === 'counter'
              ? '- ' + habit.id + ': ' + habit.name + ' (a count; today\'s target ' + (habit.target ?? 'none') + ')'
              : '- ' + habit.id + ': ' + habit.name + ' (done or not: value true)'
          )
          .join('\n');
  const categories =
    context.categories.length === 0
      ? 'There are no expense categories: leave categoryId out.'
      : 'Expense categories -- use only these ids, or leave categoryId out:\n' +
        context.categories.map((category) => '- ' + category.id + ': ' + category.name).join('\n');
  const accounts =
    context.accounts.length === 0
      ? 'Name no account.'
      : 'Accounts money is spent from -- name one only when the sentence does: ' + context.accounts.join(', ') + '.';
  const areas = Object.entries(TIME_AREAS)
    .map(([key, label]) => key + ' (' + label + ')')
    .join(', ');

  return [
    'Today is ' + context.day + '. The user answered "Anything worth noting today?" in their daily check-in, ' +
      'in Italian or English. Their words are already saved as a journal entry: never file that again.',
    'File only what the sentence plainly says happened today, one action per record, with nothing invented. ' +
      'A sentence with nothing to file gets an empty list, and that is a good answer. When unsure, leave it out.',
    habits,
    'A habit the sentence names that is not in the list is not filed.',
    'Money spent is expense.record, amount in cents as a whole number: "18 euro" is 1800, "12,50" and "12.50" are 1250. ' +
      'note is what it was for, in a few words.',
    categories,
    accounts,
    'Time spent is time.set, in half hours, against one of these areas: ' + areas + '. ' +
      'Time on something outside them is not filed.',
    'Something still to do is task.create, its title in the words said. Mood and energy are not filed here.',
  ].join('\n\n');
}
