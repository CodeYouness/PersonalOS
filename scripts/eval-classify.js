#!/usr/bin/env node
/**
 * `npm run eval:classify [-- --suite <classify|checkin>] [-- --model <id> ...]`
 * (#197): runs a fixed set of made-up sentences on each model and prints how
 * well each did and what it cost -- so a cheaper model is chosen on a
 * result, not a hunch. Two suites:
 *
 * - `classify` (the default): files capture sentences, scored field by field.
 * - `checkin`: reads check-in open answers for the actions they name (ADR
 *   0037, lib/checkin/interpret.js), scored action by action against
 *   invented habits, categories and accounts.
 *
 * It calls the real API with your key and spends money, so it is run on
 * purpose and never by `npm run verify` or CI; with no key it says so and
 * exits 1, calling nothing. It writes nothing and never touches the store:
 * the check-in suite is given its context and calls the model alone. Plain
 * Node, like every script under scripts/: relative imports only.
 */

import nextEnv from '@next/env';

import { readModelSettings } from '../lib/config/variables.js';
import { CASES, CATEGORIES } from './eval-classify/cases.js';
import { formatMicros, summarise } from './eval-classify/score.js';
import { CASES as CHECKIN_CASES, CONTEXT as CHECKIN_CONTEXT } from './eval-checkin/cases.js';
import { summarise as summariseCheckin } from './eval-checkin/score.js';

/** The suites, the first the default. */
const SUITES = ['classify', 'checkin'];

/**
 * Compared when no --model is given: Haiku 5.5, the default since #198, and
 * Sonnet 5, every call's model before it. Not Sonnet 5.5, which refuses the forced tool_choice
 * the classifier uses.
 */
const DEFAULT_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5'];

/** When and where PRICES were read, printed with the report so stale figures show. */
const PRICES_READ = '2026-10-15 from https://platform.claude.com/docs/en/about-claude/pricing';

/**
 * Micro-dollars per million tokens. Haiku 5.5 is the price for prompts up to
 * 100,000 tokens: a capture is a few thousand. Sonnet 5 is what every call
 * ran on before #198; Sonnet 5.5 refuses the classifier's forced tool, so a run
 * of it reports that in one line. A model missing here is still scored.
 *
 * @type {Record<string, import('./eval-classify/score.js').Price>}
 */
const PRICES = {
  'claude-haiku-5-5': { inputPerMTok: 100_000, outputPerMTok: 500_000 },
  'claude-sonnet-5-5': { inputPerMTok: 2_000_000, outputPerMTok: 10_000_000 },
  'claude-sonnet-5': { inputPerMTok: 2_000_000, outputPerMTok: 10_000_000 },
};

/**
 * Every value given after a flag, in order.
 *
 * @param {string[]} args
 * @param {string} flag
 * @returns {string[]}
 */
function valuesOf(args, flag) {
  /** @type {string[]} */
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== flag) continue;
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(flag + ' needs a value after it');
    values.push(value);
    i += 1;
  }
  return values;
}

/**
 * @param {string[]} args
 * @returns {string[]}
 */
function modelsFrom(args) {
  const models = valuesOf(args, '--model');
  return models.length > 0 ? models : DEFAULT_MODELS;
}

/**
 * @param {string[]} args
 * @returns {string}
 */
function suiteFrom(args) {
  const [suite = SUITES[0], ...more] = valuesOf(args, '--suite');
  if (more.length > 0) throw new Error('--suite is given once');
  if (!SUITES.includes(suite)) throw new Error('--suite is one of ' + SUITES.join(', ') + ', received ' + suite);
  return suite;
}

/**
 * Micro-dollars for some tokens on a model, or null with no price for it.
 *
 * @param {string} model
 * @param {{ inputTokens: number, outputTokens: number }} usage
 * @returns {number | null}
 */
