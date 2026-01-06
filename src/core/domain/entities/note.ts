/**
 * Note Entity
 *
 * Core domain entity representing a note in the PKM system.
 * This entity is pure business logic with no external dependencies.
 *
 * Invariants:
 * - id is a hash of the file path (compatible with Vault Embeddings)
 * - title and filePath are required
 * - tags are normalized (lowercase, trimmed, deduplicated)
 */

export interface NoteProps {
  id: string;
  title: string;
  filePath: string;
  content?: string;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class InvalidNoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidNoteError';
  }
}

export class Note {
  private readonly _id: string;
  private readonly _title: string;
  private readonly _filePath: string;
  private readonly _content: string | undefined;
  private readonly _tags: string[];
  private readonly _createdAt: Date | undefined;
  private readonly _updatedAt: Date | undefined;

  private constructor(props: NoteProps) {
    this._id = props.id;
    this._title = props.title;
    this._filePath = props.filePath;
    this._content = props.content;
    this._tags = this.normalizeTags(props.tags);
    this._createdAt = props.createdAt;
    this._updatedAt = props.updatedAt;
  }

  /**
   * Factory method to create a validated Note
   */
  static create(props: NoteProps): Note {
    Note.validate(props);
    return new Note(props);
  }

  /**
   * Validate note properties
   */
  private static validate(props: NoteProps): void {
    if (!props.id) {
      throw new InvalidNoteError('Note id is required');
    }

    if (!props.title) {
      throw new InvalidNoteError('Note title is required');
    }

    if (!props.filePath) {
      throw new InvalidNoteError('Note filePath is required');
    }
  }

  /**
   * Normalize tags:
   * - Lowercase
   * - Trim whitespace
   * - Remove hash prefix
   * - Remove empty strings
   * - Deduplicate
   */
  private normalizeTags(tags: string[] | undefined): string[] {
    if (!tags) {
      return [];
    }

    const normalized = tags
      .map((tag) => tag.trim().toLowerCase().replace(/^#+/, ''))
      .filter((tag) => tag.length > 0);

    // Deduplicate while preserving order
    return [...new Set(normalized)];
  }

  // Getters (return copies to maintain immutability)

  get id(): string {
    return this._id;
  }

  get title(): string {
    return this._title;
  }

  get filePath(): string {
    return this._filePath;
  }

  get content(): string | undefined {
    return this._content;
  }

  get tags(): string[] {
    return [...this._tags]; // Return copy
  }

  get createdAt(): Date | undefined {
    return this._createdAt;
  }

  get updatedAt(): Date | undefined {
    return this._updatedAt;
  }

  /**
   * Check equality based on ID
   */
  equals(other: Note): boolean {
    return this._id === other._id;
  }

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): NoteProps {
    return {
      id: this._id,
      title: this._title,
      filePath: this._filePath,
      content: this._content,
      tags: [...this._tags],
      createdAt: this._createdAt,
      updatedAt: this._updatedAt,
    };
  }
}
