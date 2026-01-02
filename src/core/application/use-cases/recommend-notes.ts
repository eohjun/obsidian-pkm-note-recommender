/**
 * RecommendNotes Use Case
 *
 * Application layer use case for recommending related notes.
 * This use case orchestrates domain entities and repository interfaces
 * to provide note recommendations based on:
 * - Shared tags
 * - Graph connections
 * - Content similarity
 *
 * Clean Architecture:
 * - Depends only on domain layer (entities, interfaces)
 * - No infrastructure dependencies
 */

import type { Note } from '../../domain/entities/note.js';
import type { INoteRepository } from '../../domain/interfaces/note-repository.interface.js';
import type { IGraphRepository } from '../../domain/interfaces/graph-repository.interface.js';

// Request DTO
export interface RecommendNotesRequest {
  sourceNoteId: string;
  maxResults?: number;
  useGraphConnections?: boolean;
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
  constructor(
    private readonly noteRepository: INoteRepository,
    private readonly graphRepository: IGraphRepository,
  ) {}

  async execute(request: RecommendNotesRequest): Promise<RecommendNotesResponse> {
    const { sourceNoteId, maxResults = 10, useGraphConnections = false, minScore = 0 } = request;

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
}
