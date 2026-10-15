/**
 * Scoring for `npm run eval:classify` (#197): one classification against
 * what its sentence should file as, and a run summed up per model and
 * priced. Pure -- no model, no store -- so the script around it only reads
 * the cases, calls the model and prints.
 *
 * Plain Node, like everything under scripts/: relative imports only.
 */

/**
 * @typedef {import('../../lib/classify.js').Classification} Classification
 * @typedef {{ destination: string | string[] } & Record<string, unknown>} Expected
 *   what a sentence should file as: the destination -- or the ones that file
 *   the same record, such as task and people -- and only the fields worth
 *   scoring
 * @typedef {{ text: string, saidOn: string, expected: Expected }} Case
 * @typedef {{ inputTokens: number, outputTokens: number }} Usage
 * @typedef {{ model: string, case: Case, classification: Classification | null, usage: Usage | null, error: string | null }} Result
 * @typedef {{ inputPerMTok: number, outputPerMTok: number }} Price micro-dollars per million tokens
 */

/**
 * Estimates, not readings: there is no single right number of calories in
 * "a carbonara", so a guess within a quarter of the written one passes.
 */
const ESTIMATED = new Set(['calories', 'protein', 'carbs', 'fat']);
const ESTIMATE_TOLERANCE = 0.25;

/**
 * Pass or fail for each field the case names, and only those: a title is
 * free text and never scored. Everything but an estimate must match exactly;
 * a field the classifier left out reads as null, so "no amount" can be
 * expected. With no classification -- the model failed -- every named field
 * fails.
 *
 * @param {Expected} expected
 * @param {Classification | null} classification
 * @returns {Record<string, boolean>}
 */
export function scoreCase(expected, classification) {
  /** @type {Record<string, boolean>} */
  const score = {};
  for (const [field, want] of Object.entries(expected)) {
    if (classification === null) {
      score[field] = false;
      continue;
    }
    const got =
      field === 'destination' ? classification.destination : /** @type {Record<string, unknown>} */ (classification.fields)[field] ?? null;
    score[field] = matches(field, want, got);
  }
  return score;
}

/**
 * @param {string} field
 * @param {unknown} want
 * @param {unknown} got
 * @returns {boolean}
 */
function matches(field, want, got) {
  if (Array.isArray(want)) return want.includes(got);
  if (ESTIMATED.has(field) && typeof want === 'number' && want > 0) {
    return typeof got === 'number' && Math.abs(got - want) <= want * ESTIMATE_TOLERANCE;
  }
  // The account is matched against yours later, by name: its case is not
  // what the model is being scored on.
  if (field === 'account' && typeof want === 'string') {
    return typeof got === 'string' && got.trim().toLowerCase() === want.trim().toLowerCase();
  }
  return got === want;
}

/**
 * Each model's run: the pass rate per field, the cases it got wrong, the
 * tokens it used and what that cost. Cost stays in whole micro-dollars,
 * rounded once on the run; a capture costs the run over the calls that
 * reported usage, since a failed call cost nothing anyone knows. A model
 * with no price is still scored, and its cost is null.
 *
 * @param {Result[]} results
 * @param {Record<string, Price>} prices
 */
export function summarise(results, prices) {
  const models = [...new Set(results.map((result) => result.model))];
  return models.map((model) => {
    const own = results.filter((result) => result.model === model);
    /** @type {Record<string, { passed: number, total: number }>} */
    const fields = {};
    const failing = [];
    let passed = 0;
    for (const result of own) {
      const score = scoreCase(result.case.expected, result.classification);
      for (const [field, ok] of Object.entries(score)) {
        fields[field] ??= { passed: 0, total: 0 };
        fields[field].total += 1;
        if (ok) fields[field].passed += 1;
      }
      const missed = Object.keys(score).filter((field) => !score[field]);
      if (missed.length === 0) {
        passed += 1;
      } else {
        failing.push({ text: result.case.text, missed, expected: result.case.expected, got: result.classification, error: result.error });
      }
    }

    const answered = own.filter((result) => result.usage !== null);
    const usage = {
      inputTokens: answered.reduce((sum, result) => sum + (result.usage?.inputTokens ?? 0), 0),
      outputTokens: answered.reduce((sum, result) => sum + (result.usage?.outputTokens ?? 0), 0),
    };
    const price = prices[model];
    // Tokens × micro-dollars per million tokens: an exact integer until the
    // one division by a million.
    const exact = price === undefined ? null : usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok;
    const cost =
      exact === null
        ? null
        : {
            runMicros: Math.round(exact / 1_000_000),
            perCaptureMicros: answered.length === 0 ? 0 : Math.round(exact / 1_000_000 / answered.length),
          };

    return { model, cases: own.length, passed, fields, failing, usage, cost };
  });
}

/**
 * Micro-dollars as dollars, written from the integer: "$0.000500".
 *
 * @param {number} micros
 * @returns {string}
 */
export function formatMicros(micros) {
  return '$' + Math.floor(micros / 1_000_000) + '.' + String(micros % 1_000_000).padStart(6, '0');
}
