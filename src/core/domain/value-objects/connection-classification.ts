/**
 * ConnectionClassification Value Object
 *
 * Immutable value object representing the classification and reason
 * for a connection between two notes in a Zettelkasten PKM system.
 *
 * Classifications:
 * - 상위 맥락 (Broader Context): Target provides larger framework
 * - 보충 설명 (Supplementary): Target supplements or extends
 * - 적용 사례 (Application): Target shows practical application
 * - 비판 관점 (Critical): Target provides counterargument
 * - 연결 직관 (Intuitive): Deep structural similarity
 */

export type ConnectionClassificationType =
  | '상위 맥락'
  | '보충 설명'
  | '적용 사례'
  | '비판 관점'
  | '연결 직관';

export interface ConnectionClassificationProps {
  classification: ConnectionClassificationType;
  reason: string;
}

export class InvalidConnectionClassificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidConnectionClassificationError';
  }
}

const VALID_CLASSIFICATIONS: ConnectionClassificationType[] = [
  '상위 맥락',
  '보충 설명',
  '적용 사례',
  '비판 관점',
  '연결 직관',
];

export class ConnectionClassification {
  private readonly _classification: ConnectionClassificationType;
  private readonly _reason: string;

  private constructor(
    classification: ConnectionClassificationType,
    reason: string,
  ) {
    this._classification = classification;
    this._reason = reason;
  }

  /**
   * Factory method to create a validated ConnectionClassification
   */
  static create(props: ConnectionClassificationProps): ConnectionClassification {
    ConnectionClassification.validate(props);
    return new ConnectionClassification(
      props.classification,
      props.reason.trim(),
    );
  }

  /**
   * Create with default values for fallback scenarios
   */
  static createDefault(reason?: string): ConnectionClassification {
    return new ConnectionClassification(
      '연결 직관',
      reason?.trim() || '관련 주제로 연결됨',
    );
  }

  /**
   * Validate classification properties
   */
  private static validate(props: ConnectionClassificationProps): void {
    if (!VALID_CLASSIFICATIONS.includes(props.classification)) {
      throw new InvalidConnectionClassificationError(
        `Invalid classification type: ${props.classification}. ` +
        `Valid types are: ${VALID_CLASSIFICATIONS.join(', ')}`,
      );
    }

    if (!props.reason || props.reason.trim().length === 0) {
      throw new InvalidConnectionClassificationError(
        'Reason is required and cannot be empty',
      );
    }

    if (props.reason.length > 300) {
      throw new InvalidConnectionClassificationError(
        'Reason must be 300 characters or less',
      );
    }
  }

  /**
   * Check if a string is a valid classification type
   */
  static isValidClassificationType(value: string): value is ConnectionClassificationType {
    return VALID_CLASSIFICATIONS.includes(value as ConnectionClassificationType);
  }

  /**
   * Get all valid classification types
   */
  static getValidTypes(): readonly ConnectionClassificationType[] {
    return VALID_CLASSIFICATIONS;
  }

  // Getters

  get classification(): ConnectionClassificationType {
    return this._classification;
  }

  get reason(): string {
    return this._reason;
  }

  /**
   * Format for Obsidian markdown:
   * `• 분류 — 사유`
   */
  toMarkdownFormat(): string {
    return `• ${this._classification} — ${this._reason}`;
  }

  /**
   * Format full connection line for "연결된 노트" section:
   * `- [[noteId title]] • 분류 — 사유`
   */
  toConnectionLine(noteId: string, title: string): string {
    return `- [[${noteId} ${title}]] ${this.toMarkdownFormat()}`;
  }

  /**
   * Check equality based on classification and reason
   */
  equals(other: ConnectionClassification): boolean {
    return (
      this._classification === other._classification &&
      this._reason === other._reason
    );
  }

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): ConnectionClassificationProps {
    return {
      classification: this._classification,
      reason: this._reason,
    };
  }

  /**
   * Create from plain object (deserialization)
   */
  static fromPlainObject(obj: ConnectionClassificationProps): ConnectionClassification {
    return ConnectionClassification.create(obj);
  }
}
