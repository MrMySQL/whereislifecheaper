module.exports = {
  rootDir: '..',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/frontend/tests/**/*.test.ts'],
  // src/lib/posthog.ts reads import.meta.env (Vite-only syntax CommonJS jest
  // cannot run); anything that reaches it, e.g. through i18n -> analytics,
  // gets a disabled stub instead.
  moduleNameMapper: { '^(\\./|.*/lib/)posthog$': '<rootDir>/frontend/tests/stubs/posthog.ts' },
  // Transpiled, not type-checked (`isolatedModules: true`): this tsconfig only
  // approximates the real one (CommonJS, no Vite types), so type-checking
  // against it flags correct code such as `import.meta.env`. CI type-checks
  // the frontend with `tsc -b` against frontend/tsconfig.app.json instead.
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { target: 'ES2022', lib: ['ES2022', 'DOM'], jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true, strict: true, isolatedModules: true } }] },
};
