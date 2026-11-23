jest.mock('../logger', () => {
  const stub = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { logger: stub, scraperLogger: stub, createPrefixedLogger: () => stub };
});
jest.mock('../retry', () => ({
  ...jest.requireActual('../retry'),
  sleep: jest.fn().mockResolvedValue(undefined),
}));

import type { Page } from 'playwright';
import { CloudflareBlockError, isRetryableOpenError, openPastCloudflare } from '../cloudflare';
import { retry } from '../retry';

const URL_ = 'https://shop.example.com/';
const CHALLENGE = '<html><head><title>Just a moment...</title></head></html>';
const BLOCK = '<html><body><h1 data-translate="block_headline">Sorry, you have been blocked</h1></body></html>';
const SITE = '<html><head><title>Shop</title></head></html>';

type Step = string | Error | { navigate: number; then: string };

/**
 * A page whose goto() answers with `gotoStatus` and whose successive content()
 * reads follow `steps`. A `navigate` step first emits a main-frame document
 * response, as a challenge's auto-solve does when it reloads the page.
 */
function fakePage(gotoStatus: number, steps: Step[]) {
  const handlers: Array<(r: unknown) => void> = [];
  const mainFrame = {};
  const queue = [...steps];
  const page = {
    on: jest.fn((_event: string, h: (r: unknown) => void) => handlers.push(h)),
    off: jest.fn(),
    mainFrame: () => mainFrame,
    goto: jest.fn().mockResolvedValue({ status: () => gotoStatus }),
    content: jest.fn(async () => {
      const step = queue.length > 1 ? queue.shift()! : queue[0];
      if (step instanceof Error) throw step;
      if (typeof step === 'string') return step;
      for (const h of handlers) {
        h({ status: () => step.navigate, frame: () => mainFrame, request: () => ({ isNavigationRequest: () => true }) });
      }
      return step.then;
    }),
  };
  return page as unknown as Page & { content: jest.Mock; off: jest.Mock };
}

describe('openPastCloudflare', () => {
  it('reports a cleared challenge with the status of the document it lands on', async () => {
    const page = fakePage(403, [CHALLENGE, { navigate: 200, then: SITE }]);
    await expect(openPastCloudflare(page, URL_, 1000)).resolves.toBe('challenge cleared, HTTP 200 (first load was HTTP 403)');
    expect(page.off).toHaveBeenCalledWith('response', expect.any(Function));
  });

  it('fails when the page reached after clearing a challenge is an origin error', async () => {
    const page = fakePage(403, [CHALLENGE, { navigate: 500, then: '<html><title>Server Error</title></html>' }]);
    await expect(openPastCloudflare(page, URL_, 1000)).rejects.toThrow(
      /HTTP 500 when opening .*after clearing a Cloudflare challenge; first load was HTTP 403/
    );
  });

  it('keeps reading through a navigation in progress', async () => {
    const page = fakePage(403, [
      CHALLENGE,
      new Error('page.content: Execution context was destroyed, most likely because of a navigation'),
      new Error('page.content: Unable to retrieve content because the page is navigating and changing the content.'),
      SITE,
    ]);
    await expect(openPastCloudflare(page, URL_, 1000)).resolves.toMatch(/challenge cleared/);
  });

  it('surfaces a closed page at once instead of waiting out the timeout', async () => {
    const closed = new Error('page.content: Target page, context or browser has been closed');
    const page = fakePage(200, [closed]);
    await expect(openPastCloudflare(page, URL_, 60000)).rejects.toBe(closed);
    expect(page.content).toHaveBeenCalledTimes(1);
  });

  it('throws a non-retryable CloudflareBlockError for a 1020 block', async () => {
    const page = fakePage(403, [BLOCK]);
    const error = await openPastCloudflare(page, URL_, 1000).catch((e: Error) => e);
    expect(error).toBeInstanceOf(CloudflareBlockError);
    expect(isRetryableOpenError(error as Error)).toBe(false);
    expect(isRetryableOpenError(new Error('page.goto: net::ERR_CONNECTION_RESET'))).toBe(true);
  });
});

describe('retry with shouldRetry', () => {
  it('rethrows an error the predicate rejects without another attempt', async () => {
    const fn = jest.fn().mockRejectedValue(new CloudflareBlockError('blocked'));
    await expect(retry(fn, { maxRetries: 3, initialDelay: 1, shouldRetry: isRetryableOpenError })).rejects.toThrow('blocked');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('still retries errors the predicate accepts', async () => {
    const fn = jest.fn().mockRejectedValueOnce(new Error('reset')).mockResolvedValue('ok');
    await expect(retry(fn, { maxRetries: 3, initialDelay: 1, shouldRetry: isRetryableOpenError })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
