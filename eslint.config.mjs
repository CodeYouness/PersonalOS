import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

// The layers where the actual logic lives -- none of it is JSX, so none of
// it was ever examined by eslint-config-next's React/a11y-focused rules.
const LOGIC_LAYER = ["lib/**/*.js", "scripts/**/*.js", "tests/**/*.js"];

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
  // restriction that can apply to the same file lives in one block per rule,
  // and blocks are kept file-disjoint where the restrictions genuinely
  // differ (tests/ needs the ADR-0005 one below but not the process.env one).

  // CLAUDE.md: lib/ runs under plain Node, no bundler alias -- scripts and
  // one-off migrations depend on that. docs/architecture.md: nothing outside
  // the data layer imports a storage adapter directly.
  {
    files: ["lib/**/*.js"],
    ignores: ["lib/store.js", "lib/adapters/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/**"],
              message:
                "lib/ must run under plain Node: use a relative import, not the @/ alias.",
            },
            {
              group: ["**/adapters/**"],
              message:
                "Only lib/store.js may import a storage adapter. Add a domain operation to lib/store.js instead.",
            },
          ],
        },
      ],
    },
  },

  // Same adapter rule, for the parts of the app that aren't lib/ itself.
  {
    files: ["app/**/*.js", "components/**/*.js", "scripts/**/*.js"],
    ignores: [
      // Ticket 07 moves this through the store; tracked there, not here.
      "scripts/reset-data.js",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/adapters/**"],
              message:
                "Only lib/store.js may import a storage adapter. Add a domain operation to lib/store.js instead.",
            },
          ],
        },
      ],
    },
  },

  // CLAUDE.md / lib/config/env.js: it is the only module allowed to read
  // process.env. ADR-0005: lib/domain/dates.js is the only place allowed to
  // compute a day key from an instant. Tests are exempt from the first --
  // they set process.env directly to drive env.js through its own
  // fallbacks, a different concern -- but not the second, below.
  {
    files: ["app/**/*.js", "components/**/*.js", "lib/**/*.js", "scripts/**/*.js"],
    ignores: ["lib/config/env.js", "lib/domain/dates.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message:
            "Only lib/config/env.js may read process.env. Import { env } from lib/config/env.js instead.",
        },
        {
          selector:
            "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
          message:
            "Only lib/domain/dates.js may compute a day key from an instant. Call toDayKey() or today() instead (ADR-0005).",
        },
      ],
    },
  },
  {
    files: ["tests/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name='slice'][callee.object.type='CallExpression'][callee.object.callee.property.name='toISOString']",
          message:
            "Only lib/domain/dates.js may compute a day key from an instant. Call toDayKey() or today() instead (ADR-0005).",
        },
      ],
    },
  },
]);

export default eslintConfig;
