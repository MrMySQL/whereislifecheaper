import posthog from 'posthog-js';

const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

/** False when the env vars are missing (e.g. local dev); calls must then no-op. */
export const posthogEnabled = Boolean(posthogKey && posthogHost);

if (posthogEnabled) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    autocapture: true,
    capture_pageview: false, // We handle this manually for SPA
    capture_pageleave: true,
  });
}

export default posthog;
