/**
 * LLM Adapters - Public API
 *
 * Exports all LLM provider adapters and factory function.
 */

import type {
  ILLMProvider,
  LLMProviderType,
  LLMProviderConfig,
} from '../../domain/interfaces/llm-provider.interface.js';

import { OpenAIAdapter } from './openai-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { AnthropicAdapter } from './anthropic-adapter.js';

// Export adapters
export { OpenAIAdapter } from './openai-adapter.js';
export { GeminiAdapter } from './gemini-adapter.js';
export { AnthropicAdapter } from './anthropic-adapter.js';

/**
 * Provider metadata for UI display
 */
export const LLM_PROVIDERS: Record<
  LLMProviderType,
  {
    name: string;
    description: string;
    keyPrefix: string;
    keyPlaceholder: string;
    docsUrl: string;
  }
> = {
  openai: {
    name: 'OpenAI',
    description: 'GPT models and text-embedding-3 (recommended)',
    keyPrefix: 'sk-',
    keyPlaceholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    name: 'Google Gemini',
    description: 'Gemini models with generous free tier',
    keyPrefix: 'AIza',
    keyPlaceholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
  },
  anthropic: {
    name: 'Anthropic (Voyage AI)',
    description: 'High-quality embeddings via Voyage AI',
    keyPrefix: 'pa-',
    keyPlaceholder: 'pa-... (Voyage AI key)',
    docsUrl: 'https://www.voyageai.com/',
  },
};

/**
 * Create an LLM provider adapter based on type
 */
export function createLLMProvider(
  type: LLMProviderType,
  config: LLMProviderConfig
): ILLMProvider {
  switch (type) {
    case 'openai':
      return new OpenAIAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    case 'anthropic':
      return new AnthropicAdapter(config);
    default:
      throw new Error(`Unknown LLM provider type: ${type}`);
  }
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(type: LLMProviderType): string {
  switch (type) {
    case 'openai':
      return 'text-embedding-3-small';
    case 'gemini':
      return 'text-embedding-004';
    case 'anthropic':
      return 'voyage-3-lite';
    default:
      return '';
  }
}

/**
 * Validate API key format (basic validation)
 */
export function validateApiKeyFormat(
  type: LLMProviderType,
  apiKey: string
): boolean {
  if (!apiKey) return false;

  switch (type) {
    case 'openai':
      return apiKey.startsWith('sk-');
    case 'gemini':
      return apiKey.startsWith('AIza');
    case 'anthropic':
      return apiKey.startsWith('pa-') || apiKey.includes('voyage');
    default:
      return false;
  }
}
