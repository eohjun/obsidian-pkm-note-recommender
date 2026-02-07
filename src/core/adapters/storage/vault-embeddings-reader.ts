/**
 * Vault Embeddings Reader
 *
 * Read-only adapter for consuming embeddings from the shared
 * Vault Embeddings plugin (09_Embedded/ folder).
 *
 * This replaces the local embedding generation with reading
 * pre-generated embeddings from the centralized storage.
 */

import { App, TFile, normalizePath } from 'obsidian';
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
  private lruOrder: string[] = [];
  private readonly MAX_CACHE_SIZE = 200;
  private indexCache: VaultEmbeddingIndex | null = null;
  private lastCacheUpdate: number = 0;
  private allLoaded = false;
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
   * Refresh the index cache from Vault Embeddings folder.
   * Loads only the index initially; individual embeddings are loaded on demand.
   */
  async refreshCache(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastCacheUpdate < this.CACHE_TTL_MS) {
      return;
    }

    this.cache.clear();
    this.lruOrder = [];
    this.allLoaded = false;
    this.indexCache = null;

    const index = await this.loadIndex();
    if (!index) {
      console.warn('VaultEmbeddingsReader: No index.json found. Is Vault Embeddings plugin installed?');
      return;
    }

    this.indexCache = index;
    this.lastCacheUpdate = now;
    console.info(`VaultEmbeddingsReader: Index loaded with ${Object.keys(index.notes).length} entries`);
  }

  /**
   * Ensure all embeddings are loaded into cache (for similarity search).
   * Only loads once per cache refresh cycle.
   */
  private async ensureAllLoaded(): Promise<void> {
    if (this.allLoaded || !this.indexCache) return;

    for (const noteId of Object.keys(this.indexCache.notes)) {
      if (!this.cache.has(noteId)) {
        const embedding = await this.loadEmbedding(noteId);
        if (embedding) {
          this.cache.set(noteId, embedding);
        }
      }
    }
    this.allLoaded = true;
    console.info(`VaultEmbeddingsReader: All ${this.cache.size} embeddings loaded`);
  }

  /**
   * LRU cache management: evict oldest entries when over limit.
   * Only applies during on-demand loading (not when all are loaded).
   */
  private touchLru(noteId: string): void {
    if (this.allLoaded) return;
    const idx = this.lruOrder.indexOf(noteId);
    if (idx > -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(noteId);

    while (this.lruOrder.length > this.MAX_CACHE_SIZE) {
      const evict = this.lruOrder.shift();
      if (evict) this.cache.delete(evict);
    }
  }

  // ==================== Read Operations ====================

  async get(noteId: string): Promise<StoredEmbedding | null> {
    await this.refreshCache();
    // On-demand loading with LRU
    if (this.cache.has(noteId)) {
      this.touchLru(noteId);
      return this.cache.get(noteId) ?? null;
    }
    // Load on demand if noteId exists in index
    if (this.indexCache?.notes[noteId]) {
      const embedding = await this.loadEmbedding(noteId);
      if (embedding) {
        this.cache.set(noteId, embedding);
        this.touchLru(noteId);
        return embedding;
      }
    }
    return null;
  }

  async exists(noteId: string): Promise<boolean> {
    await this.refreshCache();
    return this.cache.has(noteId) || !!this.indexCache?.notes[noteId];
  }

  async isStale(noteId: string, currentContentHash: string): Promise<boolean> {
    await this.refreshCache();
    // Check index first to avoid loading embedding
    if (this.indexCache?.notes[noteId]) {
      return this.indexCache.notes[noteId].contentHash !== currentContentHash;
    }
    return true;
  }

  async getAll(): Promise<StoredEmbedding[]> {
    await this.refreshCache();
    await this.ensureAllLoaded();
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
    await this.ensureAllLoaded();

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
    return normalizePath(`${this.config.storagePath}/index.json`);
  }

  private getEmbeddingPath(noteId: string): string {
    const safeId = noteId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return normalizePath(`${this.config.storagePath}/${this.config.embeddingsFolder}/${safeId}.json`);
  }

  /**
   * Load index.json with adapter fallback for Git sync compatibility
   */
  private async loadIndex(): Promise<VaultEmbeddingIndex | null> {
    const indexPath = this.getIndexPath();

    // Try Obsidian index first, then adapter fallback
    let content: string;
    const file = this.app.vault.getAbstractFileByPath(indexPath);
    if (file instanceof TFile) {
      content = await this.app.vault.read(file);
    } else {
      // Obsidian index not synced - try adapter.read()
      try {
        content = await this.app.vault.adapter.read(indexPath);
        console.log('VaultEmbeddingsReader: Used adapter.read for index');
      } catch {
        return null;
      }
    }

    try {
      return JSON.parse(content) as VaultEmbeddingIndex;
    } catch {
      console.error('VaultEmbeddingsReader: Failed to parse index.json');
      return null;
    }
  }

  /**
   * Load individual embedding with adapter fallback
   */
  private async loadEmbedding(noteId: string): Promise<StoredEmbedding | null> {
    const filePath = this.getEmbeddingPath(noteId);

    // Try Obsidian index first, then adapter fallback
    let content: string;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      content = await this.app.vault.read(file);
    } else {
      // Obsidian index not synced - try adapter.read()
      try {
        content = await this.app.vault.adapter.read(filePath);
      } catch {
        return null; // File doesn't exist
      }
    }

    try {
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
   * Uses adapter.exists() for Git sync compatibility
   */
  async isAvailable(): Promise<boolean> {
    const indexPath = this.getIndexPath();
    const file = this.app.vault.getAbstractFileByPath(indexPath);
    if (file instanceof TFile) {
      return true;
    }
    // Check via adapter for sync scenarios
    try {
      return await this.app.vault.adapter.exists(indexPath);
    } catch {
      return false;
    }
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
