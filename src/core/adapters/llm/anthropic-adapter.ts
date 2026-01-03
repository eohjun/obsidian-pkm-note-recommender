/**
 * Anthropic Adapter
 *
 * Implements ILLMProvider using Voyage AI (Anthropic's recommended embedding solution).
 * Voyage AI provides high-quality embeddings optimized for retrieval tasks.
 * Extends BaseProvider for common functionality.
 *
 * Note: Anthropic doesn't have a native embedding API. Voyage AI is their official
 * partner for embeddings. Users need a Voyage AI API key (starts with 'pa-' or 'voyage-').
 */

import { requestUrl, type RequestUrlParam } from 'obsidian';
import type {
  LLMProviderType,
  LLMProviderConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
  TextCompletionRequest,
  TextCompletionResponse,
} from '../../domain/interfaces/llm-provider.interface.js';
import { BaseProvider } from './base-provider.js';
import { normalizeError } from '../../domain/errors/index.js';
import { executeWithRetry } from '../../application/services/retry-service.js';

/**
 * Voyage AI model configurations
 */
const VOYAGE_MODELS = {
  'voyage-3': { dimensions: 1024, maxTokens: 32000 },
  'voyage-3-lite': { dimensions: 512, maxTokens: 32000 },
  'voyage-code-3': { dimensions: 1024, maxTokens: 32000 },
} as const;

const DEFAULT_MODEL = 'voyage-3-lite';
const DEFAULT_BASE_URL = 'https://api.voyageai.com/v1';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';

/**
 * Voyage AI API response types
 */
interface VoyageEmbeddingData {
  embedding: number[];
  index: number;
}

interface VoyageEmbeddingResponse {
  data: VoyageEmbeddingData[];
  model: string;
  usage?: {
    total_tokens: number;
  };
}

interface ClaudeMessageResponse {
  content?: Array<{
    text?: string;
  }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Anthropic (Voyage AI) LLM Provider Adapter
 */
export class AnthropicAdapter extends BaseProvider {
  readonly providerType: LLMProviderType = 'anthropic';

  constructor(config: LLMProviderConfig) {
    super(config, DEFAULT_BASE_URL, DEFAULT_MODEL);
  }

  isConfigured(): boolean {
    // Voyage AI keys typically start with 'pa-' or contain 'voyage'
    return Boolean(
      this.apiKey && (this.apiKey.startsWith('pa-') || this.apiKey.includes('voyage')),
    );
  }

  getAvailableModels(): string[] {
    return Object.keys(VOYAGE_MODELS);
  }

  async validateApiKey(): Promise<boolean> {
    try {
      // Make a minimal embedding request to validate the key
      await this.makeVoyageRequest('/embeddings', {
        model: this.defaultModel,
        input: 'test',
        input_type: 'document',
      });
      return true;
    } catch {
      return false;
    }
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.makeVoyageRequest<VoyageEmbeddingResponse>('/embeddings', {
      model,
      input: request.text,
      input_type: 'document',
    });

    return {
      embedding: response.data[0].embedding,
      model,
      tokenCount: response.usage?.total_tokens ?? this.estimateTokens(request.text),
    };
  }

  async generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.makeVoyageRequest<VoyageEmbeddingResponse>('/embeddings', {
      model,
      input: request.texts,
      input_type: 'document',
    });

    // Sort by index to ensure correct order
    const sortedData = [...response.data].sort((a, b) => a.index - b.index);

    return {
      embeddings: sortedData.map((d) => d.embedding),
      model,
      totalTokens: response.usage?.total_tokens ?? 0,
    };
  }

  async generateCompletion(request: TextCompletionRequest): Promise<TextCompletionResponse> {
    // For completion, we need to use the Anthropic Claude API
    // This requires an Anthropic API key (starts with 'sk-ant-')
    // Voyage AI keys (pa-*) only work for embeddings

    if (!this.apiKey.startsWith('sk-ant-')) {
      throw new Error(
        'Text completion requires an Anthropic API key (sk-ant-*). ' +
          'Current key is for Voyage AI embeddings only.',
      );
    }

    const model = 'claude-3-haiku-20240307';

    const response = await this.makeClaudeRequest<ClaudeMessageResponse>('/messages', {
      model,
      max_tokens: request.maxTokens ?? 200,
      messages: [
        {
          role: 'user',
          content: request.prompt,
        },
      ],
    });

    const text = response.content?.[0]?.text ?? '';

    return {
      text,
      model,
      tokenCount: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    };
  }

  /**
   * Make Voyage AI API request with retry
   */
  private async makeVoyageRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const operation = async (): Promise<T> => {
      const options: RequestUrlParam = {
        url,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        throw: false,
      };

      const response = await requestUrl(options);

      if (response.status >= 400) {
        const errorData = response.json ?? {};
        const errorMessage = this.extractVoyageError(errorData, response.status);
        throw normalizeError(new Error(errorMessage), response.status);
      }

      return response.json as T;
    };

    return executeWithRetry(operation, {
      ...this.retryOptions,
      onRetry: (attempt, delay, error) => {
        console.warn(`[voyage] Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
      },
    });
  }

  /**
   * Make Claude API request with retry
   */
  private async makeClaudeRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${ANTHROPIC_API_URL}${endpoint}`;

    const operation = async (): Promise<T> => {
      const options: RequestUrlParam = {
        url,
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        throw: false,
      };

      const response = await requestUrl(options);

      if (response.status >= 400) {
        const errorData = response.json ?? {};
        const errorMessage = this.extractClaudeError(errorData, response.status);
        throw normalizeError(new Error(errorMessage), response.status);
      }

      return response.json as T;
    };

    return executeWithRetry(operation, {
      ...this.retryOptions,
      onRetry: (attempt, delay, error) => {
        console.warn(`[claude] Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
      },
    });
  }

  /**
   * Extract error message from Voyage AI API response
   */
  private extractVoyageError(errorData: unknown, statusCode: number): string {
    if (typeof errorData === 'object' && errorData !== null) {
      const data = errorData as Record<string, unknown>;
      if (typeof data.detail === 'string') {
        return `Voyage AI error: ${statusCode} - ${data.detail}`;
      }
      if (typeof data.error === 'string') {
        return `Voyage AI error: ${statusCode} - ${data.error}`;
      }
    }
    return `Voyage AI error: ${statusCode}`;
  }

  /**
   * Extract error message from Claude API response
   */
  private extractClaudeError(errorData: unknown, statusCode: number): string {
    if (typeof errorData === 'object' && errorData !== null) {
      const data = errorData as Record<string, unknown>;
      if (typeof data.error === 'object' && data.error !== null) {
        const error = data.error as Record<string, unknown>;
        if (typeof error.message === 'string') {
          return `Anthropic API error: ${statusCode} - ${error.message}`;
        }
      }
    }
    return `Anthropic API error: ${statusCode}`;
  }
}
