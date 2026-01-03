/**
 * Embedding Service
 *
 * Application layer service for managing note embeddings.
 * Handles embedding generation, storage, and similarity search.
 */

import type { ILLMProvider } from '../../domain/interfaces/llm-provider.interface.js';
import type {
  IEmbeddingStore,
  StoredEmbedding,
  SimilarityResult,
} from '../../domain/interfaces/embedding-store.interface.js';
import type { INoteRepository } from '../../domain/interfaces/note-repository.interface.js';
import { createHash } from 'crypto';
import { processBatches } from './retry-service.js';

/**
 * Embedding service configuration
 */
export interface EmbeddingServiceConfig {
  /** Batch size for embedding generation */
  batchSize: number;
  /** Minimum similarity threshold for recommendations */
  similarityThreshold: number;
  /** Maximum number of recommendations to return */
  maxRecommendations: number;
  /** Auto-embed notes on change */
  autoEmbed: boolean;
}

const DEFAULT_CONFIG: EmbeddingServiceConfig = {
  batchSize: 20,
  similarityThreshold: 0.5,
  maxRecommendations: 10,
  autoEmbed: true,
};

/**
 * Progress callback for batch operations
 */
export type ProgressCallback = (current: number, total: number, message: string) => void;

/**
 * Embedding Service
 */
export class EmbeddingService {
  private provider: ILLMProvider;
  private store: IEmbeddingStore;
  private noteRepository: INoteRepository;
  private config: EmbeddingServiceConfig;

  constructor(
    provider: ILLMProvider,
    store: IEmbeddingStore,
    noteRepository: INoteRepository,
    config: Partial<EmbeddingServiceConfig> = {}
  ) {
    this.provider = provider;
    this.store = store;
    this.noteRepository = noteRepository;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update the LLM provider (when user changes provider in settings)
   */
  setProvider(provider: ILLMProvider): void {
    this.provider = provider;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<EmbeddingServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if the service is ready to generate embeddings
   */
  isReady(): boolean {
    return this.provider.isConfigured();
  }

  /**
   * Generate embedding for a single note
   */
  async embedNote(noteId: string, content: string, notePath: string): Promise<void> {
    if (!this.provider.isConfigured()) {
      throw new Error('LLM provider is not configured. Please add your API key in settings.');
    }

    const contentHash = this.hashContent(content);

    // Check if we already have a fresh embedding
    const isStale = await this.store.isStale(noteId, contentHash);
    if (!isStale) {
      return; // Already up to date
    }

    // Generate embedding
    const response = await this.provider.generateEmbedding({
      text: this.prepareTextForEmbedding(content),
    });

    // Store embedding
    await this.store.save({
      noteId,
      notePath,
      embedding: response.embedding,
      model: response.model,
      provider: this.provider.providerType,
      createdAt: new Date(),
      contentHash,
    });

    await this.store.flush();
  }

  /**
   * Embed all notes in batch with rate limit handling
   */
  async embedAllNotes(
    onProgress?: ProgressCallback,
    options?: { signal?: AbortSignal }
  ): Promise<{
    total: number;
    embedded: number;
    skipped: number;
    errors: number;
  }> {
    if (!this.provider.isConfigured()) {
      throw new Error('LLM provider is not configured. Please add your API key in settings.');
    }

    const notes = await this.noteRepository.findAll();
    const total = notes.length;
    let skipped = 0;

    // Prepare notes that need embedding
    const notesToEmbed: Array<{
      noteId: string;
      notePath: string;
      content: string;
      contentHash: string;
    }> = [];

    for (const note of notes) {
      const content = note.content;
      if (!content) {
        skipped++;
        continue;
      }

      const contentHash = this.hashContent(content);
      const isStale = await this.store.isStale(note.id, contentHash);

      if (isStale) {
        notesToEmbed.push({
          noteId: note.id,
          notePath: note.filePath,
          content,
          contentHash,
        });
      } else {
        skipped++;
      }
    }

    if (notesToEmbed.length === 0) {
      return { total, embedded: 0, skipped, errors: 0 };
    }

    // Use processBatches for rate-limit aware batch processing
    const result = await processBatches<
      (typeof notesToEmbed)[0],
      StoredEmbedding[]
    >({
      items: notesToEmbed,
      batchSize: this.config.batchSize,
      processFn: async (batch: typeof notesToEmbed): Promise<StoredEmbedding[]> => {
        // Generate embeddings in batch
        const response = await this.provider.generateEmbeddings({
          texts: batch.map((n) => this.prepareTextForEmbedding(n.content)),
        });

        // Create stored embeddings
        const storedEmbeddings: StoredEmbedding[] = batch.map((note, index) => ({
          noteId: note.noteId,
          notePath: note.notePath,
          embedding: response.embeddings[index],
          model: response.model,
          provider: this.provider.providerType,
          createdAt: new Date(),
          contentHash: note.contentHash,
        }));

        // Save to store
        await this.store.saveBatch(storedEmbeddings);

        return storedEmbeddings;
      },
      onProgress: onProgress
        ? (processed: number, totalItems: number) => {
            onProgress(
              skipped + processed,
              notes.length,
              `Embedded ${processed} of ${totalItems} notes...`
            );
          }
        : undefined,
      signal: options?.signal,
    });

    await this.store.flush();

    // Log any errors
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`Failed to embed batch [${err.batchIndex}]:`, err.error);
      }
    }

