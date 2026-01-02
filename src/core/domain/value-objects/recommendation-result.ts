/**
 * RecommendationResult Value Object
 *
 * Immutable value object representing a note recommendation result.
 * Value objects are defined by their attributes, not identity.
 *
 * Invariants:
 * - noteId and noteTitle are required
 * - score must be between 0 and 1 (inclusive)
 * - reasons are normalized (trimmed, empty strings removed)
 * - Object is immutable (all modifications return new instances)
 */

export interface RecommendationResultProps {
  noteId: string;
  noteTitle: string;
  score: number;
  reasons?: string[];
  metadata?: Record<string, unknown>;
}

interface RecommendationResultState {
  noteId: string;
  noteTitle: string;
  score: number;
  reasons: string[];
  metadata?: Record<string, unknown>;
}

export class InvalidRecommendationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRecommendationError';
  }
}

export class RecommendationResult {
  private readonly _state: RecommendationResultState;

  private constructor(state: RecommendationResultState) {
    this._state = state;
  }

  /**
   * Factory method to create a validated RecommendationResult
   */
  static create(props: RecommendationResultProps): RecommendationResult {
    RecommendationResult.validate(props);

    const state: RecommendationResultState = {
      noteId: props.noteId,
      noteTitle: props.noteTitle,
      score: props.score,
      reasons: RecommendationResult.normalizeReasons(props.reasons),
      metadata: props.metadata ? { ...props.metadata } : undefined,
    };

    return new RecommendationResult(state);
  }

  /**
   * Create from plain object (deserialization)
   */
  static fromPlainObject(
    obj: Record<string, unknown>,
  ): RecommendationResult {
    const props: RecommendationResultProps = {
      noteId: obj.noteId as string,
      noteTitle: obj.noteTitle as string,
      score: obj.score as number,
      reasons: obj.reasons as string[] | undefined,
      metadata: obj.metadata as Record<string, unknown> | undefined,
    };

    return RecommendationResult.create(props);
  }

  /**
   * Validate recommendation properties
   */
  private static validate(props: RecommendationResultProps): void {
    if (!props.noteId) {
      throw new InvalidRecommendationError('noteId is required');
    }

    if (!props.noteTitle) {
      throw new InvalidRecommendationError('noteTitle is required');
    }

    if (props.score < 0 || props.score > 1) {
      throw new InvalidRecommendationError(
        'Score must be between 0 and 1',
      );
    }
  }

  /**
   * Normalize reasons:
   * - Trim whitespace
   * - Remove empty strings
   */
  private static normalizeReasons(reasons: string[] | undefined): string[] {
    if (!reasons) {
      return [];
    }

    return reasons
      .map((reason) => reason.trim())
      .filter((reason) => reason.length > 0);
  }

  // Getters (return copies to maintain immutability)

  get noteId(): string {
    return this._state.noteId;
  }

  get noteTitle(): string {
    return this._state.noteTitle;
  }

  get score(): number {
    return this._state.score;
  }

  get reasons(): string[] {
    return [...this._state.reasons];
  }

  get metadata(): Record<string, unknown> | undefined {
    return this._state.metadata ? { ...this._state.metadata } : undefined;
  }

  // Computed properties

  /**
   * Get score as formatted percentage string
   */
  get scorePercentage(): string {
    return `${Math.round(this._state.score * 100)}%`;
  }

  /**
   * Check if this is a strong recommendation (score >= 0.7)
   */
  get isStrong(): boolean {
    return this._state.score >= 0.7;
  }

  /**
   * Check equality based on noteId and score
   */
  equals(other: RecommendationResult): boolean {
    return (
      this._state.noteId === other._state.noteId &&
      this._state.score === other._state.score
    );
  }

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): RecommendationResultProps {
    return {
      noteId: this._state.noteId,
      noteTitle: this._state.noteTitle,
      score: this._state.score,
      reasons: [...this._state.reasons],
      metadata: this._state.metadata ? { ...this._state.metadata } : undefined,
    };
  }
}
