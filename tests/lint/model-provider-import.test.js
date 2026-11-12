/**
 * eslint.config.mjs: the model provider's SDK is imported in one place,
 * lib/ai/providers/anthropic.js, behind the seam in lib/ai/provider.js (ADR
 * 0037). Tested through ESLint itself because flat config replaces a rule's
 * options when a later block names it again: a pattern in the wrong block
 * silently drops the restrictions already there.
 */

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

/**
 * The messages no-restricted-imports reports for `code` linted as `filePath`.
 *
 * @param {string} code
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
async function restrictedImports(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-imports').map((message) => message.message);
}

const SDK_IMPORT = "import Anthropic from '@anthropic-ai/sdk';\nexport const client = new Anthropic();\n";
const SDK_SUBPATH_IMPORT = "export { APIError } from '@anthropic-ai/sdk/error';\n";
const AT_ALIAS_IMPORT = "export { env } from '@/lib/config/env.js';\n";
const ADAPTER_IMPORT = "export * from '../adapters/json/index.js';\n";

// One file in each folder the rule protects, the seam itself among them.
// The names need not exist.
const PROTECTED = [
  'lib/classify.js',
  'lib/ai/provider.js',
  'lib/store.js',
  'lib/adapters/json/example.js',
  'app/api/example/route.js',
  'components/Example.js',
];

describe('importing the model SDK', () => {
  it.each(PROTECTED)('is an error in %s, naming the seam', async (filePath) => {
    expect(await restrictedImports(SDK_IMPORT, filePath)).toEqual([expect.stringContaining('lib/ai/provider.js')]);
  });

  it.each(PROTECTED)('is an error in %s by a subpath too', async (filePath) => {
    expect(await restrictedImports(SDK_SUBPATH_IMPORT, filePath)).toEqual([expect.stringContaining('lib/ai/provider.js')]);
  });

  it.each([
    ['lib/ai/providers/anthropic.js', 'the provider that wraps it'],
    ['scripts/measure-context.js', 'a script, which counts tokens with the SDK directly'],
    ['tests/lib/example.test.js', 'a test, which mocks it'],
  ])('is allowed in %s, %s', async (filePath) => {
    expect(await restrictedImports(SDK_IMPORT, filePath)).toEqual([]);
  });
});

describe('the restrictions already in the same blocks', () => {
  it.each(['lib/classify.js', 'lib/store.js', 'lib/ai/providers/anthropic.js'])(
    'still refuse the @/ alias in %s',
    async (filePath) => {
      expect(await restrictedImports(AT_ALIAS_IMPORT, filePath)).toEqual([expect.stringContaining('plain Node')]);
    }
  );

  it.each(['lib/classify.js', 'lib/ai/providers/anthropic.js', 'app/api/example/route.js', 'components/Example.js', 'scripts/example.js'])(
    'still refuse an adapter import in %s',
    async (filePath) => {
      expect(await restrictedImports(ADAPTER_IMPORT, filePath)).toEqual([expect.stringContaining('lib/store.js')]);
    }
  );

  it('still let tests/store/ import an adapter', async () => {
    expect(await restrictedImports(ADAPTER_IMPORT, 'tests/store/example.test.js')).toEqual([]);
  });
});
