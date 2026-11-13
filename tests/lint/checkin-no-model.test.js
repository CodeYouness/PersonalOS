/**
 * Rule 3 for the check-in (ADR 0037): loading its questions, and filing a
 * closed answer, call no model. Held by what the code can reach, not by
 * what it happens to call today: every module the check-in's panel on Home
 * and its day module import, followed to the end, is outside lib/ai/ and is
 * none of the modules that call a model.
 *
 * The open answer is the one exception, by design: on POST it is read by
 * the small model after its journal entry is kept, and only through
 * lib/checkin/interpret.js. So the route may reach a model through that one
 * module and no other, and nothing that computes the questions reaches it.
 * The route test holds GET and the closed answers to no call at run time.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** The check-in's own model-free code: where the walk starts. */
const ENTRIES = ['components/CheckinPanel.js', 'lib/checkin/day.js', 'lib/checkin/closed.js', 'lib/domain/derive/checkin.js'];

/** The route, which files the open answer through the interpreter too. */
const ROUTE = 'app/api/checkin/route.js';

/** The one module of the check-in that reaches a model: the open answer's reader. */
const INTERPRETER = 'lib/checkin/interpret.js';

/** Modules that call a model, or reach one. */
const MODEL_MODULES = ['lib/classify.js', 'lib/answer.js', 'lib/extract.js'];

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

/**
 * The repository-relative path an import names, or null for a package.
 *
 * @param {string} from repository-relative path of the importing file
 * @param {string} specifier
 * @returns {string | null}
 */
function resolve(from, specifier) {
  if (specifier.startsWith('@/')) return specifier.slice(2);
  if (specifier.startsWith('.')) return path.relative(ROOT, path.resolve(ROOT, path.dirname(from), specifier));
  return null;
}

/**
 * Every repository module reachable from the entries, the entries included.
 * A module in `stops` is listed when reached but not followed.
 *
 * @param {string[]} entries
 * @param {string[]} [stops]
 * @returns {Promise<Set<string>>}
 */
async function reachable(entries, stops = []) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    if (stops.includes(file)) continue;
    // Comments out first: a JSDoc type's import('...') loads nothing.
    const source = (await readFile(path.join(ROOT, file), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const match of source.matchAll(IMPORT)) {
      const target = resolve(file, match[1] ?? match[2] ?? match[3]);
      if (target !== null && /\.(m?js)$/.test(target)) queue.push(target);
    }
  }
  return seen;
}

/**
 * @param {Iterable<string>} modules
 * @returns {string[]} those that are, or are in, the model's code
 */
const modelCode = (modules) => [...modules].filter((file) => file.startsWith('lib/ai/') || MODEL_MODULES.includes(file));

describe('the check-in', () => {
  it('reaches its own modules and the registry, so the walk is real', async () => {
    const modules = await reachable(ENTRIES);
    expect(modules).toContain('lib/actions/registry.js');
    expect(modules).toContain('lib/store.js');
    expect(modules).toContain('components/CheckinQuestions.js');
  });

  it('would be caught: the capture route, which does call a model, reaches one', async () => {
    const modules = [...(await reachable(['app/api/capture/route.js']))];
    expect(modules).toContain('lib/classify.js');
    expect(modules.some((file) => file.startsWith('lib/ai/'))).toBe(true);
  });

  it('computes its questions and files a closed answer reaching nothing in lib/ai/ and no module that calls a model', async () => {
    const modules = await reachable(ENTRIES);
    expect(modelCode(modules)).toEqual([]);
    expect(modules).not.toContain(INTERPRETER);
  });

  it('would be caught: the interpreter does reach the model', async () => {
    expect(modelCode(await reachable([INTERPRETER]))).toContain('lib/ai/provider.js');
  });

  it('reaches a model from its route only through the open answer\'s interpreter', async () => {
    const modules = await reachable([ROUTE], [INTERPRETER]);
    expect(modules).toContain(INTERPRETER);
    expect(modelCode(modules)).toEqual([]);
  });
});
