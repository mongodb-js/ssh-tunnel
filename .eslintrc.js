module.exports = {
  extends: 'eslint:recommended',
  env: 'node',
  overrides: [
    {
      files: ['src/**/*.test.ts'],
      env: 'jest',
    },
  ],
};
