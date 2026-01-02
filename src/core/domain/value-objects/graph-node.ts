/**
 * GraphNode Value Object
 *
 * Immutable value object representing a node in the knowledge graph.
 * Value objects are defined by their attributes, not identity.
 *
 * Invariants:
 * - id is required
 * - Node is immutable (all modifications return new instances)
 * - Edge source must match node id
 */

export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
}

export interface GraphNodeProps {
  id: string;
  label: string;
  title?: string;
  notePath?: string;
  tags?: string[];
  degree?: number;
  metadata?: Record<string, unknown>;
}

interface GraphNodeState {
  id: string;
  label: string;
  title?: string;
  notePath?: string;
  tags: string[];
  degree: number;
  metadata?: Record<string, unknown>;
  outgoingEdges: GraphEdge[];
}

export class InvalidGraphNodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidGraphNodeError';
  }
}

export class GraphNode {
  private readonly _state: GraphNodeState;

  private constructor(state: GraphNodeState) {
    this._state = state;
  }

  /**
   * Factory method to create a validated GraphNode
   */
  static create(props: GraphNodeProps): GraphNode {
    GraphNode.validate(props);

    const state: GraphNodeState = {
      id: props.id,
      label: props.label,
      title: props.title,
      notePath: props.notePath,
      tags: props.tags ? [...props.tags] : [],
      degree: props.degree ?? 0,
      metadata: props.metadata ? { ...props.metadata } : undefined,
      outgoingEdges: [],
    };

    return new GraphNode(state);
  }

  /**
   * Create from plain object (deserialization)
   */
  static fromPlainObject(obj: Record<string, unknown>): GraphNode {
    const props: GraphNodeProps = {
      id: obj.id as string,
      label: obj.label as string,
      title: obj.title as string | undefined,
      notePath: obj.notePath as string | undefined,
      tags: obj.tags as string[] | undefined,
      degree: obj.degree as number | undefined,
      metadata: obj.metadata as Record<string, unknown> | undefined,
    };

    return GraphNode.create(props);
  }

  /**
   * Validate node properties
   */
  private static validate(props: GraphNodeProps): void {
    if (!props.id) {
      throw new InvalidGraphNodeError('GraphNode id is required');
    }
  }

  // Getters (return copies to maintain immutability)

  get id(): string {
    return this._state.id;
  }

  get label(): string {
    return this._state.label;
  }

  get title(): string | undefined {
    return this._state.title;
  }

  get notePath(): string | undefined {
    return this._state.notePath;
  }

  get tags(): string[] {
    return [...this._state.tags];
  }

  get degree(): number {
    return this._state.degree;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this._state.metadata ? { ...this._state.metadata } : undefined;
  }

  get outgoingEdges(): GraphEdge[] {
    return this._state.outgoingEdges.map((edge) => ({ ...edge }));
  }

  /**
   * Add an outgoing edge (returns new instance - immutable)
   */
  addEdge(edge: GraphEdge): GraphNode {
    // Validate edge source matches this node
    if (edge.source !== this._state.id) {
      throw new InvalidGraphNodeError('Edge source must match node id');
    }

    // Check for duplicate
    const isDuplicate = this._state.outgoingEdges.some(
      (e) => e.source === edge.source && e.target === edge.target,
    );

    if (isDuplicate) {
      return this; // Return same instance if duplicate
    }

    // Create new state with added edge
    const newState: GraphNodeState = {
      ...this._state,
      tags: [...this._state.tags],
      metadata: this._state.metadata ? { ...this._state.metadata } : undefined,
      outgoingEdges: [...this._state.outgoingEdges, { ...edge }],
    };

    return new GraphNode(newState);
  }

  /**
   * Get IDs of all connected nodes
   */
  getConnectedIds(): string[] {
    return this._state.outgoingEdges.map((edge) => edge.target);
  }

  /**
   * Calculate degree based on current edges
   */
  calculateDegree(): number {
    return this._state.outgoingEdges.length;
  }

  /**
   * Check equality based on ID
   */
  equals(other: GraphNode): boolean {
    return this._state.id === other._state.id;
  }

  /**
   * Convert to plain object for serialization
   */
  toPlainObject(): {
    id: string;
    label: string;
    title: string | undefined;
    notePath: string | undefined;
    tags: string[];
    degree: number;
    metadata: Record<string, unknown> | undefined;
    outgoingEdges: GraphEdge[];
    } {
    return {
      id: this._state.id,
      label: this._state.label,
      title: this._state.title,
      notePath: this._state.notePath,
      tags: [...this._state.tags],
      degree: this._state.degree,
      metadata: this._state.metadata ? { ...this._state.metadata } : undefined,
      outgoingEdges: this._state.outgoingEdges.map((e) => ({ ...e })),
    };
  }
}
