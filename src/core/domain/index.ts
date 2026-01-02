/**
 * Domain Layer - Public API
 *
 * This module exports all domain entities, value objects, and interfaces.
 * The domain layer is the innermost layer containing pure business logic
 * with no external dependencies.
 *
 * Clean Architecture Dependency Rule:
 * - Domain layer has NO imports from application, adapters, or infrastructure
 * - All other layers depend on domain, not the other way around
 */

// Entities
export { Note, InvalidNoteError } from './entities/note.js';
export type { NoteProps } from './entities/note.js';

// Value Objects
export { GraphNode, InvalidGraphNodeError } from './value-objects/graph-node.js';
export type { GraphNodeProps, GraphEdge } from './value-objects/graph-node.js';

export {
  RecommendationResult,
  InvalidRecommendationError,
} from './value-objects/recommendation-result.js';
export type { RecommendationResultProps } from './value-objects/recommendation-result.js';

// Interfaces (Ports)
export type {
  INoteRepository,
  FindNotesOptions,
  PaginatedResult,
} from './interfaces/note-repository.interface.js';

export type {
  IGraphRepository,
  FindGraphNodesOptions,
  GraphStats,
  TraversalOptions,
} from './interfaces/graph-repository.interface.js';

export type {
  IPluginCommand,
  CommandContext,
  CommandResult,
  CommandMetadata,
  ICommandRegistry,
} from './interfaces/plugin-command.interface.js';

export type {
  IRecommendationService,
  RecommendationOptions,
  RecommendationSource,
  BatchRecommendationRequest,
  BatchRecommendationResponse,
} from './interfaces/recommendation-service.interface.js';
