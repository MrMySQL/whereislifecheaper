/**
 * Retry logic utilities for handling transient failures
 */

import { logger } from './logger';

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  exponential: boolean;
  onRetry?: (attempt: number, error: Error) => void;
}

const defaultOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  exponential: true,
};

/**
 * Retry a function with exponential backoff
 * @param fn - Async function to retry
 * @param options - Retry options
 * @returns Result of the function
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt > opts.maxRetries) {
        logger.error(`Failed after ${opts.maxRetries} retries:`, error);
        throw lastError;
      }

      const delay = opts.exponential
        ? Math.min(opts.initialDelay * Math.pow(2, attempt - 1), opts.maxDelay)
        : opts.initialDelay;

      logger.warn(
        `Attempt ${attempt}/${opts.maxRetries} failed. Retrying in ${delay}ms...`,
        { error: error instanceof Error ? error.message : String(error) }
      );

      if (opts.onRetry) {
        opts.onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep for a given number of milliseconds
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry with specific error types
 * Only retry if error matches specified types
 * @param fn - Async function to retry
 * @param retryableErrors - Error types that should trigger retry
 * @param options - Retry options
 */
export async function retryOnError<T>(
  fn: () => Promise<T>,
  retryableErrors: Array<new (...args: any[]) => Error>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable = retryableErrors.some(
        (ErrorType) => error instanceof ErrorType
      );

      if (!isRetryable) {
        logger.error('Non-retryable error:', error);
        throw error;
      }

      if (attempt > opts.maxRetries) {
        logger.error(`Failed after ${opts.maxRetries} retries:`, error);
        throw lastError;
      }

      const delay = opts.exponential
        ? Math.min(opts.initialDelay * Math.pow(2, attempt - 1), opts.maxDelay)
        : opts.initialDelay;

      logger.warn(
        `Attempt ${attempt}/${opts.maxRetries} failed with retryable error. Retrying in ${delay}ms...`
      );

      if (opts.onRetry) {
        opts.onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Batch retry - retry a batch of operations independently
 * @param operations - Array of async operations
 * @param options - Retry options
 * @returns Results and errors
 */
export async function retryBatch<T>(
  operations: Array<() => Promise<T>>,
  options: Partial<RetryOptions> = {}
): Promise<{ results: T[]; errors: Error[] }> {
  const results: T[] = [];
  const errors: Error[] = [];

  await Promise.all(
    operations.map(async (op, index) => {
      try {
        const result = await retry(op, options);
        results[index] = result;
      } catch (error) {
        errors[index] = error as Error;
      }
    })
  );

  return { results, errors };
}
