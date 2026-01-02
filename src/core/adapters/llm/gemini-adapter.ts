/**
 * Gemini (Google) Adapter
 *
 * Implements ILLMProvider for Google's Gemini embedding API.
 */

import type {
  ILLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
} from '../../domain/interfaces/llm-provider.interface.js';

const GEMINI_MODELS = {
  'text-embedding-004': { dimensions: 768, maxTokens: 2048 },
  'embedding-001': { dimensions: 768, maxTokens: 2048 },
} as const;

const DEFAULT_MODEL = 'text-embedding-004';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Gemini LLM Provider Adapter
 */
export class GeminiAdapter implements ILLMProvider {
  readonly providerType: LLMProviderType = 'gemini';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('AIza'));
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.callApi(model, {
      content: {
        parts: [{ text: request.text }],
      },
    });

    return {
      embedding: response.embedding.values,
      model,
      tokenCount: 0, // Gemini doesn't return token count for embeddings
    };
  }

  async generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    // Gemini's batch embed endpoint
    const requests = request.texts.map((text) => ({
      model: `models/${model}`,
      content: {
        parts: [{ text }],
      },
    }));

    const response = await this.callBatchApi(model, { requests });

    return {
      embeddings: response.embeddings.map(
        (e: { values: number[] }) => e.values
      ),
      model,
      totalTokens: 0,
    };
  }

  getAvailableModels(): string[] {
    return Object.keys(GEMINI_MODELS);
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      // Make a minimal API call to validate the key
      const url = `${this.baseUrl}/models?key=${this.apiKey}`;
      const response = await fetch(url);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async callApi(model: string, body: unknown): Promise<any> {
    const url = `${this.baseUrl}/models/${model}:embedContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Gemini API error: ${response.status} - ${error.error?.message ?? response.statusText}`
      );
    }

    return response.json();
  }

  private async callBatchApi(model: string, body: unknown): Promise<any> {
    const url = `${this.baseUrl}/models/${model}:batchEmbedContents?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Gemini API error: ${response.status} - ${error.error?.message ?? response.statusText}`
      );
    }

    return response.json();
  }
}
