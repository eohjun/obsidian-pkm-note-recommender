/**
 * Vault Embedding Service
 *
 * Read-only service for semantic similarity using shared Vault Embeddings.
 * Replaces the full EmbeddingService when using centralized embeddings.
 */

import type { IEmbeddingStore, SimilarityResult } from '../../domain/interfaces/embedding-store.interface.js';
import type { VaultEmbeddingsReader } from '../../adapters/storage/vault-embeddings-reader.js';

export interface VaultEmbeddingServiceConfig {
  /** Minimum similarity threshold for recommendations */
  similarityThreshold: number;
  /** Maximum number of recommendations to return */
  maxRecommendations: number;
}

const DEFAULT_CONFIG: VaultEmbeddingServiceConfig = {
  similarityThreshold: 0.5,
  maxRecommendations: 10,
};

/**
 * Read-only embedding service using shared Vault Embeddings data
 */
export class VaultEmbeddingService {
  private store: IEmbeddingStore;
  private config: VaultEmbeddingServiceConfig;

  constructor(
    store: IEmbeddingStore,
    config: Partial<VaultEmbeddingServiceConfig> = {}
  ) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<VaultEmbeddingServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if the service is ready (embeddings available)
   */
  isReady(): boolean {
    // Check if the reader has embeddings loaded
    if ('isAvailable' in this.store) {
      return (this.store as VaultEmbeddingsReader).isAvailable();
    }
    return true;
  }

  /**
   * Find similar notes for a given note ID
   */
  async findSimilarNotes(
    noteId: string,
    options?: {
      limit?: number;
      threshold?: number;
    }
  ): Promise<SimilarityResult[]> {
    const embedding = await this.store.get(noteId);
    if (!embedding) {
      return [];
    }

    return this.store.findSimilar(embedding.embedding, {
      limit: options?.limit ?? this.config.maxRecommendations,
      threshold: options?.threshold ?? this.config.similarityThreshold,
      excludeNoteIds: [noteId],
    });
  }

  /**
   * Find similar notes by file path (more reliable across different plugins)
   */
  async findSimilarNotesByPath(
    filePath: string,
    options?: {
      limit?: number;
      threshold?: number;
    }
  ): Promise<SimilarityResult[]> {
    // Use getByPath if available (VaultEmbeddingsReader)
    let embedding = null;
    if ('getByPath' in this.store) {
      embedding = await (this.store as VaultEmbeddingsReader).getByPath(filePath);
    }

    if (!embedding) {
      return [];
    }

    return this.store.findSimilar(embedding.embedding, {
      limit: options?.limit ?? this.config.maxRecommendations,
      threshold: options?.threshold ?? this.config.similarityThreshold,
      excludeNoteIds: [embedding.noteId],
    });
  }

  /**
   * Get embedding statistics
   */
  async getStats(): Promise<{
    totalEmbeddings: number;
    lastUpdated: Date | null;
    storageSize: number;
    provider: string;
    model: string;
  }> {
    const stats = await this.store.getStats();

    // Get source info if available
    let model = 'unknown';
    let provider = 'vault-embeddings';

    if ('getSourceInfo' in this.store) {
      const sourceInfo = (this.store as VaultEmbeddingsReader).getSourceInfo();
      if (sourceInfo) {
        model = sourceInfo.model;
        provider = sourceInfo.provider;
      }
    }

    return {
      ...stats,
      provider,
      model,
    };
  }

  /**
   * Refresh embeddings from Vault Embeddings folder
   */
  async refresh(): Promise<void> {
    if ('refreshCache' in this.store) {
      await (this.store as VaultEmbeddingsReader).refreshCache(true);
    }
  }
}
