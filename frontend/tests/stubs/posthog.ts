// Jest stand-in for src/lib/posthog.ts (see frontend/jest.config.cjs). The real
// module reads import.meta.env, which Vite provides and CommonJS jest cannot
// run. Disabled, as in local dev without PostHog keys: analytics calls no-op.
const posthog = {
  capture: () => undefined,
  register: () => undefined,
  identify: () => undefined,
  reset: () => undefined,
  get_property: () => undefined,
};

export const posthogEnabled = false;
export default posthog;
