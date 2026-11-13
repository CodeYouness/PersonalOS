/**
 * Rule 3 for the check-in (ADR 0037): loading its questions, and filing a
 * closed answer, call no model. Held by what the code can reach, not by
 * what it happens to call today: every module the check-in's route and its
 * panel on Home import, followed to the end, is outside lib/ai/ and is none
 * of the modules that call a model. The route test runs it with no key as
 * well.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** The check-in's own code: where the walk starts. */
const ENTRIES = ['app/api/checkin/route.js', 'components/CheckinPanel.js', 'lib/checkin/closed.js', 'lib/domain/derive/checkin.js'];

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
 *
 * @param {string[]} entries
 * @returns {Promise<Set<string>>}
 */
async function reachable(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    if (seen.has(file)) continue;
    seen.add(file);
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

  it('reaches nothing in lib/ai/ and no module that calls a model', async () => {
    const modules = [...(await reachable(ENTRIES))];
    expect(modules.filter((file) => file.startsWith('lib/ai/') || MODEL_MODULES.includes(file))).toEqual([]);
  });
});
