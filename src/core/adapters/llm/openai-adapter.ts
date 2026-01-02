/**
 * OpenAI Adapter
 *
 * Implements ILLMProvider for OpenAI's embedding API.
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

const OPENAI_MODELS = {
  'text-embedding-3-small': { dimensions: 1536, maxTokens: 8191 },
  'text-embedding-3-large': { dimensions: 3072, maxTokens: 8191 },
  'text-embedding-ada-002': { dimensions: 1536, maxTokens: 8191 },
} as const;

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * OpenAI LLM Provider Adapter
 */
export class OpenAIAdapter implements ILLMProvider {
  readonly providerType: LLMProviderType = 'openai';

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.defaultModel = config.defaultModel ?? DEFAULT_MODEL;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.startsWith('sk-'));
  }

  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model ?? this.defaultModel;

    const response = await this.callApi('/embeddings', {
      model,
      input: request.text,
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
    return Object.keys(OPENAI_MODELS);
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  async validateApiKey(): Promise<boolean> {
    try {
      // Make a minimal API call to validate the key
      await this.callApi('/models', null, 'GET');
      return true;
    } catch {
      return false;
    }
  }

  async generateCompletion(request: TextCompletionRequest): Promise<TextCompletionResponse> {
    const model = 'gpt-4o-mini'; // Use efficient model for classifications

    const response = await this.callApi('/chat/completions', {
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that analyzes note connections in a PKM system. Always respond in JSON format when requested.',
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

  private async callApi(
    endpoint: string,
    body: unknown,
    method: 'GET' | 'POST' = 'POST'
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API error: ${response.status} - ${error.error?.message ?? response.statusText}`
      );
    }

    return response.json();
  }
}
