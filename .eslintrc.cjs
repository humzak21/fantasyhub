module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'dump/**/*'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.2' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react/prop-types': 'off',
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'react/no-unescaped-entities': 'warn',
    'no-case-declarations': 'warn',
    'no-unreachable': 'warn',
    'react-hooks/exhaustive-deps': 'warn'
  },

  /*
   * Global lint is advisory (~800 pre-existing errors, tracked separately).
   * These two directories are not: they are the shared foundation everything
   * else is built on, they are small, and they are new, so there is no
   * backlog to work off. A hook ordering mistake in a `ui/` primitive — which
   * is exactly what a first pass at the chart wrapper produced — breaks every
   * consumer at once, so `rules-of-hooks` is an error here even though it
   * cannot be one repo-wide yet.
   */
  overrides: [
    {
      files: ['src/components/ui/**/*.jsx', 'src/components/layout/**/*.jsx'],
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'no-unused-vars': 'error',
      },
    },
  ],
}