/**
 * Asks the model for a category for the merchant keys no rule covers (ADR
 * 0043), through the one seam every model call goes through
 * (lib/ai/provider.js), on its own call type's model
 * (`ANTHROPIC_MODEL_CATEGORISE`, ADR 0030).
 *
 * What is sent, per key: the key, one description of its movements with
 * every digit masked, the direction, and the bank's own category when it
 * gives one -- never an amount, a date, an account, a note or an id of
 * yours. With them, your categories: id, path and kind, archived ones left
 * out. Keys go `limits.categoriseBatchKeys` to a call.
 *
 * The answer is untrusted: per key, a category id from the list sent, or
 * none. An answer naming a key that was not sent, a second answer for one
 * key, or an id that was not sent is dropped and counted. A call that
 * throws, or is cut off at its token ceiling, leaves its keys without a
 * proposal and is counted; the script never fails because of the model.
 * Nothing here writes: what the model says is a proposal in the review file.
 */

import { limits } from '../../personalos.config.js';
import { callTool } from '../../lib/ai/provider.js';
import { env, hasModelAccess } from '../../lib/config/env.js';
import { categoryPath, isArchived } from './plan.js';

/**
 * @typedef {object} ModelItem what is sent about one group
 * @property {string} key
 * @property {'in' | 'out'} direction
 * @property {string} sample one description, digits masked
 * @property {string} bankCategory '' when the bank gives none
 *
 * @typedef {{ outcome: 'no-model' } | {
 *   outcome: 'asked',
 *   keys: number,
 *   answers: Map<number, string>,
 *   calls: number,
 *   failedCalls: number,
 *   failedItems: number,
 *   declined: number,
 *   dropped: number,
 *   errors: string[],
 * }} ModelResult answers by the item's index in the list given
 */

/**
 * @param {ModelItem[]} items
 * @param {import('../../lib/domain/types.js').FinanceCategory[]} categories
 * @param {{ batchSize?: number }} [options]
 * @returns {Promise<ModelResult>}
 */
export async function proposeByModel(items, categories, { batchSize = limits.categoriseBatchKeys } = {}) {
  if (!hasModelAccess()) return { outcome: 'no-model' };
  const offered = offeredCategories(categories);
  const ids = new Set(offered.map((category) => category.id));
  /** @type {Extract<ModelResult, { outcome: 'asked' }>} */
  const result = { outcome: 'asked', keys: items.length, answers: new Map(), calls: 0, failedCalls: 0, failedItems: 0, declined: 0, dropped: 0, errors: [] };
  if (items.length === 0 || offered.length === 0) return result;

  for (let start = 0; start < items.length; start += batchSize) {
    const batch = items.slice(start, start + batchSize).map((item, at) => ({ ref: 'k' + (start + at + 1), index: start + at, item }));
    result.calls += 1;
    let input;
    try {
      input = await ask(batch, offered);
    } catch (error) {
      result.failedCalls += 1;
      result.failedItems += batch.length;
      result.errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    const byRef = new Map(batch.map((entry) => [entry.ref, entry.index]));
    const answered = new Set();
    const raw = /** @type {{ answers?: unknown }} */ (input ?? {}).answers;
    for (const candidate of Array.isArray(raw) ? raw : []) {
      const { ref, categoryId } = /** @type {Record<string, unknown>} */ (candidate !== null && typeof candidate === 'object' ? candidate : {});
      const index = typeof ref === 'string' ? byRef.get(ref) : undefined;
      if (index === undefined || answered.has(ref)) {
        result.dropped += 1;
        continue;
      }
      answered.add(ref);
      if (categoryId === null) result.declined += 1;
      else if (typeof categoryId === 'string' && ids.has(categoryId)) result.answers.set(index, categoryId);
      else result.dropped += 1;
    }
  }
  return result;
}

/**
 * The categories offered: every one not archived, with its path and the kind
 * it counts as, a subcategory taking its parent's.
 *
 * @param {import('../../lib/domain/types.js').FinanceCategory[]} categories
 * @returns {{ id: string, path: string, kind: 'income' | 'spending' }[]}
 */
function offeredCategories(categories) {
  return categories
    .filter((category) => !isArchived(category, categories))
    .map((category) => {
      const top = category.parentId === null ? category : categories.find((row) => row.id === category.parentId);
      return { id: category.id, path: categoryPath(category.id, categories), kind: /** @type {'income' | 'spending'} */ (top?.kind === 'income' ? 'income' : 'spending') };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * @param {{ ref: string, item: ModelItem }[]} batch
 * @param {{ id: string, path: string, kind: string }[]} offered
 * @returns {Promise<unknown>} the tool call's input, unchecked
 */
async function ask(batch, offered) {
  const movements = batch.map(({ ref, item }) => ({
    ref,
    key: item.key,
    sample: item.sample,
    direction: item.direction,
    ...(item.bankCategory === '' ? {} : { bankCategory: item.bankCategory }),
  }));
  const reply = await callTool({
    model: env.models.categorise,
    maxTokens: limits.categoriseMaxTokens,
    system: SYSTEM_PROMPT,
    tool: PROPOSE_TOOL,
    messages: [{ role: 'user', content: JSON.stringify({ categories: offered, movements }) }],
  });
  // A reply cut off at the ceiling is missing its last answers: a failure,
  // never a shorter answer.
  if (reply.stopReason === 'max_tokens') throw new Error('the reply was cut off at max_tokens');
  return reply.input;
}

const SYSTEM_PROMPT = [
  'You file bank movements into the user\'s own categories. The message is JSON: "categories", each with an id, a path and ' +
    'whether it counts as income or spending; and "movements", each a group of the user\'s bank movements with a reference, ' +
    'a merchant key, one sample description (digits masked as #), the direction of the money (out of the account, or in) and, ' +
    "sometimes, the bank's own category.",
  'For every movement answer with its reference and the id of the one category it belongs in -- or null when no category ' +
    'clearly fits, when you are unsure, or when it looks like money moved between the user\'s own accounts. A wrong category ' +
    'is worse than none: the user reviews every answer, and null leaves the choice to them.',
  'Use only ids from the list. Money out belongs in a spending category and money in in an income one. Money in from a ' +
    'business is usually pay or a fee earned, even when the business is a shop or a restaurant: file it as income, or ' +
    'answer null. Only a clear refund of a purchase (the description or the bank says refund, reversal or return) belongs ' +
    'in the spending category of what was bought.',
].join('\n\n');

const PROPOSE_TOOL = Object.freeze({
  name: 'propose_categories',
  description: 'Propose a category for each group of bank movements, or none.',
  inputSchema: {
    type: /** @type {const} */ ('object'),
    properties: {
      answers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            ref: { type: 'string', description: 'The reference of the movement group.' },
            categoryId: { type: ['string', 'null'], description: 'A category id from the list, or null.' },
          },
          required: ['ref', 'categoryId'],
        },
      },
    },
    required: ['answers'],
  },
});
