import posthog, { posthogEnabled } from './posthog';

/**
 * Every custom PostHog event the site sends, with its properties.
 *
 * Autocapture already records raw clicks, but it can't say *what* was acted
 * on (which product, which search term, what the country set became), and it
 * misses hovers and silent no-ops entirely. These events fill those gaps.
 * Keeping them in one typed map stops event names drifting between files.
 */
export interface AnalyticsEvents {
  // Home: comparison controls
  product_searched: {
    query: string;
    results_shown: number;
    total_matches: number;
    selected_countries: string[];
  };
  country_toggled: {
    country: string;
    action: 'added' | 'removed';
    selected_count: number;
    selected_countries: string[];
  };
  /** The user tried to drop below the two-country minimum and nothing happened. */
  country_toggle_blocked: {
    country: string;
    selected_countries: string[];
  };
  all_countries_selected: {
    previous_count: number;
    selected_count: number;
  };
  all_countries_filter_toggled: {
    enabled: boolean;
    selected_countries: string[];
  };
  comparison_refreshed: {
    search_active: boolean;
  };
  stale_data_notice_shown: {
    days_stale: number;
  };

  // Home: comparison table
  price_history_opened: {
    canonical_id: number;
    product_name: string;
    category: string | null;
    row_position: number;
    countries_with_price: string[];
    cheapest_country: string | null;
  };
  price_history_range_changed: {
    canonical_id: number;
    product_name: string;
    days: number;
  };
  /** Hover card on a price cell stayed open long enough to be read. */
  price_details_viewed: {
    product_name: string;
    country: string;
    supermarket: string;
    product_count: number;
    is_cheapest: boolean;
  };

  // Outbound + global
  store_link_clicked: {
    source: 'comparison_hover_card' | 'country_page';
    country: string;
    supermarket: string;
    product_name: string;
  };
  language_changed: {
    from: string;
    to: string;
  };
  country_request_submitted: Record<string, never>;
}

// Analytics must never break the page: every call is skipped when PostHog
// isn't configured and swallows its own errors.
function safely(fn: () => void) {
  if (!posthogEnabled) return;
  try {
    fn();
  } catch {
    // ignore
  }
}

export function track<E extends keyof AnalyticsEvents>(event: E, properties: AnalyticsEvents[E]) {
  safely(() => posthog.capture(event, properties));
}

/** Properties attached to every later event from this browser. */
export function registerSuperProperties(properties: Record<string, unknown>) {
  safely(() => posthog.register(properties));
}

export function identifyUser(id: string, properties: Record<string, unknown>) {
  safely(() => posthog.identify(id, properties));
}

export function resetUser() {
  safely(() => posthog.reset());
}
