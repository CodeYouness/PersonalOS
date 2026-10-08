/**
 * CLAUDE.md: data routes declare `dynamic = 'force-dynamic'`. Without it
 * Next may render a page once at build time and serve yesterday's data, and
 * nothing fails -- the screen just stops changing. Every route handler and
 * page under app/ reads the store, so every one declares it.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const files = (await readdir('app', { recursive: true }))
  .filter((file) => ['route.js', 'page.js'].includes(path.basename(file)))
  .map((file) => path.join('app', file));

describe('every route and page under app/', () => {
  it('finds some', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s declares force-dynamic', async (file) => {
    expect(await readFile(file, 'utf8')).toMatch(/^export const dynamic = 'force-dynamic';$/m);
  });
});
