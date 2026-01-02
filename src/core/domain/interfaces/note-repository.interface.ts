/**
 * Note Repository Interface
 *
 * Domain interface for note persistence operations.
 * Implementations will be in the adapters layer.
 *
 * This is a port (in hexagonal architecture terms) that defines
 * how the domain interacts with external storage.
 */

import type { Note } from '../entities/note.js';

/**
 * Query options for finding notes
 */
export interface FindNotesOptions {
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by file path pattern (glob) */
  pathPattern?: string;
  /** Maximum number of results */
  limit?: number;
  /** Skip first N results */
  offset?: number;
  /** Sort field */
  sortBy?: 'createdAt' | 'updatedAt' | 'title';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Result of a paginated query
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/**
 * Note Repository Interface
 *
 * Defines the contract for note storage operations.
 * Implementations should handle:
 * - File system storage
 * - Database storage
 * - Mock storage (for testing)
 */
export interface INoteRepository {
  /**
   * Find a note by its ID
   * @param id - Note ID (YYYYMMDDHHMM format)
   * @returns Note if found, null otherwise
   */
  findById(id: string): Promise<Note | null>;

  /**
   * Find a note by its file path
   * @param filePath - Full path to the note file
   * @returns Note if found, null otherwise
   */
  findByPath(filePath: string): Promise<Note | null>;

  /**
   * Find notes matching the given criteria
   * @param options - Query options
   * @returns Paginated list of notes
   */
  findMany(options?: FindNotesOptions): Promise<PaginatedResult<Note>>;

  /**
   * Find notes by tags
   * @param tags - Tags to search for (any match)
   * @returns Notes containing any of the specified tags
   */
  findByTags(tags: string[]): Promise<Note[]>;

  /**
   * Get all notes in the repository
   * @returns All notes
   */
  findAll(): Promise<Note[]>;

  /**
   * Save a new note or update an existing one
   * @param note - Note to save
   * @returns Saved note
   */
  save(note: Note): Promise<Note>;

  /**
   * Delete a note by its ID
   * @param id - Note ID to delete
   * @returns true if deleted, false if not found
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if a note exists
   * @param id - Note ID to check
   * @returns true if exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Count total notes matching criteria
   * @param options - Query options (only filter options are used)
   * @returns Total count
   */
  count(options?: Pick<FindNotesOptions, 'tags' | 'pathPattern'>): Promise<number>;
}
