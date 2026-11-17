/**
 * Rule 3 for Home (ADR 0040): loading it never calls a model or an
 * integration. Held by what it can reach at all, as the Finances screen's is
 * (finances-page-imports.test.js): every module Home imports, followed to the
 * end, is outside lib/ai/ and lib/integrations/, is none of the modules that
 * call a model, and is not the SDK.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const FORBIDDEN = [
  /^@anthropic-ai\//,
  /^lib\/ai\//,
  /^lib\/integrations\//,
  /^lib\/(classify|answer|extract)\.js$/,
  /^lib\/checkin\/interpret\.js$/,
];

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

/**
 * Every module a file reaches through its imports: repo-relative paths for
 * files, specifiers for packages.
 *
 * @param {string} entry repo-relative path
 * @returns {Promise<Set<string>>}
 */
async function reachable(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = /** @type {string} */ (queue.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.(m?js)$/.test(file)) continue;
    // Comments out first: a JSDoc type's import('...') loads nothing.
    const source = (await readFile(path.join(ROOT, file), 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    for (const match of source.matchAll(IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (specifier.startsWith('@/')) queue.push(specifier.slice(2));
      else if (specifier.startsWith('.')) queue.push(path.relative(ROOT, path.resolve(ROOT, path.dirname(file), specifier)));
      else seen.add(specifier);
    }
  }
  return seen;
}

describe('Home', () => {
  it('reaches the store, its derivation and the check-in panel, so the walk is real', async () => {
    const modules = await reachable('app/page.js');
    expect(modules).toContain('lib/store.js');
    expect(modules).toContain('lib/domain/derive/home.js');
    expect(modules).toContain('components/CheckinPanel.js');
  });

  it('would be caught: the capture route reaches a model', async () => {
    const modules = [...(await reachable('app/api/capture/route.js'))];
    expect(modules.filter((module) => FORBIDDEN.some((pattern) => pattern.test(module)))).not.toEqual([]);
  });

  it('reaches neither a model nor an integration when it loads', async () => {
    const modules = [...(await reachable('app/page.js'))];
    expect(modules.filter((module) => FORBIDDEN.some((pattern) => pattern.test(module)))).toEqual([]);
  });
});
