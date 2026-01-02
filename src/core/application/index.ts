/**
 * Application Layer - Public API
 *
 * This module exports all use cases and DTOs.
 * The application layer contains application-specific business rules
 * and orchestrates the flow of data to and from domain entities.
 *
 * Clean Architecture Dependency Rule:
 * - Application layer only imports from domain layer
 * - No imports from adapters or infrastructure
 */

// Use Cases
export {
  RecommendNotesUseCase,
} from './use-cases/recommend-notes.js';

export {
  GetNoteContextUseCase,
} from './use-cases/get-note-context.js';

// DTOs - RecommendNotes
export type {
  RecommendNotesRequest,
  RecommendNotesResponse,
  RecommendationItem,
} from './use-cases/recommend-notes.js';

// DTOs - GetNoteContext
export type {
  GetNoteContextRequest,
  GetNoteContextResponse,
  NoteContext,
  NoteStats,
  NoteStructure,
  GraphConnection,
} from './use-cases/get-note-context.js';
