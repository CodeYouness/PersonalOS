/**
 * eslint.config.mjs: a month key or a day key comes from lib/domain/dates.js,
 * never from slicing a string by hand (ADR-0005, CLAUDE.md rule 4). The
 * config is tested here, through ESLint itself, because flat
 * config replaces a rule's options when a later block names it again: a
 * selector in the wrong block silently drops the rules already there.
 */

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

/**
 * The messages no-restricted-syntax reports for `code` linted as `filePath`.
 *
 * @param {string} code
 * @param {string} filePath
 * @returns {Promise<string[]>}
 */
async function restrictedSyntax(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').map((message) => message.message);
}

const MONTH_SLICE = "export const month = '2026-10-11'.slice(0, 7);\n";
const DAY_SLICE = "export const day = '2026-10-11T08:00:00.000Z'.slice(0, 10);\n";
const ISO_SLICE = 'export const day = new Date().toISOString().slice(0, 4);\n';

// One file in each folder the rule protects, and lib/config/env.js, which
// sits outside the process.env rule but not outside these. The names need
// not exist.
const PROTECTED = ['app/example/route.js', 'components/Example.js', 'lib/domain/derive/example.js', 'scripts/example.js', 'lib/config/env.js'];

describe('slicing a month key by hand', () => {
  it.each(PROTECTED)('is an error in %s, naming monthOf', async (filePath) => {
    expect(await restrictedSyntax(MONTH_SLICE, filePath)).toEqual([expect.stringContaining('monthOf')]);
  });
});

describe('slicing a day key by hand', () => {
  it.each(PROTECTED)('is an error in %s, naming toDayKey', async (filePath) => {
    expect(await restrictedSyntax(DAY_SLICE, filePath)).toEqual([expect.stringContaining('toDayKey')]);
  });
});

describe('where slicing by hand is allowed', () => {
  it('is allowed in lib/domain/dates.js, which implements the helpers', async () => {
    expect(await restrictedSyntax(MONTH_SLICE + DAY_SLICE, 'lib/domain/dates.js')).toEqual([]);
  });

  it('is allowed in tests, which compute expected values without the helper under test', async () => {
    expect(await restrictedSyntax(MONTH_SLICE + DAY_SLICE, 'tests/domain/example.test.js')).toEqual([]);
  });

  it('reports a day sliced from toISOString() once, not twice', async () => {
    const code = 'export const day = new Date().toISOString().slice(0, 10);\n';

    expect(await restrictedSyntax(code, 'lib/domain/derive/example.js')).toEqual([expect.stringContaining('from an instant')]);
  });

  // The rule cannot tell a string from an array: a top ten sliced with
  // literals is flagged too. Naming the count says what it is and passes.
  it("flags an array's slice(0, 10) as well, and passes a named count", async () => {
    const literal = 'export const top = (rows) => rows.slice(0, 10);\n';
    const named = 'const TOP = 10;\nexport const top = (rows) => rows.slice(0, TOP);\n';

    expect(await restrictedSyntax(literal, 'lib/domain/derive/example.js')).toHaveLength(1);
    expect(await restrictedSyntax(named, 'lib/domain/derive/example.js')).toEqual([]);
  });

  it('leaves other slices alone', async () => {
    const code = "export const year = '2026-10-11'.slice(0, 4);\nexport const cents = '505'.slice(0, 2);\n";

    expect(await restrictedSyntax(code, 'lib/domain/derive/example.js')).toEqual([]);
  });
});

describe('the rules already in the same block', () => {
  it('still refuses slicing an ISO timestamp in app code', async () => {
    expect(await restrictedSyntax(ISO_SLICE, 'lib/domain/derive/example.js')).toEqual([expect.stringContaining('from an instant')]);
  });

  it('still refuses slicing an ISO timestamp in tests', async () => {
    expect(await restrictedSyntax(ISO_SLICE, 'tests/domain/example.test.js')).toEqual([expect.stringContaining('from an instant')]);
  });

  it('still refuses reading process.env outside lib/config/env.js', async () => {
    expect(await restrictedSyntax('export const dir = process.env.DATA_DIR;\n', 'lib/domain/derive/example.js')).toEqual([
      expect.stringContaining('process.env'),
    ]);
  });
});
