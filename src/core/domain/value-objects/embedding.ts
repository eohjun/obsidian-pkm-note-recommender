/**
 * Embedding Value Object
 *
 * Represents a vector embedding with utility methods for similarity calculation.
 */

/**
 * Embedding - Immutable value object for vector embeddings
 */
export class Embedding {
  private readonly _vector: number[];
  private _magnitude: number | null = null;

  constructor(vector: number[]) {
    if (!vector || vector.length === 0) {
      throw new Error('Embedding vector cannot be empty');
    }
    this._vector = [...vector]; // Immutable copy
  }

  /**
   * Get the embedding vector
   */
  get vector(): number[] {
    return [...this._vector]; // Return copy to maintain immutability
  }

  /**
   * Get the dimension of the embedding
   */
  get dimension(): number {
    return this._vector.length;
  }

  /**
   * Get the magnitude (L2 norm) of the vector
   */
  get magnitude(): number {
    if (this._magnitude === null) {
      this._magnitude = Math.sqrt(
        this._vector.reduce((sum, val) => sum + val * val, 0)
      );
    }
    return this._magnitude;
  }

  /**
   * Calculate cosine similarity with another embedding
   *
   * @param other - The other embedding to compare with
   * @returns Similarity score between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
   */
  cosineSimilarity(other: Embedding): number {
    if (this.dimension !== other.dimension) {
      throw new Error(
        `Embedding dimensions must match: ${this.dimension} vs ${other.dimension}`
      );
    }

    const dotProduct = this._vector.reduce(
      (sum, val, i) => sum + val * other._vector[i],
      0
    );

    const magnitudeProduct = this.magnitude * other.magnitude;

    if (magnitudeProduct === 0) {
      return 0;
    }

    return dotProduct / magnitudeProduct;
  }

  /**
   * Calculate Euclidean distance to another embedding
   */
  euclideanDistance(other: Embedding): number {
    if (this.dimension !== other.dimension) {
      throw new Error(
        `Embedding dimensions must match: ${this.dimension} vs ${other.dimension}`
      );
    }

    const sumSquaredDiff = this._vector.reduce(
      (sum, val, i) => sum + Math.pow(val - other._vector[i], 2),
      0
    );

    return Math.sqrt(sumSquaredDiff);
  }

  /**
   * Normalize the embedding to unit length
   */
  normalize(): Embedding {
    if (this.magnitude === 0) {
      return new Embedding(this._vector);
    }
    return new Embedding(this._vector.map((v) => v / this.magnitude));
  }

  /**
   * Create embedding from raw array
   */
  static fromArray(vector: number[]): Embedding {
    return new Embedding(vector);
  }

  /**
   * Convert to plain array for serialization
   */
  toArray(): number[] {
    return this.vector;
  }

  /**
   * Check equality with another embedding
   */
  equals(other: Embedding): boolean {
    if (this.dimension !== other.dimension) {
      return false;
    }
    return this._vector.every((val, i) => val === other._vector[i]);
  }
}

/**
 * Calculate cosine similarity between two raw vectors
 * Utility function for use without creating Embedding objects
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}
