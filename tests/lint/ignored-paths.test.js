/**
 * eslint.config.mjs: a sync conflict copy is not linted (#154). The
 * repository lives in a synced folder that makes copies like
 * `FinanceSettings 2.js`; git ignores them, and a stale one must never fail
 * `npm run lint` for a reason that has nothing to do with the change.
 */

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

describe('a sync conflict copy', () => {
  it.each(['components/FinanceSettings 2.js', 'app/api/transactions/route 2.js', 'tests/store/example.test 3.js'])(
    'is not linted: %s',
    async (filePath) => {
      expect(await eslint.isPathIgnored(filePath)).toBe(true);
    }
  );

  it.each(['components/FinanceSettings.js', 'app/api/transactions/route.js', 'tests/store/example.test.js'])(
    'leaves its original linted: %s',
    async (filePath) => {
      expect(await eslint.isPathIgnored(filePath)).toBe(false);
    }
  );
});