function microsFor(model, usage) {
  const price = PRICES[model];
  if (price === undefined) return null;
  return Math.round((usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1_000_000);
}

// The key is read the way `next dev` reads it: .env.local, a key exported in
// the shell winning over it. Loaded before lib/classify.js is imported,
// since lib/config/env.js reads the environment once, at import.
const { combinedEnv } = nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

const args = process.argv.slice(2);
const models = modelsFrom(args);
const suite = suiteFrom(args);

if (readModelSettings(combinedEnv).anthropicApiKey === null) {
  console.error('ANTHROPIC_API_KEY is not set -- nothing to score. Set it in .env.local or the shell.');
  process.exitCode = 1;
} else if (suite === 'checkin') {
  await runCheckin();
} else {
  await runClassify();
}

async function runClassify() {
  const { classifyWithModel } = await import('../lib/classify.js');

  /** @type {import('./eval-classify/score.js').Result[]} */
  const results = [];
  for (const model of models) {
    process.stderr.write(model + ' ');
    for (const testCase of CASES) {
      try {
        const { classification, usage } = await classifyWithModel(testCase.text, {
          model,
          saidOn: testCase.saidOn,
          context: { categories: [...CATEGORIES] },
        });
        results.push({ model, case: testCase, classification, usage, error: null });
        process.stderr.write('.');
      } catch (error) {
        results.push({ model, case: testCase, classification: null, usage: null, error: error instanceof Error ? error.message : String(error) });
        process.stderr.write('x');
      }
    }
    process.stderr.write('\n');
  }

  console.log('\n' + CASES.length + ' sentences; prices read ' + PRICES_READ);
  for (const run of summarise(results, PRICES)) {
    // A refused key, an empty balance or a retired model fails every call the
    // same way: say it once, not once a sentence -- nothing was scored.
    if (run.answered === 0) {
      console.log('\n' + run.model + ' -- every call failed, nothing scored. The first: ' + run.failing[0].error);
      process.exitCode = 1;
      continue;
    }

    console.log('\n' + run.model + ' -- ' + run.passed + ' / ' + run.cases + ' sentences filed right');
    for (const [field, { passed, total }] of Object.entries(run.fields)) {
      console.log('  ' + field.padEnd(12) + String(passed).padStart(3) + ' / ' + total);
    }
    console.log('  tokens      ' + run.usage.inputTokens + ' in, ' + run.usage.outputTokens + ' out');
    console.log(
      '  cost        ' +
        (run.cost === null
          ? 'no price for this model'
          : formatMicros(run.cost.runMicros) + ' the run, ' + formatMicros(run.cost.perCaptureMicros) + ' a capture')
    );
    for (const miss of run.failing) {
      console.log('  wrong: "' + miss.text + '" -- ' + miss.missed.join(', '));
      console.log('    expected ' + JSON.stringify(miss.expected));
      console.log('    got      ' + (miss.got === null ? 'nothing: ' + miss.error : JSON.stringify(miss.got)));
    }
  }
}

async function runCheckin() {
  const { interpretOpenAnswerWithModel } = await import('../lib/checkin/interpret.js');

  /** @type {import('./eval-checkin/score.js').Result[]} */
  const results = [];
  for (const model of models) {
    process.stderr.write(model + ' ');
    for (const testCase of CHECKIN_CASES) {
      try {
        const { requests, usage } = await interpretOpenAnswerWithModel(testCase.text, { model, context: CHECKIN_CONTEXT });
        results.push({ model, case: testCase, requests, usage, error: null });
        process.stderr.write('.');
      } catch (error) {
        results.push({ model, case: testCase, requests: null, usage: null, error: error instanceof Error ? error.message : String(error) });
        process.stderr.write('x');
      }
    }
    process.stderr.write('\n');
  }

  console.log('\n' + CHECKIN_CASES.length + ' open answers; prices read ' + PRICES_READ);
  for (const run of summariseCheckin(results)) {
    if (run.answered === 0) {
      console.log('\n' + run.model + ' -- every call failed, nothing scored. The first: ' + run.failing[0].error);
      process.exitCode = 1;
      continue;
    }
    console.log('\n' + run.model + ' -- ' + run.passed + ' / ' + run.cases + ' answers read right');
    console.log('  tokens      ' + run.usage.inputTokens + ' in, ' + run.usage.outputTokens + ' out');
    const micros = microsFor(run.model, run.usage);
    console.log(
      '  cost        ' +
        (micros === null
          ? 'no price for this model'
          : formatMicros(micros) + ' the run, ' + formatMicros(run.metered === 0 ? 0 : Math.round(micros / run.metered)) + ' an answer')
    );
    for (const miss of run.failing) {
      console.log('  wrong: "' + miss.text + '"');
      if (miss.missed.length > 0) console.log('    missed   ' + JSON.stringify(miss.missed));
      if (miss.extra.length > 0) console.log('    extra    ' + JSON.stringify(miss.extra));
      if (miss.got === null) console.log('    got      nothing: ' + miss.error);
    }
  }
}
