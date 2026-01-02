/**
 * Local Embedding Store
 *
 * Implements IEmbeddingStore using local JSON file storage.
 * Stores embeddings in the plugin's data directory.
 */

import type { Plugin } from 'obsidian';
import type {
  IEmbeddingStore,
  StoredEmbedding,
  SimilarityResult,
} from '../../domain/interfaces/embedding-store.interface.js';
import { cosineSimilarity } from '../../domain/value-objects/embedding.js';

const STORAGE_KEY = 'embeddings-cache';
const METADATA_KEY = 'embeddings-metadata';

interface EmbeddingMetadata {
  lastUpdated: string | null;
  version: number;
}

interface StoredData {
  embeddings: Record<string, StoredEmbedding>;
  metadata: EmbeddingMetadata;
}

/**
 * Local Embedding Store using Obsidian's plugin data storage
 */
export class LocalEmbeddingStore implements IEmbeddingStore {
  private plugin: Plugin;
  private cache: Map<string, StoredEmbedding> = new Map();
  private isDirty = false;
  private metadata: EmbeddingMetadata = {
    lastUpdated: null,
    version: 1,
  };

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  /**
   * Initialize the store by loading from disk
   */
  async initialize(): Promise<void> {
    await this.loadFromDisk();
  }

  async save(embedding: StoredEmbedding): Promise<void> {
    this.cache.set(embedding.noteId, {
      ...embedding,
      createdAt: new Date(embedding.createdAt),
    });
    this.isDirty = true;
    this.metadata.lastUpdated = new Date().toISOString();
  }

  async saveBatch(embeddings: StoredEmbedding[]): Promise<void> {
    for (const embedding of embeddings) {
      this.cache.set(embedding.noteId, {
        ...embedding,
        createdAt: new Date(embedding.createdAt),
      });
    }
    this.isDirty = true;
    this.metadata.lastUpdated = new Date().toISOString();
  }

  async get(noteId: string): Promise<StoredEmbedding | null> {
    return this.cache.get(noteId) ?? null;
  }

  async exists(noteId: string): Promise<boolean> {
    return this.cache.has(noteId);
  }

  async isStale(noteId: string, currentContentHash: string): Promise<boolean> {
    const stored = this.cache.get(noteId);
    if (!stored) return true;
    return stored.contentHash !== currentContentHash;
  }

  async delete(noteId: string): Promise<void> {
    if (this.cache.has(noteId)) {
      this.cache.delete(noteId);
      this.isDirty = true;
    }
  }

  async getAll(): Promise<StoredEmbedding[]> {
    return Array.from(this.cache.values());
  }

  async findSimilar(
    embedding: number[],
    options?: {
      limit?: number;
      threshold?: number;
      excludeNoteIds?: string[];
    }
  ): Promise<SimilarityResult[]> {
    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0.5;
    const excludeIds = new Set(options?.excludeNoteIds ?? []);

    const results: SimilarityResult[] = [];

    for (const stored of this.cache.values()) {
      if (excludeIds.has(stored.noteId)) continue;

      const similarity = cosineSimilarity(embedding, stored.embedding);

      if (similarity >= threshold) {
        results.push({
          noteId: stored.noteId,
          notePath: stored.notePath,
          similarity,
        });
      }
    }

    // Sort by similarity descending and limit
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async getStats(): Promise<{
    totalEmbeddings: number;
    lastUpdated: Date | null;
    storageSize: number;
  }> {
    const storageSize = this.estimateStorageSize();
    return {
      totalEmbeddings: this.cache.size,
      lastUpdated: this.metadata.lastUpdated
        ? new Date(this.metadata.lastUpdated)
        : null,
      storageSize,
    };
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.isDirty = true;
    this.metadata.lastUpdated = null;
  }

  async flush(): Promise<void> {
    if (this.isDirty) {
      await this.saveToDisk();
      this.isDirty = false;
    }
  }

  /**
   * Load embeddings from disk
   */
  private async loadFromDisk(): Promise<void> {
    try {
      const data = await this.plugin.loadData();
      if (data && data[STORAGE_KEY]) {
        const stored = data[STORAGE_KEY] as Record<string, any>;
        for (const [noteId, embedding] of Object.entries(stored)) {
          this.cache.set(noteId, {
            ...embedding,
            createdAt: new Date(embedding.createdAt),
          } as StoredEmbedding);
        }
      }
      if (data && data[METADATA_KEY]) {
        this.metadata = data[METADATA_KEY] as EmbeddingMetadata;
      }
    } catch (error) {
      console.error('Failed to load embeddings from disk:', error);
    }
  }

  /**
   * Save embeddings to disk
   */
  private async saveToDisk(): Promise<void> {
    try {
      const existingData = (await this.plugin.loadData()) ?? {};

      const embeddingsObj: Record<string, StoredEmbedding> = {};
      for (const [noteId, embedding] of this.cache.entries()) {
        embeddingsObj[noteId] = {
          ...embedding,
          createdAt: embedding.createdAt,
        };
      }

      const newData = {
        ...existingData,
        [STORAGE_KEY]: embeddingsObj,
        [METADATA_KEY]: this.metadata,
      };

      await this.plugin.saveData(newData);
    } catch (error) {
      console.error('Failed to save embeddings to disk:', error);
      throw error;
    }
  }

  /**
   * Estimate storage size in bytes
   */
  private estimateStorageSize(): number {
    let size = 0;
    for (const embedding of this.cache.values()) {
      // Rough estimate: noteId + notePath + embedding vector + metadata
      size += embedding.noteId.length * 2;
      size += embedding.notePath.length * 2;
      size += embedding.embedding.length * 8; // 64-bit floats
      size += 200; // metadata overhead
    }
    return size;
  }
}
