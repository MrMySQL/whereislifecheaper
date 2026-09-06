module.exports = {
  rootDir: '..',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/frontend/tests/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { target: 'ES2022', lib: ['ES2022', 'DOM'], jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true, strict: true } }] },
};
