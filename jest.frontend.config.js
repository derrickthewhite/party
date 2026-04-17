module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/e2e/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/e2e/support/jest.setup.js'],
  maxWorkers: 1,
  verbose: true,
  testTimeout: 60000,
};