    // Calculate actual counts from results
    const embeddedCount = result.results.reduce((sum, batch) => sum + batch.length, 0);
    const errorCount = notesToEmbed.length - embeddedCount;

    return {
      total,
      embedded: embeddedCount,
      skipped,
      errors: errorCount,
    };
  }

  /**
   * Find similar notes for a given note
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
   * Find similar notes for given content (without storing)
   */
  async findSimilarToContent(
    content: string,
    options?: {
      limit?: number;
      threshold?: number;
      excludeNoteIds?: string[];
    }
  ): Promise<SimilarityResult[]> {
    if (!this.provider.isConfigured()) {
      throw new Error('LLM provider is not configured.');
    }

    const response = await this.provider.generateEmbedding({
      text: this.prepareTextForEmbedding(content),
    });

    return this.store.findSimilar(response.embedding, {
      limit: options?.limit ?? this.config.maxRecommendations,
      threshold: options?.threshold ?? this.config.similarityThreshold,
      excludeNoteIds: options?.excludeNoteIds,
    });
  }

  /**
   * Delete embedding for a note
   */
  async deleteEmbedding(noteId: string): Promise<void> {
    await this.store.delete(noteId);
    await this.store.flush();
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
    return {
      ...stats,
      provider: this.provider.providerType,
      model: this.provider.getDefaultModel(),
    };
  }

  /**
   * Clear all embeddings
   */
  async clearAllEmbeddings(): Promise<void> {
    await this.store.clear();
    await this.store.flush();
  }

  /**
   * Prepare text for embedding (truncate, clean, etc.)
   */
  private prepareTextForEmbedding(content: string): string {
    // Remove frontmatter
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '');

    // Remove markdown formatting but keep text
    const cleaned = withoutFrontmatter
      .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Keep link text
      .replace(/#{1,6}\s+/g, '') // Remove heading markers
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1') // Remove bold/italic
      .replace(/`{1,3}[^`]*`{1,3}/g, '') // Remove code blocks
      .replace(/>\s+/g, '') // Remove blockquotes
      .replace(/[-*+]\s+/g, '') // Remove list markers
      .replace(/\n{3,}/g, '\n\n') // Normalize newlines
      .trim();

    // Truncate to reasonable length (most models support 8k tokens)
    const maxChars = 15000; // ~4k tokens
    return cleaned.length > maxChars
      ? cleaned.substring(0, maxChars) + '...'
      : cleaned;
  }

  /**
   * Generate content hash for change detection
   */
  private hashContent(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }
}
