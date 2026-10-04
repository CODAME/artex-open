import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist',
    'dist-runtime',
    'artex-ai',
    'artex-ai-mock',
    '.next',
    'node_modules',
    'apps/*/dist',
    'apps/kiosk/dist',
    'packages/*/dist',
    // Test harness + tooling config outside any tsconfig `include`. The
    // type-aware parser (projectService) can only emit "not found by the
    // project service" parse errors for these, never useful lint output — and
    // parse errors cannot be captured by the bulk-suppressions ledger
    // (eslint-suppressions.json), so they would permanently red the gate.
    // Not shipped code; safe to exclude from linting. See docs/lint-baseline.md.
    'packages/artex-runtime-web/test-pixel-fidelity',
    'packages/artex-runtime-web/vitest.config.ts',
    // Same class, found when the Electron apps and the runtime joined the lint
    // targets (#4701): tooling outside every tsconfig `include`, so the
    // project service can only report them as unparseable.
    'apps/display/scripts/*.test.ts',
    'apps/runtime/vitest.config.ts',
  ]),
  {
    // Node ESM services (platform-api, rules-tests, story-api, feedback-triage).
    // The TS block below only matches **/*.{ts,tsx}, so these .mjs files had no
    // config at all and `no-undef` never ran — which let a call to an undefined
    // function (`verifyFirebaseAuthToken`) ship a permanently-broken endpoint.
    // See #1834. `no-undef` catches that class of bug; Node globals are declared
    // so legitimate runtime globals (process, Buffer, URL, fetch, …) don't flag.
    files: ['.services/**/*.mjs', 'functions/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      // `stylisticTypeChecked` was dropped 2026-08-18 (Bruno's call). It spends
      // type information on taste rather than on defects — prefer-nullish-
      // coalescing, prefer-optional-chain, dot-notation, non-nullable-type-
      // assertion-style and friends — and the ledger showed it accounted for a
      // small minority of suppressed violations while every rule that maps to a
      // named failure mode in AGENTS.md lives in `strictTypeChecked`, which
      // stays: no-floating-promises and no-misused-promises are "the stuck
      // spinner", no-unnecessary-condition catches dead branches tsc accepts.
      //
      // Removing it does NOT save the type-checking cost (strictTypeChecked
      // already requires `projectService`, and that is where the minutes go);
      // it removes rule-evaluation work and, mainly, review noise. The speed
      // win in this change is `--concurrency` in scripts/lint_gate.mjs.
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        // typescript-eslint v8 project service auto-discovers the nearest
        // tsconfig.json per file, replacing the old hand-curated `project: [...]`
        // list. This eliminates "file was not found in any of the provided
        // project(s)" parse errors when packages or test/electron entrypoints
        // are added without remembering to update the lint config.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // strict-type-checked turns this off by default; we want plain numbers
      // (ids, counters, durations) in template literals without wrapping.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true, allowNullish: false, allowRegExp: true },
      ],
      // Async stubs and interface-conforming Promise wrappers are common across
      // contexts, mocks, and Firebase-style wrappers. The rule is noisy
      // without catching real bugs in this codebase.
      '@typescript-eslint/require-await': 'off',
      // Honour the _-prefix convention for intentionally unused variables
      // (interface stubs, destructuring remainders, ignored callback args).
      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'all',
        argsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // React Compiler strict rules (react-hooks v7). These fire on patterns
      // that are legitimate in pre-Compiler React (live refs, loading setState,
      // imperative DOM mutations). Downgraded to warn until the React Compiler
      // is adopted and the codebase is migrated to its constraints.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
    },
  },
])
