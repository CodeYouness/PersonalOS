/**
 * Decides where a capture belongs. Model first, keyword rules underneath.
 *
 * `classify` never throws and never falls silent about which path answered:
 * `route` says `model` or `rules`, because a fallback nobody can see is
 * indistinguishable from a model that quietly stopped working. This is the
 * one gesture repeated all day, so no extended thinking, no retries -- a
 * fast answer that might be wrong beats a slow one that is merely less wrong.
 *
 * Extraction depth is not even across destinations yet. `task` and `goals`
 * get a real title -- both need only a short label to be a valid record,
 * the same way `title` and `name` play the same role on their entities. The
 * other five destinations get nothing extracted beyond the destination
 * itself: a fabricated account, amount or person name would be worse than no
 * record at all, and `docs/domain.md` is explicit that a capture may produce
 * "nothing but a memory entry". Richer extraction arrives with each
 * destination's own card.
 */

import Anthropic from '@anthropic-ai/sdk';

import { DESTINATIONS } from '../personalos.config.js';
import { env, hasModelAccess } from './config/env.js';

/**
 * @typedef {object} Classification
 * @property {(typeof DESTINATIONS)[number]} destination
 * @property {'model' | 'rules'} route
 * @property {{ title?: string }} fields
 */

/** Destinations whose minimal record needs only a short label. */
const NAMED_DESTINATIONS = /** @type {const} */ (['task', 'goals']);

/**
 * @param {string} text
 * @returns {Promise<Classification>}
 */
export async function classify(text) {
  if (hasModelAccess()) {
    try {
      const { destination, title } = await classifyWithModel(text);
      return {
        destination,
        route: 'model',
        fields: NAMED_DESTINATIONS.includes(/** @type {any} */ (destination))
          ? { title: title ?? text }
          : {},
      };
    } catch (error) {
      // Never the caller's problem: a capture that hit a dead API key must
      // file exactly as well as one that never had a model to try.
      console.error('[classify] model path failed, falling back to rules:', error);
    }
  }

  return classifyWithRules(text);
}

/** @type {any} the SDK's tool schema type is stricter than JSDoc can express here */
const FILE_CAPTURE_TOOL = {
  name: 'file_capture',
  description: 'Decide which destination this capture belongs to, and a short title if it is a task.',
  input_schema: {
    type: 'object',
    properties: {
      destination: { type: 'string', enum: DESTINATIONS },
      title: {
        type: 'string',
        description: 'A short task title. Only meaningful when destination is "task".',
      },
    },
    required: ['destination'],
  },
};

/**
 * @param {string} text
 * @returns {Promise<{ destination: (typeof DESTINATIONS)[number], title?: string }>}
 */
async function classifyWithModel(text) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 200,
    tools: [FILE_CAPTURE_TOOL],
    tool_choice: { type: 'tool', name: 'file_capture' },
    messages: [{ role: 'user', content: text }],
  });

  const toolUse = /** @type {any} */ (response).content.find(
    (/** @type {{ type: string }} */ block) => block.type === 'tool_use'
  );
  if (!toolUse) throw new Error('model did not return a classification');

  const input = /** @type {{ destination?: unknown, title?: unknown }} */ (toolUse.input);
  if (!DESTINATIONS.includes(/** @type {any} */ (input.destination))) {
    throw new Error('model chose a destination outside the closed vocabulary: ' + String(input.destination));
  }

  return {
    destination: /** @type {(typeof DESTINATIONS)[number]} */ (input.destination),
    title: typeof input.title === 'string' ? input.title : undefined,
  };
}

/**
 * A small keyword table, good enough to be right most of the time -- not
 * exhaustive, and not trying to be. Checked in order; the first match wins.
 *
 * `people` and `memory` have no rule and are only reachable through the
 * model: a keyword heuristic for "this is about a person" kept catching
 * "call Marta about the quote", which is a task, not a CRM note, and no
 * pattern distinguishes an observation worth remembering (memory) from an
 * imperative worth doing (task) either. Unmatched text becomes a task,
 * since that is what most quick captures are -- wrong sometimes, same as
 * any rule-based fallback, and the model is there for the cases this isn't.
 *
 * @param {string} text
 * @returns {Classification}
 */
export function classifyWithRules(text) {
  for (const { destination, pattern } of RULE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        destination,
        route: 'rules',
        fields: NAMED_DESTINATIONS.includes(/** @type {any} */ (destination)) ? { title: text } : {},
      };
    }
  }
  return { destination: 'task', route: 'rules', fields: { title: text } };
}

const RULE_PATTERNS = /** @type {const} */ ([
  // "invoice" and "cost" alone are too weak: "call about the invoice" is a
  // task, not a transaction. Kept to words that only make sense once money
  // has actually moved.
  { destination: 'finance', pattern: /\b(paid|spent|bought|refund(ed)?)\b|[€$]\s?\d/i },
  { destination: 'nutrition', pattern: /\b(ate|breakfast|lunch|dinner|snack)\b/i },
  { destination: 'health', pattern: /\b(weigh(ed|t)?|kg|workout|gym|slept|steps|ran \d)\b/i },
  { destination: 'goals', pattern: /\b(goal|promise to|aiming to)\b/i },
  // No `people` rule: "call Marta about the quote" is a task that involves a
  // person, not a note filed under people -- a keyword can't tell those
  // apart, and guessing wrong here is worse than leaving it to the model.
]);
