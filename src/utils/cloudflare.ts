import type { Page } from 'playwright';
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
 * Navigate a browser page to `url` and make sure what loaded is the site, not
 * a Cloudflare page. Returns a short description of how it went, for logging.
 *
 * The body is inspected regardless of status: Cloudflare normally serves
 * its pages with 403/503, but the markup is the reliable signal, and goto()
 * can return no response object at all. A managed challenge ("Just a
 * moment...") is something a real browser solves on its own a few seconds
 * after domcontentloaded, so that one is given time to clear; a 1020 block
 * never clears and fails at once.
 */
export async function openPastCloudflare(
  page: Page,
  url: string,
  timeoutMs: number
): Promise<string> {
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const status = response?.status() ?? 0;

  // Reading the body can throw "Execution context was destroyed" when the
  // challenge's auto-solve navigates away mid-read, on the first snapshot as
  // much as on any later poll. Treat that as "still settling" and read again.
  const snapshot = async (): Promise<CloudflarePage | null | 'navigating'> => {
    try {
      return classifyCloudflarePage(await page.content());
    } catch {
      return 'navigating';
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
    throw new Error(`Blocked by Cloudflare when opening ${url}: HTTP ${status}, ${state.description}`);
  }
  if (sawChallenge) {
    // The status belongs to the interstitial (usually 403/503), not to the
    // page the browser navigated to after solving it.
    return `challenge cleared, first load was HTTP ${status}`;
  }
  if (status >= 400) {
    throw new Error(`HTTP ${status} when opening ${url}`);
  }
  return `HTTP ${status}`;
}
