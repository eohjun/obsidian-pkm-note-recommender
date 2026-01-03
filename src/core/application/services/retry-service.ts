/**
 * RetryService - Exponential Backoff Retry Logic
 *
 * Provides retry functionality with exponential backoff for API calls.
 * Handles rate limits and transient failures gracefully.
 */

import { LLMError, RateLimitError } from '../../domain/errors/index.js';

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Jitter factor (0-1) to add randomness */
  jitterFactor: number;
  /** Callback for retry events */
  onRetry?: (attempt: number, delay: number, error: Error) => void;
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterFactor: number,
  retryAfterMs?: number,
): number {
  // If server specified retry-after, use that (with some buffer)
  if (retryAfterMs && retryAfterMs > 0) {
    return Math.min(retryAfterMs + 500, maxDelayMs);
  }

  // Exponential backoff: baseDelay * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * jitterFactor * Math.random();
  const totalDelay = exponentialDelay + jitter;

  // Cap at max delay
  return Math.min(totalDelay, maxDelayMs);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof LLMError) {
    return error.retryable;
  }

  // Fallback for non-LLMError errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('rate') ||
      message.includes('429') ||
      message.includes('503') ||
      message.includes('network') ||
      message.includes('econnreset') ||
      message.includes('etimedout')
    );
  }

  return false;
}

/**
 * Execute an operation with retry logic
 *
 * @param operation - The async operation to execute
 * @param options - Retry configuration options
 * @returns The result of the operation
 * @throws The last error if all retries fail
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry if it's the last attempt or error is not retryable
      if (attempt === opts.maxRetries || !isRetryableError(error)) {
        throw error;
      }

      // Calculate delay
      const retryAfterMs = error instanceof RateLimitError ? error.retryAfterMs : undefined;
      const delay = calculateDelay(
        attempt,
        opts.baseDelayMs,
        opts.maxDelayMs,
        opts.jitterFactor,
        retryAfterMs,
      );

      // Notify about retry
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, delay, lastError);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should not reach here, but throw last error just in case
  throw lastError ?? new Error('Retry failed with unknown error');
}

/**
 * Create a retry wrapper for a class method
 *
 * @param options - Retry configuration options
 * @returns A decorator-like function that wraps methods with retry logic
 */
export function withRetry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: Partial<RetryOptions> = {},
): T {
  return (async (...args: Parameters<T>) => {
    return executeWithRetry(() => fn(...args), options);
  }) as T;
}

/**
 * Batch operations with rate limit awareness
 *
 * Processes items in batches with automatic delay between batches
 * to avoid hitting rate limits.
 */
export interface BatchOptions<T, R> {
  /** Items to process */
  items: T[];
  /** Batch size */
  batchSize: number;
  /** Operation to perform on each item */
  operation: (item: T) => Promise<R>;
  /** Delay between batches in ms */
  batchDelayMs: number;
  /** Retry options for each operation */
  retryOptions?: Partial<RetryOptions>;
  /** Progress callback */
  onProgress?: (completed: number, total: number, item: T) => void;
  /** Error callback (return true to continue, false to stop) */
  onError?: (error: Error, item: T) => boolean;
}

export interface BatchResult<R> {
  successful: R[];
  failed: { item: unknown; error: Error }[];
  total: number;
}

/**
 * Process items in batches with rate limit awareness
 */
export async function processBatch<T, R>(
  options: BatchOptions<T, R>,
): Promise<BatchResult<R>> {
  const {
    items,
    batchSize,
    operation,
    batchDelayMs,
    retryOptions = {},
    onProgress,
    onError,
  } = options;

  const results: BatchResult<R> = {
    successful: [],
    failed: [],
    total: items.length,
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    try {
      const result = await executeWithRetry(() => operation(item), retryOptions);
      results.successful.push(result);

      if (onProgress) {
        onProgress(i + 1, items.length, item);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      results.failed.push({ item, error: err });

      if (onError) {
        const shouldContinue = onError(err, item);
        if (!shouldContinue) {
          break;
        }
      }
    }

    // Add delay between batches (not after last item in batch)
    const isEndOfBatch = (i + 1) % batchSize === 0;
    const isLastItem = i === items.length - 1;

    if (isEndOfBatch && !isLastItem) {
      await sleep(batchDelayMs);
    }
  }

  return results;
}

/**
 * Batch processing options for grouped operations
 */
export interface BatchGroupOptions<T, R> {
  /** Items to process */
  items: T[];
  /** Batch size */
  batchSize: number;
  /** Operation to perform on each batch */
  processFn: (batch: T[]) => Promise<R>;
  /** Delay between batches in ms */
  batchDelayMs?: number;
  /** Retry options for each batch operation */
  retryOptions?: Partial<RetryOptions>;
  /** Progress callback */
  onProgress?: (processed: number, total: number) => void;
  /** Abort signal */
  signal?: AbortSignal;
}

export interface BatchGroupResult<R> {
  results: R[];
  errors: Array<{ batchIndex: number; error: Error }>;
  successCount: number;
  failureCount: number;
  total: number;
}

/**
 * Process items in batches, calling processFn with each batch group
 *
 * Unlike processBatch which processes items individually,
 * this function groups items into batches and processes each batch together.
 */
export async function processBatches<T, R>(
  options: BatchGroupOptions<T, R>,
): Promise<BatchGroupResult<R>> {
  const {
    items,
    batchSize,
    processFn,
    batchDelayMs = 1000,
    retryOptions = {},
    onProgress,
    signal,
  } = options;

  const results: R[] = [];
  const errors: Array<{ batchIndex: number; error: Error }> = [];
  let processed = 0;

  // Split items into batches
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    // Check for cancellation
    if (signal?.aborted) {
      break;
    }

    const batch = batches[batchIndex];

    try {
      const result = await executeWithRetry(() => processFn(batch), retryOptions);
      results.push(result);
      processed += batch.length;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({ batchIndex, error: err });
      processed += batch.length; // Count as processed even if failed
    }

    // Report progress
    if (onProgress) {
      onProgress(processed, items.length);
    }

    // Delay between batches (not after last batch)
    if (batchIndex < batches.length - 1 && batchDelayMs > 0) {
      await sleep(batchDelayMs);
    }
  }

  return {
    results,
    errors,
    successCount: results.length * batchSize, // Approximate
    failureCount: errors.length * batchSize, // Approximate
    total: items.length,
  };
}
