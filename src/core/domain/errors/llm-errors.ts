/**
 * LLM Error Classes
 *
 * Custom error types for better error handling and retry logic.
 */

/**
 * Base class for all LLM-related errors
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/**
 * Rate limit exceeded - should retry with backoff
 */
export class RateLimitError extends LLMError {
  constructor(
    message: string = 'Rate limit exceeded',
    public readonly retryAfterMs?: number,
  ) {
    super(message, 'RATE_LIMIT', true);
    this.name = 'RateLimitError';
  }
}

/**
 * Authentication error - should not retry
 */
export class AuthenticationError extends LLMError {
  constructor(message: string = 'Invalid API key or unauthorized access') {
    super(message, 'AUTH_ERROR', false);
    this.name = 'AuthenticationError';
  }
}

/**
 * Timeout error - should retry
 */
export class TimeoutError extends LLMError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT', true);
    this.name = 'TimeoutError';
  }
}

/**
 * Service unavailable - should retry
 */
export class ServiceUnavailableError extends LLMError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 'SERVICE_UNAVAILABLE', true);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * Invalid request - should not retry
 */
export class InvalidRequestError extends LLMError {
  constructor(message: string = 'Invalid request') {
    super(message, 'INVALID_REQUEST', false);
    this.name = 'InvalidRequestError';
  }
}

/**
 * Normalize raw error into appropriate LLMError subclass
 */
export function normalizeError(error: unknown, statusCode?: number): LLMError {
  if (error instanceof LLMError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Check status code first
  if (statusCode) {
    if (statusCode === 429) {
      // Try to extract retry-after from message
      const retryAfterMatch = message.match(/retry.?after[:\s]+(\d+)/i);
      const retryAfterMs = retryAfterMatch ? parseInt(retryAfterMatch[1], 10) * 1000 : undefined;
      return new RateLimitError(message, retryAfterMs);
    }
    if (statusCode === 401 || statusCode === 403) {
      return new AuthenticationError(message);
    }
    if (statusCode === 503 || statusCode === 502 || statusCode === 504) {
      return new ServiceUnavailableError(message);
    }
    if (statusCode === 400) {
      return new InvalidRequestError(message);
    }
  }

  // Fallback to message-based detection
  if (lowerMessage.includes('rate') || lowerMessage.includes('429') || lowerMessage.includes('too many')) {
    return new RateLimitError(message);
  }
  if (lowerMessage.includes('401') || lowerMessage.includes('403') || lowerMessage.includes('unauthorized') || lowerMessage.includes('invalid api key')) {
    return new AuthenticationError(message);
  }
  if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout') || lowerMessage.includes('timed out')) {
    return new TimeoutError(message);
  }
  if (lowerMessage.includes('503') || lowerMessage.includes('unavailable')) {
    return new ServiceUnavailableError(message);
  }

  return new LLMError(message, 'UNKNOWN', false);
}
