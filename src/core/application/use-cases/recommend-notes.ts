/**
 * RecommendNotes Use Case
 *
 * Application layer use case for recommending related notes.
 * This use case orchestrates domain entities and repository interfaces
 * to provide note recommendations based on:
 * - Shared tags
 * - Graph connections
 * - Semantic similarity (via embeddings)
 *
 * Clean Architecture:
 * - Depends only on domain layer (entities, interfaces)
 * - No infrastructure dependencies
 */

import type { Note } from '../../domain/entities/note.js';
import type { INoteRepository } from '../../domain/interfaces/note-repository.interface.js';
import type { IGraphRepository } from '../../domain/interfaces/graph-repository.interface.js';
import type { SimilarityResult } from '../../domain/interfaces/embedding-store.interface.js';

/**
 * Interface for embedding services used by this use case.
 * Both EmbeddingService and VaultEmbeddingService implement this.
 */
export interface IEmbeddingServiceForRecommendations {
  isReady(): boolean;
  findSimilarNotes(
    noteId: string,
    options?: { limit?: number; threshold?: number }
  ): Promise<SimilarityResult[]>;
}

// Request DTO
export interface RecommendNotesRequest {
  sourceNoteId: string;
  maxResults?: number;
  useGraphConnections?: boolean;
  useSemanticSimilarity?: boolean;
  semanticThreshold?: number;
  minScore?: number;
}

// Response DTOs
export interface RecommendationItem {
  noteId: string;
  title: string;
  filePath: string;
  score: number;
  reasons: string[];
  matchedTags?: string[];
}

export interface RecommendNotesResponse {
  success: boolean;
  recommendations: RecommendationItem[];
  sourceNoteId: string;
  error?: string;
}

/**
 * Use case for recommending related notes based on various strategies
 */
export class RecommendNotesUseCase {
  private embeddingService: IEmbeddingServiceForRecommendations | null = null;

  constructor(
    private readonly noteRepository: INoteRepository,
    private readonly graphRepository: IGraphRepository,
  ) {}

  /**
   * Set the embedding service for semantic similarity.
   * Accepts both EmbeddingService and VaultEmbeddingService.
   */
  setEmbeddingService(service: IEmbeddingServiceForRecommendations | null): void {
    this.embeddingService = service;
  }

  async execute(request: RecommendNotesRequest): Promise<RecommendNotesResponse> {
    const {
      sourceNoteId,
      maxResults = 10,
      useGraphConnections = false,
      useSemanticSimilarity = false,
      semanticThreshold = 0.5,
      minScore = 0,
    } = request;

    // Find source note
    const sourceNote = await this.noteRepository.findById(sourceNoteId);
    if (!sourceNote) {
      return {
        success: false,
        recommendations: [],
        sourceNoteId,
        error: 'Source note not found',
      };
    }

    // Collect recommendations from different strategies
    const recommendations: Map<string, RecommendationItem> = new Map();

    // Strategy 1: Tag-based recommendations
    await this.addTagBasedRecommendations(sourceNote, recommendations);

    // Strategy 2: Graph-based recommendations (if enabled)
    if (useGraphConnections) {
      await this.addGraphBasedRecommendations(sourceNote, recommendations);
    }

    // Strategy 3: Semantic similarity (if enabled and service available)
    if (useSemanticSimilarity && this.embeddingService?.isReady()) {
      await this.addSemanticRecommendations(
        sourceNote,
        recommendations,
        semanticThreshold,
        maxResults,
      );
    }

    // Convert to array and sort by score
    const sortedRecommendations = Array.from(recommendations.values())
      .filter((r) => r.noteId !== sourceNoteId) // Exclude source note
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return {
      success: true,
      recommendations: sortedRecommendations,
      sourceNoteId,
    };
  }

  private async addTagBasedRecommendations(
    sourceNote: Note,
    recommendations: Map<string, RecommendationItem>,
  ): Promise<void> {
    const sourceTags = sourceNote.tags;
    if (sourceTags.length === 0) return;

    const relatedNotes = await this.noteRepository.findByTags(sourceTags);

    for (const note of relatedNotes) {
      if (note.id === sourceNote.id) continue;

      const matchedTags = note.tags.filter((tag) => sourceTags.includes(tag));
      const tagScore = matchedTags.length / Math.max(sourceTags.length, 1);

      const existing = recommendations.get(note.id);
      if (existing) {
        // Merge scores and reasons
        existing.score = Math.max(existing.score, tagScore);
        existing.matchedTags = matchedTags;
        if (!existing.reasons.some((r) => r.includes('Shared tags'))) {
          existing.reasons.push(`Shared tags: ${matchedTags.join(', ')}`);
        }
      } else {
        recommendations.set(note.id, {
          noteId: note.id,
          title: note.title,
          filePath: note.filePath,
          score: tagScore,
          reasons: [`Shared tags: ${matchedTags.join(', ')}`],
          matchedTags,
        });
      }
    }
  }

  private async addGraphBasedRecommendations(
    sourceNote: Note,
    recommendations: Map<string, RecommendationItem>,
  ): Promise<void> {
    const connectedNodes = await this.graphRepository.findConnectedNodes(sourceNote.id);

    for (const node of connectedNodes) {
      const note = await this.noteRepository.findById(node.id);
      if (!note || note.id === sourceNote.id) continue;

      const graphScore = 0.8; // Connected nodes get high score

      const existing = recommendations.get(note.id);
      if (existing) {
        existing.score = Math.max(existing.score, graphScore);
        if (!existing.reasons.some((r) => r.includes('Direct link'))) {
          existing.reasons.push('Direct link in knowledge graph');
        }
      } else {
        recommendations.set(note.id, {
          noteId: note.id,
          title: note.title,
          filePath: note.filePath,
          score: graphScore,
          reasons: ['Direct link in knowledge graph'],
        });
      }
    }
  }

  private async addSemanticRecommendations(
    sourceNote: Note,
    recommendations: Map<string, RecommendationItem>,
    threshold: number,
    limit: number,
  ): Promise<void> {
    if (!this.embeddingService) return;

    try {
      const similarNotes = await this.embeddingService.findSimilarNotes(sourceNote.id, {
        limit,
        threshold,
      });

      for (const result of similarNotes) {
        if (result.noteId === sourceNote.id) continue;

        const note = await this.noteRepository.findById(result.noteId);
        if (!note) continue;

        const semanticScore = result.similarity;
        const similarityPercent = Math.round(semanticScore * 100);

        const existing = recommendations.get(note.id);
        if (existing) {
          // Boost score when semantic similarity confirms other signals
          const boostedScore = Math.min(1, existing.score + semanticScore * 0.3);
          existing.score = Math.max(existing.score, boostedScore);
          if (!existing.reasons.some((r) => r.includes('Semantic'))) {
            existing.reasons.push(`Semantic similarity: ${similarityPercent}%`);
          }
        } else {
          recommendations.set(note.id, {
            noteId: note.id,
            title: note.title,
            filePath: note.filePath,
            score: semanticScore,
            reasons: [`Semantic similarity: ${similarityPercent}%`],
          });
        }
      }
    } catch (error) {
      console.error('Semantic recommendation failed:', error);
      // Fail gracefully - other strategies still work
    }
  }
}
