/**
 * LLM Provider Interface
 *
 * Abstraction for different LLM providers (OpenAI, Gemini, Anthropic).
 * Enables switching providers without changing application logic.
 */

/**
 * Supported LLM providers
 */
export type LLMProviderType = 'openai' | 'gemini' | 'anthropic';

/**
 * Embedding request
 */
export interface EmbeddingRequest {
  text: string;
  model?: string;
}

/**
 * Embedding response
 */
export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  tokenCount: number;
}

/**
 * Batch embedding request
 */
export interface BatchEmbeddingRequest {
  texts: string[];
  model?: string;
}

/**
 * Batch embedding response
 */
export interface BatchEmbeddingResponse {
  embeddings: number[][];
  model: string;
  totalTokens: number;
}

/**
 * Provider configuration
 */
export interface LLMProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

/**
 * LLM Provider Interface
 *
 * All LLM adapters must implement this interface.
 */
export interface ILLMProvider {
  /**
   * Provider type identifier
   */
  readonly providerType: LLMProviderType;

  /**
   * Check if the provider is configured and ready
   */
  isConfigured(): boolean;

  /**
   * Generate embedding for a single text
   */
  generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  generateEmbeddings(request: BatchEmbeddingRequest): Promise<BatchEmbeddingResponse>;

  /**
   * Get available embedding models for this provider
   */
  getAvailableModels(): string[];

  /**
   * Get the default embedding model
   */
  getDefaultModel(): string;

  /**
   * Validate the API key
   */
  validateApiKey(): Promise<boolean>;
}
