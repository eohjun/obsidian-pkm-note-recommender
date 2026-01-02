/**
 * Embedding Store Interface
 *
 * Abstraction for storing and retrieving note embeddings.
 * Enables different storage backends (local JSON, IndexedDB, etc.)
 */

/**
 * Stored embedding with metadata
 */
export interface StoredEmbedding {
  noteId: string;
  notePath: string;
  embedding: number[];
  model: string;
  provider: string;
  createdAt: Date;
  contentHash: string; // To detect content changes
}

/**
 * Similarity search result
 */
export interface SimilarityResult {
  noteId: string;
  notePath: string;
  similarity: number; // 0.0 to 1.0
}

/**
 * Embedding Store Interface
 */
export interface IEmbeddingStore {
  /**
   * Save an embedding for a note
   */
  save(embedding: StoredEmbedding): Promise<void>;

  /**
   * Save multiple embeddings (batch)
   */
  saveBatch(embeddings: StoredEmbedding[]): Promise<void>;

  /**
   * Get embedding for a specific note
   */
  get(noteId: string): Promise<StoredEmbedding | null>;

  /**
   * Check if embedding exists for a note
   */
  exists(noteId: string): Promise<boolean>;

  /**
   * Check if embedding is stale (content has changed)
   */
  isStale(noteId: string, currentContentHash: string): Promise<boolean>;

  /**
   * Delete embedding for a note
   */
  delete(noteId: string): Promise<void>;

  /**
   * Get all stored embeddings
   */
  getAll(): Promise<StoredEmbedding[]>;

  /**
   * Find similar notes by embedding
   */
  findSimilar(
    embedding: number[],
    options?: {
      limit?: number;
      threshold?: number;
      excludeNoteIds?: string[];
    }
  ): Promise<SimilarityResult[]>;

  /**
   * Get statistics about stored embeddings
   */
  getStats(): Promise<{
    totalEmbeddings: number;
    lastUpdated: Date | null;
    storageSize: number;
  }>;

  /**
   * Clear all embeddings
   */
  clear(): Promise<void>;

  /**
   * Persist changes to storage
   */
  flush(): Promise<void>;
}
