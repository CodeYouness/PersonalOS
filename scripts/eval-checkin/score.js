/**
 * Scoring for `npm run eval:classify -- --suite checkin`: the actions one
 * open answer was read as, against the ones it should file. Pure -- no
 * model, no store -- so the script only reads the cases, calls the model
 * and prints.
 *
 * Plain Node, like everything under scripts/: relative imports only.
 */

/**
 * @typedef {{ action: string, params?: Record<string, unknown> }} ExpectedAction
 *   an action and only the params worth scoring
 * @typedef {{ text: string, expected: readonly ExpectedAction[], optional?: readonly ExpectedAction[] }} Case
 * @typedef {import('../../lib/actions/registry.js').ActionRequest} Request
 * @typedef {{ inputTokens: number, outputTokens: number }} Usage
 * @typedef {{ model: string, case: Case, requests: Request[] | null, usage: Usage | null, error: string | null }} Result
 */

/**
 * @param {ExpectedAction} want
 * @param {Request} got
 * @returns {boolean}
 */
function fits(want, got) {
  if (want.action !== got.name) return false;
  const params = /** @type {Record<string, unknown>} */ (got.params ?? {});
  return Object.entries(want.params ?? {}).every(([key, value]) =>
    // The account is matched against yours by name, whatever its case.
    key === 'account' && typeof value === 'string' && typeof params[key] === 'string'
      ? /** @type {string} */ (params[key]).trim().toLowerCase() === value.toLowerCase()
      : params[key] === value
  );
}

/**
 * One case scored: every expected action found once among the requests, in
 * any order, and no request left over but an optional one. With no requests
 * -- the model failed -- every expected action is missed.
 *
 * @param {Case} testCase
 * @param {Request[] | null} requests
 * @returns {{ passed: boolean, missed: ExpectedAction[], extra: Request[] }}
 */
export function scoreCase(testCase, requests) {
  if (requests === null) return { passed: false, missed: [...testCase.expected], extra: [] };
  const left = [...requests];
  /** @type {ExpectedAction[]} */
  const missed = [];
  for (const want of testCase.expected) {
    const index = left.findIndex((got) => fits(want, got));
    if (index === -1) missed.push(want);
    else left.splice(index, 1);
  }
  const extra = left.filter((got) => !(testCase.optional ?? []).some((maybe) => fits(maybe, got)));
  return { passed: missed.length === 0 && extra.length === 0, missed, extra };
}

/**
 * Each model's run: how many calls answered, how many cases passed, the
 * failing ones and the tokens used.
 *
 * @param {Result[]} results
 */
export function summarise(results) {
  const models = [...new Set(results.map((result) => result.model))];
  return models.map((model) => {
    const own = results.filter((result) => result.model === model);
    const failing = [];
    let passed = 0;
    const usage = { inputTokens: 0, outputTokens: 0 };
    for (const result of own) {
      usage.inputTokens += result.usage?.inputTokens ?? 0;
      usage.outputTokens += result.usage?.outputTokens ?? 0;
      const score = scoreCase(result.case, result.requests);
      if (score.passed) passed += 1;
      else failing.push({ text: result.case.text, ...score, got: result.requests, error: result.error });
    }
    const metered = own.filter((result) => result.usage !== null).length;
    const answered = own.filter((result) => result.requests !== null).length;
    return { model, cases: own.length, answered, passed, failing, usage, metered };
  });
}
