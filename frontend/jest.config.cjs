// Frontend tests are transpiled, not type-checked (`isolatedModules: true`):
// the tsconfig below only approximates the real one (CommonJS, no Vite types),
// so type-checking against it flags correct code such as `import.meta.env`,
// and which files it checks depends on the install layout. CI type-checks the
// frontend with `tsc -b` against frontend/tsconfig.app.json instead.
module.exports = {
  rootDir: '..',
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/frontend/tests/**/*.test.ts'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { target: 'ES2022', lib: ['ES2022', 'DOM'], jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true, strict: true, isolatedModules: true } }] },
};
