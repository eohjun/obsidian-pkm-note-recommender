/**
 * Graph Repository Interface
 *
 * Domain interface for knowledge graph persistence operations.
 * Implementations will be in the adapters layer.
 */

import type { GraphNode, GraphEdge } from '../value-objects/graph-node.js';

/**
 * Options for querying graph nodes
 */
export interface FindGraphNodesOptions {
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by minimum degree */
  minDegree?: number;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Graph statistics
 */
export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  averageDegree: number;
  maxDegree: number;
  generatedAt: Date;
}

/**
 * Graph traversal options
 */
export interface TraversalOptions {
  /** Maximum depth to traverse */
  maxDepth?: number;
  /** Maximum nodes to visit */
  maxNodes?: number;
  /** Direction of traversal */
  direction?: 'outgoing' | 'incoming' | 'both';
}

/**
 * Graph Repository Interface
 *
 * Defines the contract for knowledge graph storage operations.
 */
export interface IGraphRepository {
  /**
   * Find a node by its ID
   * @param id - Node ID
   * @returns Node if found, null otherwise
   */
  findNodeById(id: string): Promise<GraphNode | null>;

  /**
   * Find nodes connected to a given node
   * @param nodeId - Source node ID
   * @param options - Traversal options
   * @returns Connected nodes
   */
  findConnectedNodes(nodeId: string, options?: TraversalOptions): Promise<GraphNode[]>;

  /**
   * Find nodes by tags
   * @param tags - Tags to search for
   * @returns Nodes with matching tags
   */
  findNodesByTags(tags: string[]): Promise<GraphNode[]>;

  /**
   * Find nodes matching criteria
   * @param options - Query options
   * @returns Matching nodes
   */
  findNodes(options?: FindGraphNodesOptions): Promise<GraphNode[]>;

  /**
   * Get all nodes in the graph
   * @returns All nodes
   */
  getAllNodes(): Promise<GraphNode[]>;

  /**
   * Get all edges in the graph
   * @returns All edges
   */
  getAllEdges(): Promise<GraphEdge[]>;

  /**
   * Get graph statistics
   * @returns Graph statistics
   */
  getStats(): Promise<GraphStats>;

  /**
   * Save a node (create or update)
   * @param node - Node to save
   * @returns Saved node
   */
  saveNode(node: GraphNode): Promise<GraphNode>;

  /**
   * Add an edge between nodes
   * @param edge - Edge to add
   * @returns true if added
   */
  addEdge(edge: GraphEdge): Promise<boolean>;

  /**
   * Remove an edge
   * @param source - Source node ID
   * @param target - Target node ID
   * @returns true if removed
   */
  removeEdge(source: string, target: string): Promise<boolean>;

  /**
   * Delete a node and its edges
   * @param id - Node ID to delete
   * @returns true if deleted
   */
  deleteNode(id: string): Promise<boolean>;

  /**
   * Check if a node exists
   * @param id - Node ID
   * @returns true if exists
   */
  nodeExists(id: string): Promise<boolean>;

  /**
   * Reload the graph from source (file/database)
   */
  reload(): Promise<void>;
}
