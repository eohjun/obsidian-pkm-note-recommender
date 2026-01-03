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

export { Embedding, cosineSimilarity } from './value-objects/embedding.js';

export {
  ConnectionClassification,
  InvalidConnectionClassificationError,
} from './value-objects/connection-classification.js';
export type {
  ConnectionClassificationType,
  ConnectionClassificationProps,
} from './value-objects/connection-classification.js';

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

export type {
  ILLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  EmbeddingRequest,
  EmbeddingResponse,
  BatchEmbeddingRequest,
  BatchEmbeddingResponse,
  TextCompletionRequest,
  TextCompletionResponse,
} from './interfaces/llm-provider.interface.js';

export type {
  IEmbeddingStore,
  StoredEmbedding,
  SimilarityResult,
} from './interfaces/embedding-store.interface.js';

// Errors
export {
  LLMError,
  RateLimitError,
  AuthenticationError,
  TimeoutError,
  ServiceUnavailableError,
  InvalidRequestError,
  normalizeError,
} from './errors/index.js';
