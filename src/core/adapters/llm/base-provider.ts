/**
 * BaseProvider - Abstract base class for LLM providers
 *
 * Provides common functionality for all LLM adapters:
 * - HTTP request handling with Obsidian's requestUrl
 * - Error normalization
 * - Token estimation
 * - Retry integration
 */

import { requestUrl, type RequestUrlParam } from 'obsidian';
import type {
  ILLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
  TextCompletionRequest,
  TextCompletionResponse,
} from '../../domain/interfaces/llm-provider.interface.js';
import {
  normalizeError,
  RateLimitError,
  AuthenticationError,
  type LLMError,
} from '../../domain/errors/index.js';
import { executeWithRetry, type RetryOptions } from '../../application/services/retry-service.js';

/**
 * Default retry options for LLM API calls
 */
export const LLM_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
};

/**
 * Response from API call
 */
export interface ApiResponse<T> {
  data: T;
  statusCode: number;
}

/**
 * Abstract base class for LLM providers
 */
export abstract class BaseProvider implements ILLMProvider {
  abstract readonly providerType: LLMProviderType;

  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly defaultModel: string;
  protected readonly retryOptions: Partial<RetryOptions>;

  constructor(config: LLMProviderConfig, defaultBaseUrl: string, defaultModelName: string) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? defaultBaseUrl;
    this.defaultModel = config.defaultModel ?? defaultModelName;
    this.retryOptions = LLM_RETRY_OPTIONS;
  }

  /**
   * Check if provider is properly configured
   */
  abstract isConfigured(): boolean;

  /**
   * Get available models for this provider
   */
  abstract getAvailableModels(): string[];

  /**
   * Get the default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Validate API key by making a test request
   */
  abstract validateApiKey(): Promise<boolean>;

  /**
   * Generate embedding for single text
   */
  abstract generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Generate embeddings for multiple texts
   */
  abstract generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse>;

  /**
   * Generate text completion
   */
  abstract generateCompletion(request: TextCompletionRequest): Promise<TextCompletionResponse>;

  /**
   * Make HTTP request with automatic retry on transient failures
   */
  protected async makeRequest<T>(
    endpoint: string,
    body: unknown,
    method: 'GET' | 'POST' = 'POST',
    additionalHeaders: Record<string, string> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const operation = async (): Promise<T> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...this.getAuthHeaders(),
        ...additionalHeaders,
      };

      const options: RequestUrlParam = {
        url,
        method,
        headers,
        throw: false, // Handle errors manually for better control
      };

      if (body && method === 'POST') {
        options.body = JSON.stringify(body);
      }

      const response = await requestUrl(options);

      // Check for errors
      if (response.status >= 400) {
        const errorData = response.json ?? {};
        const errorMessage = this.extractErrorMessage(errorData, response.status);
        throw normalizeError(new Error(errorMessage), response.status);
      }

      return response.json as T;
    };

    return executeWithRetry(operation, {
      ...this.retryOptions,
      onRetry: (attempt, delay, error) => {
        console.warn(
          `[${this.providerType}] Retry attempt ${attempt} after ${delay}ms: ${error.message}`,
        );
      },
    });
  }

  /**
   * Make request without retry (for validation/test calls)
   */
  protected async makeRequestNoRetry<T>(
    endpoint: string,
    body: unknown,
    method: 'GET' | 'POST' = 'POST',
    additionalHeaders: Record<string, string> = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeaders(),
      ...additionalHeaders,
    };

    const options: RequestUrlParam = {
      url,
      method,
      headers,
      throw: false,
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await requestUrl(options);

    if (response.status >= 400) {
      const errorData = response.json ?? {};
      const errorMessage = this.extractErrorMessage(errorData, response.status);
      throw normalizeError(new Error(errorMessage), response.status);
    }

    return response.json as T;
  }

  /**
   * Get authentication headers for the provider
   * Override in subclasses for different auth methods
   */
  protected getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }

  /**
   * Extract error message from API response
   * Override in subclasses for provider-specific error formats
   */
  protected extractErrorMessage(errorData: unknown, statusCode: number): string {
    if (typeof errorData === 'object' && errorData !== null) {
      const data = errorData as Record<string, unknown>;

      // Common error formats
      if (typeof data.error === 'string') {
        return data.error;
      }
      if (typeof data.error === 'object' && data.error !== null) {
        const errorObj = data.error as Record<string, unknown>;
        if (typeof errorObj.message === 'string') {
          return errorObj.message;
        }
      }
      if (typeof data.message === 'string') {
        return data.message;
      }
    }

    return `API error: ${statusCode}`;
  }

  /**
   * Estimate token count for text
   * Rough estimation: ~4 chars per token for English, ~2 chars for CJK
   */
  protected estimateTokens(text: string): number {
    // Count CJK characters (Korean, Chinese, Japanese)
    const cjkChars = (text.match(/[\u3000-\u9fff\uac00-\ud7af]/g) || []).length;
    const otherChars = text.length - cjkChars;

    // CJK: ~2 chars per token, Other: ~4 chars per token
    return Math.ceil(cjkChars / 2 + otherChars / 4);
  }

  /**
   * Handle and normalize errors
   */
  protected handleError(error: unknown): LLMError {
    return normalizeError(error);
  }
}
