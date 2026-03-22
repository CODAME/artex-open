import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'artex-ai', 'artex-ai-mock', 'codame-api', 'match', '.next', 'node_modules']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        project: [
          './apps/creator/tsconfig.node.json',
          './apps/creator/tsconfig.app.json',
          './packages/artex-contract/tsconfig.json',
          './packages/artex-core/tsconfig.json',
          './packages/artex-shaders/tsconfig.json',
          './packages/artex-extensions/tsconfig.json',
          './packages/artex-experiments/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
