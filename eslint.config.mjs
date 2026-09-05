import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

// The layers where the actual logic lives -- none of it is JSX, so none of
// it was ever examined by eslint-config-next's React/a11y-focused rules.
const LOGIC_LAYER = ["lib/**/*.js", "scripts/**/*.js", "tests/**/*.js"];

// CLAUDE.md rule 1: lib/ runs under plain Node -- relative imports only, no
// bundler alias. Scripts and one-off migrations depend on that.
const NO_AT_ALIAS = {
  group: ["@/**"],
  message: "lib/ must run under plain Node: use a relative import, not the @/ alias.",
};

// docs/architecture.md: nothing outside the data layer imports a storage
// adapter directly.
const NO_ADAPTER_IMPORT = {
  group: ["**/adapters/**"],
  message:
    "Only lib/store.js may import a storage adapter. Add a domain operation to lib/store.js instead.",
};

// ADR-0005: lib/domain/dates.js is the only place allowed to compute a day
// key from an instant.
const NO_ISO_SLICE = {
  selector:
    "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
  message:
    "Only lib/domain/dates.js may compute a day key from an instant. Call toDayKey() or today() instead (ADR-0005).",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ADR-0001 keeps ESLint so a lint check exists at all; these are that
  // check, for the layer eslint-config-next's JSX-only rules never touch.
  {
    files: LOGIC_LAYER,
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // ignoreRestSiblings: the migration code's `const { x, ...rest } = y`
      // idiom deliberately drops a field by destructuring it out; that
      // binding is meant to go unused.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
      eqeqeq: "error",
      "no-undef": "error",
    },
  },

  // Flat config replaces a rule's whole options when the same rule name
  // appears in a later matching block -- it does not merge them. So every
  // restriction that can apply to the same file lives in one block per
  // rule, and every block below is file-disjoint from any other block using
  // the same rule name.

  // Most of lib/: no @/ alias, no reaching around the store for an adapter.
  {
    files: ["lib/**/*.js"],
    ignores: ["lib/store.js", "lib/adapters/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_AT_ALIAS, NO_ADAPTER_IMPORT] }],
    },
  },
  // lib/store.js and the adapters themselves are still lib/, and still must
  // avoid the @/ alias -- the adapter-import rule obviously does not apply
  // to their own files, so it is not repeated here.
  {
    files: ["lib/store.js", "lib/adapters/**/*.js"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_AT_ALIAS] }],
    },
  },
  // The adapter-import rule outside lib/. tests/store/ is exempt: the
  // adapter contract suite and the migration/reset-backup tests live there,
  // and testing the data layer directly is not bypassing it.
  {
    files: ["app/**/*.js", "components/**/*.js", "scripts/**/*.js", "tests/**/*.js"],
    ignores: [
      "tests/store/**",
      // Ticket 07 moves this through the store; tracked there, not here.
      "scripts/reset-data.js",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_ADAPTER_IMPORT] }],
    },
  },

  // CLAUDE.md / lib/config/env.js: it is the only module allowed to read
  // process.env, dot or bracket notation. ADR-0005's day-key rule lives in
  // the same block since both apply to the same files. Tests are exempt
  // from the first -- they set process.env directly to drive env.js through
  // its own fallbacks, a different concern -- but not the second, below.
  {
    files: ["app/**/*.js", "components/**/*.js", "lib/**/*.js", "scripts/**/*.js"],
    ignores: ["lib/config/env.js", "lib/domain/dates.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.name='process'][property.name='env'], " +
            "MemberExpression[object.name='process'][computed=true][property.value='env']",
          message:
            "Only lib/config/env.js may read process.env. Import { env } from lib/config/env.js instead.",
        },
        NO_ISO_SLICE,
      ],
    },
  },
  {
    files: ["tests/**/*.js"],
    rules: {
      "no-restricted-syntax": ["error", NO_ISO_SLICE],
    },
  },
]);

export default eslintConfig;
