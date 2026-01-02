/**
 * Recommendation Service Interface
 *
 * Domain interface for note recommendation services.
 * This abstraction defines the contract for finding related notes.
 *
 * Clean Architecture:
 * - Domain layer interface (no external dependencies)
 * - Implemented by infrastructure/application services
 * - Used by Use Cases for recommendation logic
 */

import type { RecommendationResult } from '../value-objects/recommendation-result.js';

/**
 * Options for generating recommendations
 */
export interface RecommendationOptions {
  /** Maximum number of recommendations to return */
  maxResults?: number;
  /** Minimum score threshold (0-1) */
  minScore?: number;
  /** Include graph-based connections */
  useGraphConnections?: boolean;
  /** Include tag similarity */
  useTagSimilarity?: boolean;
  /** Include content similarity */
  useContentSimilarity?: boolean;
  /** Note IDs to exclude from recommendations */
  excludeNoteIds?: string[];
}

/**
 * Source note context for generating recommendations
 */
export interface RecommendationSource {
  /** Note ID in YYYYMMDDHHMM format */
  noteId: string;
  /** Note file path */
  notePath: string;
  /** Note content (optional, for content-based similarity) */
  content?: string;
  /** Note tags */
  tags?: string[];
}

/**
 * Recommendation batch request
 */
export interface BatchRecommendationRequest {
  /** Source notes to find recommendations for */
  sources: RecommendationSource[];
  /** Options applied to all recommendations */
  options?: RecommendationOptions;
}

/**
 * Recommendation batch response
 */
export interface BatchRecommendationResponse {
  /** Map of source note ID to recommendations */
  results: Map<string, RecommendationResult[]>;
  /** Processing statistics */
  stats: {
    totalSources: number;
    totalRecommendations: number;
    processingTimeMs: number;
  };
}

/**
 * Recommendation Service Interface
 *
 * Provides methods for finding notes related to a source note
 * using various similarity metrics (tags, graph, content).
 */
export interface IRecommendationService {
  /**
   * Get recommendations for a single note
   *
   * @param source - Source note to find recommendations for
   * @param options - Recommendation options
   * @returns Promise resolving to array of recommendations
   */
  getRecommendations(
    source: RecommendationSource,
    options?: RecommendationOptions,
  ): Promise<RecommendationResult[]>;

  /**
   * Get recommendations for multiple notes in batch
   *
   * @param request - Batch request with multiple sources
   * @returns Promise resolving to batch response
   */
  getBatchRecommendations(
    request: BatchRecommendationRequest,
  ): Promise<BatchRecommendationResponse>;

  /**
   * Calculate similarity score between two notes
   *
   * @param noteId1 - First note ID
   * @param noteId2 - Second note ID
   * @returns Promise resolving to similarity score (0-1)
   */
  calculateSimilarity(noteId1: string, noteId2: string): Promise<number>;

  /**
   * Check if the service is ready to generate recommendations
   *
   * @returns Promise resolving to ready status
   */
  isReady(): Promise<boolean>;

  /**
   * Warm up the service (load indices, caches, etc.)
   *
   * @returns Promise resolving when warm-up is complete
   */
  warmUp(): Promise<void>;
}
