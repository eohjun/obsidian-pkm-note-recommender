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

// Services
export { EmbeddingService } from './services/embedding-service.js';
export type {
  EmbeddingServiceConfig,
  ProgressCallback,
} from './services/embedding-service.js';

export { VaultEmbeddingService } from './services/vault-embedding-service.js';
export type { VaultEmbeddingServiceConfig } from './services/vault-embedding-service.js';

export { ConnectionReasonService } from './services/connection-reason-service.js';
export type { ConnectionReasonResult } from './services/connection-reason-service.js';

// Retry Service
export {
  executeWithRetry,
  withRetry,
  processBatch,
  processBatches,
  isRetryableError,
  DEFAULT_RETRY_OPTIONS,
} from './services/retry-service.js';
export type {
  RetryOptions,
  BatchOptions,
  BatchResult,
  BatchGroupOptions,
  BatchGroupResult,
} from './services/retry-service.js';

// Use Cases - AddConnection
export { AddConnectionUseCase } from './use-cases/add-connection.js';
export type {
  AddConnectionRequest,
  AddConnectionResponse,
} from './use-cases/add-connection.js';
