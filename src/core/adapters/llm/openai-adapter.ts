/**
 * OpenAI Adapter
 *
 * Implements ILLMProvider for OpenAI's embedding and completion APIs.
 * Extends BaseProvider for common functionality.
 */

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

/**
 * OpenAI model configurations
 */
const OPENAI_MODELS = {
  'text-embedding-3-small': { dimensions: 1536, maxTokens: 8191 },
  'text-embedding-3-large': { dimensions: 3072, maxTokens: 8191 },
  'text-embedding-ada-002': { dimensions: 1536, maxTokens: 8191 },
} as const;

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI API response types
 */
interface OpenAIEmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  model: string;
  usage?: {
    total_tokens: number;
  };
}

/**
 * OpenAI LLM Provider Adapter
 */
export class OpenAIAdapter extends BaseProvider {
  readonly providerType: LLMProviderType = 'openai';

  constructor(config: LLMProviderConfig) {
    super(config, DEFAULT_BASE_URL, DEFAULT_MODEL);
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('sk-'));
  }

  getAvailableModels(): string[] {
    return Object.keys(OPENAI_MODELS);
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.makeRequestNoRetry('/models', null, 'GET');
      return true;
    } catch {
      return false;
    }
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.makeRequest<OpenAIEmbeddingResponse>('/embeddings', {
      model,
      input: request.text,
    });

    return {
      embedding: response.data[0].embedding,
      model,
      tokenCount: response.usage?.total_tokens ?? this.estimateTokens(request.text),
    };
  }

  async generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.makeRequest<OpenAIEmbeddingResponse>('/embeddings', {
      model,
      input: request.texts,
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
    const model = 'gpt-4o-mini';

    const response = await this.makeRequest<OpenAIChatResponse>('/chat/completions', {
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that analyzes note connections in a PKM system. Always respond in JSON format when requested.',
        },
        { role: 'user', content: request.prompt },
      ],
      max_tokens: request.maxTokens ?? 200,
      temperature: request.temperature ?? 0.3,
    });

    return {
      text: response.choices[0]?.message?.content ?? '',
      model,
      tokenCount: response.usage?.total_tokens ?? 0,
    };
  }

  protected extractErrorMessage(errorData: unknown, statusCode: number): string {
    if (typeof errorData === 'object' && errorData !== null) {
      const data = errorData as Record<string, unknown>;
      if (typeof data.error === 'object' && data.error !== null) {
        const error = data.error as Record<string, unknown>;
        if (typeof error.message === 'string') {
          return `OpenAI API error: ${statusCode} - ${error.message}`;
        }
      }
    }
    return `OpenAI API error: ${statusCode}`;
  }
}
