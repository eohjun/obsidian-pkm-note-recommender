/**
 * Gemini (Google) Adapter
 *
 * Implements ILLMProvider for Google's Gemini embedding API.
 * Extends BaseProvider for common functionality.
 *
 * Note: Gemini uses API key in URL query parameter, not Authorization header.
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
 * Gemini model configurations
 */
const GEMINI_MODELS = {
  'text-embedding-004': { dimensions: 768, maxTokens: 2048 },
  'embedding-001': { dimensions: 768, maxTokens: 2048 },
} as const;

const DEFAULT_MODEL = 'text-embedding-004';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini API response types
 */
interface GeminiEmbeddingResponse {
  embedding: {
    values: number[];
  };
}

interface GeminiBatchEmbeddingResponse {
  embeddings: Array<{
    values: number[];
  }>;
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  usageMetadata?: {
    totalTokenCount?: number;
  };
}

/**
 * Gemini LLM Provider Adapter
 */
export class GeminiAdapter extends BaseProvider {
  readonly providerType: LLMProviderType = 'gemini';

  constructor(config: LLMProviderConfig) {
    super(config, DEFAULT_BASE_URL, DEFAULT_MODEL);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('AIza'));
  }

  getAvailableModels(): string[] {
    return Object.keys(GEMINI_MODELS);
  }

  async validateApiKey(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await requestUrl({ url, method: 'GET', throw: false });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.makeGeminiRequest<GeminiEmbeddingResponse>(
      `models/${model}:embedContent`,
      {
        content: {
          parts: [{ text: request.text }],
        },
      },
    );

    return {
      embedding: response.embedding.values,
      model,
      tokenCount: this.estimateTokens(request.text),
    };
  }

  async generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const requests = request.texts.map((text) => ({
      model: `models/${model}`,
      content: {
        parts: [{ text }],
      },
    }));

    const response = await this.makeGeminiRequest<GeminiBatchEmbeddingResponse>(
      `models/${model}:batchEmbedContents`,
      { requests },
    );

    return {
      embeddings: response.embeddings.map((e) => e.values),
      model,
      totalTokens: request.texts.reduce((sum, text) => sum + this.estimateTokens(text), 0),
    };
  }

  async generateCompletion(request: TextCompletionRequest): Promise<TextCompletionResponse> {
    const model = 'gemini-1.5-flash';

    const response = await this.makeGeminiRequest<GeminiGenerateResponse>(
      `models/${model}:generateContent`,
      {
        contents: [
          {
            parts: [{ text: request.prompt }],
          },
        ],
        generationConfig: {
          maxOutputTokens: request.maxTokens ?? 200,
          temperature: request.temperature ?? 0.3,
        },
      },
    );

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return {
      text,
      model,
      tokenCount: response.usageMetadata?.totalTokenCount ?? 0,
    };
  }

  /**
   * Make Gemini API request (API key in URL, not header)
   */
  private async makeGeminiRequest<T>(endpoint: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}?key=${this.apiKey}`;

    const operation = async (): Promise<T> => {
      const options: RequestUrlParam = {
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        throw: false,
      };

      const response = await requestUrl(options);

      if (response.status >= 400) {
        const errorData = response.json ?? {};
        const errorMessage = this.extractGeminiError(errorData, response.status);
        throw normalizeError(new Error(errorMessage), response.status);
      }

      return response.json as T;
    };

    return executeWithRetry(operation, {
      ...this.retryOptions,
      onRetry: (attempt, delay, error) => {
        console.warn(`[gemini] Retry attempt ${attempt} after ${delay}ms: ${error.message}`);
      },
    });
  }

  /**
   * Extract error message from Gemini API response
   */
  private extractGeminiError(errorData: unknown, statusCode: number): string {
    if (typeof errorData === 'object' && errorData !== null) {
      const data = errorData as Record<string, unknown>;
      if (typeof data.error === 'object' && data.error !== null) {
        const error = data.error as Record<string, unknown>;
        if (typeof error.message === 'string') {
          return `Gemini API error: ${statusCode} - ${error.message}`;
        }
      }
    }
    return `Gemini API error: ${statusCode}`;
  }
}
