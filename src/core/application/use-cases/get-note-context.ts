/**
 * GetNoteContext Use Case
 *
 * Application layer use case for extracting comprehensive context from a note.
 * This includes:
 * - Basic metadata (title, tags, path)
 * - Content analysis (word count, headings)
 * - Link extraction (wiki-links)
 * - Graph connections
 *
 * Clean Architecture:
 * - Depends only on domain layer (entities, interfaces)
 * - No infrastructure dependencies
 */

import type { INoteRepository } from '../../domain/interfaces/note-repository.interface.js';
import type { IGraphRepository } from '../../domain/interfaces/graph-repository.interface.js';
import type { GraphNode } from '../../domain/value-objects/graph-node.js';

// Request DTO
export interface GetNoteContextRequest {
  noteId?: string;
  filePath?: string;
  includeLinks?: boolean;
  includeGraphContext?: boolean;
  includeStats?: boolean;
  includeStructure?: boolean;
}

// Response DTOs
export interface NoteStats {
  wordCount: number;
  characterCount: number;
  lineCount: number;
}

export interface NoteStructure {
  headings: { level: number; text: string }[];
}

export interface GraphConnection {
  id: string;
  label: string;
  direction: 'outgoing' | 'incoming';
}

export interface NoteContext {
  noteId: string;
  title: string;
  filePath: string;
  tags: string[];
  content?: string;
  outgoingLinks?: string[];
  graphConnections?: GraphConnection[];
  stats?: NoteStats;
  structure?: NoteStructure;
}

export interface GetNoteContextResponse {
  success: boolean;
  context?: NoteContext;
  error?: string;
}

/**
 * Use case for extracting comprehensive context from a note
 */
export class GetNoteContextUseCase {
  constructor(
    private readonly noteRepository: INoteRepository,
    private readonly graphRepository: IGraphRepository,
  ) {}

  async execute(request: GetNoteContextRequest): Promise<GetNoteContextResponse> {
    const {
      noteId,
      filePath,
      includeLinks = false,
      includeGraphContext = false,
      includeStats = false,
      includeStructure = false,
    } = request;

    // Find note by ID or path
    const note = noteId
      ? await this.noteRepository.findById(noteId)
      : filePath
        ? await this.noteRepository.findByPath(filePath)
        : null;

    if (!note) {
      return {
        success: false,
        error: 'Note not found',
      };
    }

    // Build context
    const context: NoteContext = {
      noteId: note.id,
      title: note.title,
      filePath: note.filePath,
      tags: note.tags,
      content: note.content,
    };

    // Extract links from content
    if (includeLinks && note.content) {
      context.outgoingLinks = this.extractWikiLinks(note.content);
    }

    // Get graph connections
    if (includeGraphContext) {
      context.graphConnections = await this.getGraphConnections(note.id);
    }

    // Calculate stats
    if (includeStats && note.content) {
      context.stats = this.calculateStats(note.content);
    }

    // Extract structure
    if (includeStructure && note.content) {
      context.structure = this.extractStructure(note.content);
    }

    return {
      success: true,
      context,
    };
  }

  private extractWikiLinks(content: string): string[] {
    const wikiLinkPattern = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
    const links: string[] = [];
    let match;

    while ((match = wikiLinkPattern.exec(content)) !== null) {
      const linkTarget = match[1].trim();
      if (linkTarget && !links.includes(linkTarget)) {
        links.push(linkTarget);
      }
    }

    return links;
  }

  private async getGraphConnections(noteId: string): Promise<GraphConnection[]> {
    const connectedNodes = await this.graphRepository.findConnectedNodes(noteId);

    return connectedNodes.map((node: GraphNode) => ({
      id: node.id,
      label: node.label,
      direction: 'outgoing' as const,
    }));
  }

  private calculateStats(content: string): NoteStats {
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter((w) => w.length > 0);

    return {
      wordCount: words.length,
      characterCount: content.length,
      lineCount: lines.length,
    };
  }

  private extractStructure(content: string): NoteStructure {
    const headingPattern = /^(#{1,6})\s+(.+)$/gm;
    const headings: { level: number; text: string }[] = [];
    let match;

    while ((match = headingPattern.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
      });
    }

    return { headings };
  }
}
