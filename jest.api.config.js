module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/api-tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/api-tests/support/jest.setup.js'],
  maxWorkers: 1,
  verbose: true,
  testTimeout: 30000,
};