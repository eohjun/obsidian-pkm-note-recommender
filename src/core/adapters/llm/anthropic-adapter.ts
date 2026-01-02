/**
 * Anthropic Adapter
 *
 * Implements ILLMProvider using Voyage AI (Anthropic's recommended embedding solution).
 * Voyage AI provides high-quality embeddings optimized for retrieval tasks.
 *
 * Note: Anthropic doesn't have a native embedding API. Voyage AI is their official
 * partner for embeddings. Users need a Voyage AI API key (starts with 'pa-' or 'voyage-').
 */

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

const VOYAGE_MODELS = {
  'voyage-3': { dimensions: 1024, maxTokens: 32000 },
  'voyage-3-lite': { dimensions: 512, maxTokens: 32000 },
  'voyage-code-3': { dimensions: 1024, maxTokens: 32000 },
} as const;

const DEFAULT_MODEL = 'voyage-3-lite';
const DEFAULT_BASE_URL = 'https://api.voyageai.com/v1';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1';

/**
 * Anthropic (Voyage AI) LLM Provider Adapter
 */
export class AnthropicAdapter implements ILLMProvider {
  readonly providerType: LLMProviderType = 'anthropic';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    // Voyage AI keys typically start with 'pa-' or contain 'voyage'
    return Boolean(
      this.apiKey &&
      (this.apiKey.startsWith('pa-') || this.apiKey.includes('voyage'))
    );
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.callApi('/embeddings', {
      model,
      input: request.text,
      input_type: 'document',
    });

    return {
      embedding: response.data[0].embedding,
      model,
      tokenCount: response.usage?.total_tokens ?? 0,
    };
  }

  async generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.callApi('/embeddings', {
      model,
      input: request.texts,
      input_type: 'document',
    });

    // Sort by index to ensure correct order
    const sortedData = response.data.sort(
      (a: { index: number }, b: { index: number }) => a.index - b.index
    );

    return {
      embeddings: sortedData.map((d: { embedding: number[] }) => d.embedding),
      model,
      totalTokens: response.usage?.total_tokens ?? 0,
    };
  }

  getAvailableModels(): string[] {
    return Object.keys(VOYAGE_MODELS);
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      // Make a minimal embedding request to validate the key
      await this.callApi('/embeddings', {
        model: this.defaultModel,
        input: 'test',
        input_type: 'document',
      });
      return true;
    } catch {
      return false;
    }
  }

  async generateCompletion(request: TextCompletionRequest): Promise<TextCompletionResponse> {
    // For completion, we need to use the Anthropic Claude API
    // This requires an Anthropic API key (starts with 'sk-ant-')
    // Voyage AI keys (pa-*) only work for embeddings

    if (!this.apiKey.startsWith('sk-ant-')) {
      // Voyage AI key detected - completion not supported
      // Return a placeholder that will trigger the fallback in ConnectionReasonService
      throw new Error(
        'Text completion requires an Anthropic API key (sk-ant-*). ' +
        'Current key is for Voyage AI embeddings only.'
      );
    }

    const model = 'claude-3-haiku-20240307'; // Use efficient model for classifications

    const response = await fetch(`${ANTHROPIC_API_URL}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 200,
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Anthropic API error: ${response.status} - ${error.error?.message ?? response.statusText}`
      );
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? '';

    return {
      text,
      model,
      tokenCount: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };
  }

  private async callApi(endpoint: string, body: unknown): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `Voyage AI error: ${response.status} - ${error.detail ?? response.statusText}`
      );
    }

    return response.json();
  }
}
