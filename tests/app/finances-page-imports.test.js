/**
 * Rule 3 for the Finances screen (#137): loading it never calls the model or
 * an integration. Proved by what it can reach at all -- its import graph
 * never touches the SDK, the classifier or an integration -- so a future
 * import that would make a page load call out fails here.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const FORBIDDEN = [/^@anthropic-ai\//, /lib\/classify\.js$/, /lib\/integrations\//];

/**
 * Every module a file reaches through its static imports, as specifiers for
 * packages and repo-relative paths for files.
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
    const source = await readFile(path.join(ROOT, file), 'utf8');
    for (const [, specifier] of source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      if (specifier.startsWith('@/')) queue.push(specifier.slice(2));
      else if (specifier.startsWith('.')) queue.push(path.join(path.dirname(file), specifier));
      else seen.add(specifier);
    }
  }
  return seen;
}

describe('the Finances screen', () => {
  it('reaches neither the model nor an integration when it loads', async () => {
    const modules = [...(await reachable('app/finances/page.js'))];

    expect(modules).toContain('lib/store.js');
    expect(modules.filter((module) => FORBIDDEN.some((pattern) => pattern.test(module)))).toEqual([]);
  });
});
