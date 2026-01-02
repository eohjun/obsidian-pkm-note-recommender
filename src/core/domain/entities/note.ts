/**
 * Note Entity
 *
 * Core domain entity representing a note in the PKM system.
 * This entity is pure business logic with no external dependencies.
 *
 * Invariants:
 * - id must be in YYYYMMDDHHMM format
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

    Note.validateIdFormat(props.id);
  }

  /**
   * Validate ID format: YYYYMMDDHHMM (12 digits)
   */
  private static validateIdFormat(id: string): void {
    // Must be exactly 12 digits
    if (!/^\d{12}$/.test(id)) {
      throw new InvalidNoteError(`Invalid Note ID format: ${id}. Must be YYYYMMDDHHMM (12 digits)`);
    }

    const year = parseInt(id.substring(0, 4), 10);
    const month = parseInt(id.substring(4, 6), 10);
    const day = parseInt(id.substring(6, 8), 10);
    const hour = parseInt(id.substring(8, 10), 10);
    const minute = parseInt(id.substring(10, 12), 10);

    // Validate ranges
    if (year < 1900 || year > 2100) {
      throw new InvalidNoteError(`Invalid year in Note ID: ${year}`);
    }

    if (month < 1 || month > 12) {
      throw new InvalidNoteError(`Invalid month in Note ID: ${month}`);
    }

    if (day < 1 || day > 31) {
      throw new InvalidNoteError(`Invalid day in Note ID: ${day}`);
    }

    if (hour < 0 || hour > 23) {
      throw new InvalidNoteError(`Invalid hour in Note ID: ${hour}`);
    }

    if (minute < 0 || minute > 59) {
      throw new InvalidNoteError(`Invalid minute in Note ID: ${minute}`);
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
