import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/*
 * Flat config. ESLint 9 no longer reads .eslintrc.cjs, and `--ext` is gone
 * from the CLI — the `files` key below is what makes .jsx get linted, so
 * dropping it silently narrows the run to .js and reports a clean-looking
 * fraction of the repo.
 *
 * ESLint stays at 9 rather than 10 on purpose: eslint-plugin-react 7.37.5,
 * the current release, peers on `^3 || ... || ^9.7`. There is no version of
 * it that takes ESLint 10 yet, so 10 would mean dropping the react rules.
 */
export default [
  { ignores: ['dist/**', 'dump/**', 'coverage/**', 'playwright-report/**', 'test-results/**'] },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: '18.2' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      /*
       * eslint-plugin-react-hooks 7's `recommended` turns on sixteen rules:
       * the two classic ones and fourteen React Compiler rules (purity,
       * immutability, set-state-in-effect, static-components, ...). Adopting
       * those is a judgement about how this code should be written, not part
       * of moving off .eslintrc, and it would bury the existing backlog under
       * a much larger new one. The two below are what
       * `plugin:react-hooks/recommended` meant at v4. The rest are available
       * whenever someone wants to take them on deliberately.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/prop-types': 'off',
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'react/no-unescaped-entities': 'warn',
      'no-case-declarations': 'warn',
      'no-unreachable': 'warn',
    },
  },

  /*
   * Global lint is advisory (a few hundred pre-existing findings, tracked
   * separately). These two directories are not: they are the shared
   * foundation everything else is built on, they are small, and they are new,
   * so there is no backlog to work off. A hook ordering mistake in a `ui/`
   * primitive — which is exactly what a first pass at the chart wrapper
   * produced — breaks every consumer at once, so `rules-of-hooks` is an error
   * here even though it cannot be one repo-wide yet.
   */
  {
    files: ['src/components/ui/**/*.jsx', 'src/components/layout/**/*.jsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-unused-vars': 'error',
    },
  },
]
