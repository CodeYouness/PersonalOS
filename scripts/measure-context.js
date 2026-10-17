#!/usr/bin/env node
/**
 * `npm run measure:context [-- --model <id>]` (#204): how many tokens a
 * question at `limits.contextMaxChars` really is, so the limit stays under
 * Haiku 5.5's 100K-token price step (ADR 0030). Run it again whenever the
 * answer model or a kind of record changes, and carry what it prints into
 * tests/lib/context-limit.test.js and the ADR.
 *
 * The records are made up in memory (measure-context/mixes.js), built into
 * items by the context builder and sent in the request `lib/answer.js` sends.
 * It calls only `countTokens`, which is free, but it needs your key, so it is
 * run on purpose and never by `npm run verify` or CI. No store, no data
 * directory, nothing written. Plain Node: relative imports only.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import nextEnv from '@next/env';

import { readModelSettings } from '../lib/config/variables.js';
import { serializeContext } from '../lib/ai/context/serialize.js';
import { limits } from '../personalos.config.js';
import { EMPTY_CONTEXT, MIXES, archiveOf, fill, seedContext } from './measure-context/mixes.js';

/** The model the limit is sized for: the cheapest, and the one with the step. */
const DEFAULT_MODEL = 'claude-haiku-5-5';

/** A short question, as the fixed part counts one. */
const QUESTION = 'Quanto ho speso al supermercato il mese scorso?';

/** The ceiling the limit is held to, and the step it stays under. */
const CEILINGS = [90_000, 100_000];

/**
 * @param {string[]} args
 * @returns {string}
 */
function modelFrom(args) {
  const at = args.indexOf('--model');
  if (at === -1) return DEFAULT_MODEL;
  const model = args[at + 1];
  if (model === undefined || model.startsWith('--')) throw new Error('--model needs a model id after it');
  return model;
}

// The key is read the way `next dev` reads it: .env.local, a key exported in
// the shell winning over it.
const { combinedEnv } = nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });
const { anthropicApiKey } = readModelSettings(combinedEnv);

if (anthropicApiKey === null) {
  console.error('ANTHROPIC_API_KEY is not set -- nothing to count with. Set it in .env.local or the shell.');
  process.exitCode = 1;
} else {
  const model = modelFrom(process.argv.slice(2));
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { answerRequest } = await import('../lib/answer.js');
  const client = new Anthropic({ apiKey: anthropicApiKey });

  /** @param {import('../lib/ai/context/index.js').QuestionContext} context */
  const tokensOf = async (context) => {
    // The request a question sends, less what counting does not take.
    const { max_tokens: _, ...request } = answerRequest(QUESTION, context, model);
    return (await client.messages.countTokens(request)).input_tokens;
  };

  const seed = archiveOf(JSON.parse(await readFile(path.join(process.cwd(), 'data', 'seed.json'), 'utf8')));
  const fixed = await tokensOf(EMPTY_CONTEXT);
  const fixedChars = serializeContext(EMPTY_CONTEXT).length;

  console.log(model + ' -- contextMaxChars ' + limits.contextMaxChars.toLocaleString('en'));
  console.log('fixed part (instructions, tool, a short question, an empty context): ' + fixed + ' tokens\n');

  /** @type {[string, import('../lib/ai/context/index.js').QuestionContext][]} */
  const contexts = [
    ...Object.entries(MIXES).map(([name, mix]) => /** @type {[string, any]} */ ([name, fill(mix, seed, limits.contextMaxChars)])),
    ['the seed', seedContext(seed)],
  ];
  for (const [name, context] of contexts) {
    const chars = serializeContext(context).length;
    const tokens = await tokensOf(context);
    // Per character of context: the fixed part comes off both sides.
    const ratio = (tokens - fixed) / (chars - fixedChars);
    console.log(name);
    console.log('  ' + chars.toLocaleString('en') + ' characters, ' + tokens.toLocaleString('en') + ' tokens in all');
    console.log('  ' + ratio.toFixed(3) + ' tokens a character');
    for (const ceiling of CEILINGS) {
      const largest = Math.floor((ceiling - fixed) / ratio);
      console.log('  largest limit for ' + ceiling.toLocaleString('en') + ' tokens: ' + largest.toLocaleString('en') + ' characters');
    }
  }
}
