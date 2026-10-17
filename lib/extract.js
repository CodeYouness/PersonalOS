/**
 * Asks what in one journal entry is worth remembering (docs/domain.md,
 * Extraction; ADR 0027). Model only: nothing reliable can pull a decision
 * out of free writing, and a proposal made up by rules would be a memory
 * that read nothing -- so with no model, extraction says so and does
 * nothing.
 *
 * The answer is a handful of proposals, never memories: nothing here
 * writes. The model's output is untrusted until checked -- a type outside
 * MEMORY_TYPES, an empty content, or a repeat of what was already drawn
 * from the entry is dropped, confidence is clamped to 0..1, and at most
 * `MAX_PROPOSALS` come back, surest first.
 *
 * `extractMemories` never throws a model failure at its caller: a dead key
 * or a timeout is the `failed` outcome, which the screen offers to retry.
 * It owns its prompt, as the classifier does, and does not build the
 * question-answering context.
 */

import Anthropic from '@anthropic-ai/sdk';

import { MEMORY_TYPES } from '../personalos.config.js';
import { env, hasModelAccess } from './config/env.js';

/** At most this many proposals per entry: what matters, not a pile. */
export const MAX_PROPOSALS = 5;

/**
 * @typedef {object} Proposal a reading of the entry nobody has confirmed
 * @property {(typeof MEMORY_TYPES)[number]} type
 * @property {string} content
 * @property {number} confidence 0..1, the model's own; it orders the
 *   proposals and is never kept (ADR 0027)
 */

/**
 * @typedef {{ outcome: 'proposals', proposals: Proposal[] } | { outcome: 'no-model' } | { outcome: 'failed' }} Extraction
 *   `proposals` may be empty: "nothing here worth remembering" is an answer
 */

/**
 * @param {string} text the entry as it stands
 * @param {string[]} remembered the contents of the memories already drawn
 *   from it, so they are not proposed again
 * @returns {Promise<Extraction>}
 */
export async function extractMemories(text, remembered) {
  if (!hasModelAccess()) return { outcome: 'no-model' };

  let input;
  try {
    input = await askModel(text, remembered);
  } catch (error) {
    console.error('[extract] the model did not answer:', error);
    return { outcome: 'failed' };
  }
  return { outcome: 'proposals', proposals: checkProposals(input, remembered) };
}

/**
 * The model's answer, checked: what survives is safe to show.
 *
 * @param {unknown} input the tool call's input
 * @param {string[]} remembered
 * @returns {Proposal[]}
 */
function checkProposals(input, remembered) {
  const raw = /** @type {{ proposals?: unknown }} */ (input ?? {}).proposals;
  if (!Array.isArray(raw)) return [];
  const known = new Set(remembered.map(normalise));

  /** @type {Proposal[]} */
  const proposals = [];
  for (const candidate of raw) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const { type, content, confidence } = /** @type {Record<string, unknown>} */ (candidate);
    if (typeof type !== 'string' || !MEMORY_TYPES.includes(/** @type {any} */ (type))) continue;
    if (typeof content !== 'string' || content.trim() === '') continue;
    if (known.has(normalise(content))) continue;
    proposals.push({
      type: /** @type {(typeof MEMORY_TYPES)[number]} */ (type),
      content: content.trim(),
      confidence: typeof confidence === 'number' && Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    });
  }
  return proposals.sort((left, right) => right.confidence - left.confidence).slice(0, MAX_PROPOSALS);
}

/** @param {string} content */
function normalise(content) {
  return content.trim().toLowerCase();
}

/**
 * @param {string} text
 * @param {string[]} remembered
 * @returns {Promise<unknown>} the tool call's input, unchecked
 */
async function askModel(text, remembered) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.create({
    model: env.models.extract,
    max_tokens: 1000,
    system: systemPrompt(remembered),
    tools: [PROPOSE_TOOL],
    tool_choice: { type: 'tool', name: 'propose_memories' },
    messages: [{ role: 'user', content: text }],
  });

  const toolUse = /** @type {any} */ (response).content.find(
    (/** @type {{ type: string }} */ block) => block.type === 'tool_use'
  );
  if (!toolUse) throw new Error('model did not return proposals');
  return toolUse.input;
}

/**
 * @param {string[]} remembered
 * @returns {string}
 */
function systemPrompt(remembered) {
  return [
    'The user wrote the journal entry below. Propose what in it is worth remembering about them, ' +
      'as short standalone statements written the way they would say them. Propose at most ' +
      MAX_PROPOSALS + ', and none when nothing is worth keeping -- an empty list is a good answer.',
    'Types: fact (true about them or their world), preference (what they like or how they work best), ' +
      'decision (something they chose), context (a situation they are in), observation (a pattern they ' +
      'noticed), event (something that happened that will matter later).',
    'Never invent anything the entry does not say, and never add a date.',
    remembered.length === 0
      ? 'Nothing has been remembered from this entry yet.'
      : 'Already remembered from this entry -- do not propose these again, or anything that says the same:\n' +
        remembered.map((content) => '- ' + content).join('\n'),
  ].join('\n\n');
}

const PROPOSE_TOOL = Object.freeze({
  name: 'propose_memories',
  description: 'Propose what in the journal entry is worth remembering.',
  input_schema: {
    type: /** @type {const} */ ('object'),
    properties: {
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: [...MEMORY_TYPES] },
            content: { type: 'string', description: 'One short standalone statement.' },
            confidence: { type: 'number', description: 'How sure you are this is worth remembering, 0 to 1.' },
          },
          required: ['type', 'content', 'confidence'],
        },
      },
    },
    required: ['proposals'],
  },
});
