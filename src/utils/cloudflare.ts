import type { Page, Response } from 'playwright';
import { sleep } from './retry';

/**
 * Recognise Cloudflare's own HTML (served instead of the origin's JSON) and
 * say which kind it is. Returns null for anything that is not a Cloudflare page.
 *
 * Two distinct things can come back:
 *  - the 1020 "Sorry, you have been blocked" page — a firewall rule matched
 *    (IP, ASN, country, or request signature); no amount of JS solving helps.
 *  - the "Just a moment..." interstitial — a managed challenge that a real
 *    browser can pass.
 * Telling them apart in the log is what stops the next person from reading
 * "<!DOCTYPE html>" as a parse error again (Daily Scrape 2026-09-04).
 */
export type CloudflarePageKind = 'block' | 'challenge' | 'error';

export interface CloudflarePage {
  kind: CloudflarePageKind;
  description: string;
}

export function classifyCloudflarePage(body: string): CloudflarePage | null {
  const head = body.substring(0, 20000);
  const rayId =
    head.match(/Cloudflare Ray ID:\s*<strong[^>]*>([0-9a-f]+)/i)?.[1] ??
    head.match(/[?&]ray=([0-9a-f]+)/i)?.[1];
  const ray = rayId ? ` (Ray ID ${rayId})` : '';

  if (/data-translate="block_headline"|Sorry, you have been blocked/i.test(head)) {
    return {
      kind: 'block',
      description: `Cloudflare block page "Sorry, you have been blocked" (error 1020)${ray}`,
    };
  }
  if (/cdn-cgi\/challenge-platform|Just a moment|cf-chl|challenge-running/i.test(head)) {
    return { kind: 'challenge', description: `Cloudflare challenge page "Just a moment..."${ray}` };
  }
  if (/Attention Required! \| Cloudflare|cf-error-details|id="cf-wrapper"/i.test(head)) {
    return { kind: 'error', description: `Cloudflare error page${ray}` };
  }
  return null;
}

export function describeCloudflarePage(body: string): string | null {
  return classifyCloudflarePage(body)?.description ?? null;
}

/** How often to re-read the page while a Cloudflare challenge is auto-solving. */
const CHALLENGE_POLL_MS = 500;

/**
 * A 1020 "Sorry, you have been blocked" page: a firewall rule matched, so
 * opening the page again a few seconds later cannot succeed. Callers that
 * retry openPastCloudflare should pass isRetryableOpenError to stop at once.
 */
export class CloudflareBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudflareBlockError';
  }
}

/** shouldRetry predicate for openPastCloudflare: everything but a 1020 block. */
export function isRetryableOpenError(error: Error): boolean {
  return !(error instanceof CloudflareBlockError);
}

/**
 * Errors page.content() throws while the page is between documents (a
 * challenge's auto-solve navigating away mid-read). Anything else, such as
 * a closed page or a crashed browser, is real and must surface as itself.
 */
const NAVIGATION_IN_PROGRESS =
  /Execution context was destroyed|page is navigating and changing the content|Cannot find context with specified id/i;

/**
 * Navigate a browser page to `url` and make sure what loaded is the site, not
 * a Cloudflare page. Returns a short description of how it went, for logging.
 *
 * The body is inspected regardless of status: Cloudflare normally serves
 * its pages with 403/503, but the markup is the reliable signal, and goto()
 * can return no response object at all. A managed challenge ("Just a
 * moment...") is something a real browser solves on its own a few seconds
 * after domcontentloaded, so that one is given time to clear; a 1020 block
 * never clears and fails at once with a CloudflareBlockError.
 *
 * The status that decides success is the one of the document the page ends
 * up on: after a challenge clears, the browser navigates to the origin's page,
 * and an origin 404/500 there must fail just like one on the first load.
 */
export async function openPastCloudflare(
  page: Page,
  url: string,
  timeoutMs: number
): Promise<string> {
  // Main-frame document responses that arrive after goto() has returned, i.e.
  // the navigations a challenge's auto-solve makes. The last one is the
  // document the page settles on.
  let gotoReturned = false;
  let settledStatus: number | undefined;
  const onResponse = (response: Response) => {
    if (
      gotoReturned &&
      response.request().isNavigationRequest() &&
      response.frame() === page.mainFrame()
    ) {
      settledStatus = response.status();
    }
  };
  page.on('response', onResponse);

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    gotoReturned = true;
    const status = response?.status() ?? 0;

    // Reading the body can throw "Execution context was destroyed" when the
    // challenge's auto-solve navigates away mid-read, on the first snapshot as
    // much as on any later poll. Treat that as "still settling" and read again.
    const snapshot = async (): Promise<CloudflarePage | null | 'navigating'> => {
      try {
        return classifyCloudflarePage(await page.content());
      } catch (error) {
        if (error instanceof Error && NAVIGATION_IN_PROGRESS.test(error.message)) {
          return 'navigating';
        }
        throw error;
      }
    };

    const settleDeadline = Date.now() + timeoutMs;
    let state = await snapshot();
    // Only an interstitial actually seen counts as a challenge. A torn-down
    // read alone is not evidence of one: if the page then settles on an
    // ordinary origin error, its status must still be reported below.
    let sawChallenge = false;
    while ((state === 'navigating' || state?.kind === 'challenge') && Date.now() < settleDeadline) {
      if (state !== 'navigating') sawChallenge = true;
      await sleep(CHALLENGE_POLL_MS);
      state = await snapshot();
    }
    if (state === 'navigating') {
      throw new Error(`Page never became readable within ${timeoutMs}ms of opening ${url}`);
    }
    if (state) {
      const message = `Blocked by Cloudflare when opening ${url}: HTTP ${status}, ${state.description}`;
      throw state.kind === 'block' ? new CloudflareBlockError(message) : new Error(message);
    }
    if (settledStatus !== undefined && settledStatus >= 400) {
      throw new Error(
        `HTTP ${settledStatus} when opening ${url}` +
          (sawChallenge ? ` (after clearing a Cloudflare challenge; first load was HTTP ${status})` : '')
      );
    }
    if (sawChallenge) {
      // `status` belongs to the interstitial (usually 403/503), not to the
      // page the browser navigated to after solving it.
      return settledStatus !== undefined
        ? `challenge cleared, HTTP ${settledStatus} (first load was HTTP ${status})`
        : `challenge cleared, first load was HTTP ${status}`;
    }
    const finalStatus = settledStatus ?? status;
    if (finalStatus >= 400) {
      throw new Error(`HTTP ${finalStatus} when opening ${url}`);
    }
    return `HTTP ${finalStatus}`;
  } finally {
    page.off('response', onResponse);
  }
}
