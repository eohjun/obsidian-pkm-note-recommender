/**
 * Vault Embeddings Reader
 *
 * Read-only adapter for consuming embeddings from the shared
 * Vault Embeddings plugin (09_Embedded/ folder).
 *
 * This replaces the local embedding generation with reading
 * pre-generated embeddings from the centralized storage.
 */

import { App, TFile, TFolder } from 'obsidian';
import type {
  IEmbeddingStore,
  StoredEmbedding,
  SimilarityResult,
} from '../../domain/interfaces/embedding-store.interface.js';
import { cosineSimilarity } from '../../domain/value-objects/embedding.js';

/**
 * Vault Embeddings index.json structure
 */
interface VaultEmbeddingIndex {
  version: string;
  totalNotes: number;
  lastUpdated: string;
  model: string;
  dimensions: number;
  notes: Record<string, {
    path: string;
    contentHash: string;
    updatedAt: string;
  }>;
}

/**
 * Vault Embeddings individual file structure
 */
interface VaultEmbeddingFile {
  noteId: string;
  notePath: string;
  title: string;
  contentHash: string;
  vector: number[];
  model: string;
  provider: string;
  dimensions: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultEmbeddingsReaderConfig {
  /** Storage folder path (default: 09_Embedded) */
  storagePath: string;
  /** Embeddings subfolder (default: embeddings) */
  embeddingsFolder: string;
}

const DEFAULT_CONFIG: VaultEmbeddingsReaderConfig = {
  storagePath: '09_Embedded',
  embeddingsFolder: 'embeddings',
};

/**
 * Read-only embedding store that consumes from Vault Embeddings plugin
 */
export class VaultEmbeddingsReader implements IEmbeddingStore {
  private app: App;
  private config: VaultEmbeddingsReaderConfig;
  private cache: Map<string, StoredEmbedding> = new Map();
  private indexCache: VaultEmbeddingIndex | null = null;
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache

  constructor(app: App, config?: Partial<VaultEmbeddingsReaderConfig>) {
    this.app = app;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize by loading embeddings from Vault Embeddings folder
   */
  async initialize(): Promise<void> {
    await this.refreshCache();
  }

  /**
   * Refresh the cache from Vault Embeddings folder
   */
  async refreshCache(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastCacheUpdate < this.CACHE_TTL_MS) {
      return;
    }

    this.cache.clear();
    this.indexCache = null;

    const index = await this.loadIndex();
    if (!index) {
      console.warn('VaultEmbeddingsReader: No index.json found. Is Vault Embeddings plugin installed?');
      return;
    }

    this.indexCache = index;

    // Load all embeddings
    for (const noteId of Object.keys(index.notes)) {
      const embedding = await this.loadEmbedding(noteId);
      if (embedding) {
        this.cache.set(noteId, embedding);
      }
    }

    this.lastCacheUpdate = now;
    console.info(`VaultEmbeddingsReader: Loaded ${this.cache.size} embeddings from Vault Embeddings`);
  }

  // ==================== Read Operations ====================

  async get(noteId: string): Promise<StoredEmbedding | null> {
    await this.refreshCache();
    return this.cache.get(noteId) ?? null;
  }

  async exists(noteId: string): Promise<boolean> {
    await this.refreshCache();
    return this.cache.has(noteId);
  }

  async isStale(noteId: string, currentContentHash: string): Promise<boolean> {
    await this.refreshCache();
    const stored = this.cache.get(noteId);
    if (!stored) return true;
    return stored.contentHash !== currentContentHash;
  }

  async getAll(): Promise<StoredEmbedding[]> {
    await this.refreshCache();
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
    await this.refreshCache();

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

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async getStats(): Promise<{
    totalEmbeddings: number;
    lastUpdated: Date | null;
    storageSize: number;
  }> {
    await this.refreshCache();

    const index = this.indexCache;
    const storageSize = this.estimateStorageSize();

    return {
      totalEmbeddings: this.cache.size,
      lastUpdated: index?.lastUpdated ? new Date(index.lastUpdated) : null,
      storageSize,
    };
  }

  // ==================== Write Operations (No-op) ====================

  async save(_embedding: StoredEmbedding): Promise<void> {
    console.info('VaultEmbeddingsReader: save() is no-op. Use Vault Embeddings plugin to manage embeddings.');
  }

  async saveBatch(_embeddings: StoredEmbedding[]): Promise<void> {
    console.info('VaultEmbeddingsReader: saveBatch() is no-op. Use Vault Embeddings plugin to manage embeddings.');
  }

  async delete(_noteId: string): Promise<void> {
    console.info('VaultEmbeddingsReader: delete() is no-op. Use Vault Embeddings plugin to manage embeddings.');
  }

  async clear(): Promise<void> {
    console.info('VaultEmbeddingsReader: clear() is no-op. Use Vault Embeddings plugin to manage embeddings.');
  }

  async flush(): Promise<void> {
    // No-op for read-only store
  }

  // ==================== Private Methods ====================

  private getIndexPath(): string {
    return `${this.config.storagePath}/index.json`;
  }

  private getEmbeddingPath(noteId: string): string {
    const safeId = noteId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${this.config.storagePath}/${this.config.embeddingsFolder}/${safeId}.json`;
  }

  private async loadIndex(): Promise<VaultEmbeddingIndex | null> {
    const indexPath = this.getIndexPath();
    const file = this.app.vault.getAbstractFileByPath(indexPath);

    if (!(file instanceof TFile)) {
      return null;
    }

    try {
      const content = await this.app.vault.read(file);
      return JSON.parse(content) as VaultEmbeddingIndex;
    } catch {
      console.error('VaultEmbeddingsReader: Failed to parse index.json');
      return null;
    }
  }

  private async loadEmbedding(noteId: string): Promise<StoredEmbedding | null> {
    const filePath = this.getEmbeddingPath(noteId);
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (!(file instanceof TFile)) {
      return null;
    }

    try {
      const content = await this.app.vault.read(file);
      const data = JSON.parse(content) as VaultEmbeddingFile;

      // Map Vault Embeddings format to StoredEmbedding
      return {
        noteId: data.noteId,
        notePath: data.notePath,
        embedding: data.vector, // Map 'vector' to 'embedding'
        model: data.model,
        provider: data.provider,
        createdAt: new Date(data.createdAt),
        contentHash: data.contentHash,
      };
    } catch {
      console.error(`VaultEmbeddingsReader: Failed to parse embedding ${noteId}`);
      return null;
    }
  }

  private estimateStorageSize(): number {
    let size = 0;
    for (const embedding of this.cache.values()) {
      size += embedding.noteId.length * 2;
      size += embedding.notePath.length * 2;
      size += embedding.embedding.length * 8;
      size += 200;
    }
    return size;
  }

  /**
   * Check if Vault Embeddings data is available
   */
  isAvailable(): boolean {
    const indexPath = this.getIndexPath();
    const file = this.app.vault.getAbstractFileByPath(indexPath);
    return file instanceof TFile;
  }

  /**
   * Get info about the Vault Embeddings source
   */
  getSourceInfo(): { model: string; dimensions: number; provider: string } | null {
    if (!this.indexCache) return null;
    return {
      model: this.indexCache.model,
      dimensions: this.indexCache.dimensions,
      provider: 'vault-embeddings', // Source is the shared plugin
    };
  }
}
