module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { node: true },
  overrides: [
    {
      files: ['src/**/*.test.ts'],
      env: { jest: true },
    },
  ],
};
