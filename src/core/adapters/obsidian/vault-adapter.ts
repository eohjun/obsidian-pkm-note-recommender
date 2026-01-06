/**
 * VaultAdapter - Obsidian Vault Implementation of INoteRepository
 *
 * Adapter layer component that bridges Obsidian's Vault API to
 * the domain's INoteRepository interface.
 *
 * Clean Architecture:
 * - Adapters layer can import from domain and application layers
 * - Implements domain interface (INoteRepository)
 * - Converts between Obsidian TFile and domain Note entity
 */

import type { App, TFile, CachedMetadata } from 'obsidian';
import { Note } from '../../domain/entities/note.js';
import type {
  INoteRepository,
  FindNotesOptions,
  PaginatedResult,
} from '../../domain/interfaces/note-repository.interface.js';

/**
 * Generate a hash-based note ID from file path
 * Compatible with Vault Embeddings plugin
 */
function generateNoteId(path: string): string {
  const pathWithoutExt = path.replace(/\.md$/, '');
  return simpleHash(pathWithoutExt);
}

/**
 * Simple hash function for ID generation
 * Must match Vault Embeddings implementation
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * VaultAdapter - Obsidian Vault Implementation of INoteRepository
 *
 * Provides note persistence operations using Obsidian's Vault API.
 */
export class VaultAdapter implements INoteRepository {
  private readonly app: App;
  private readonly basePath: string;

  /**
   * Create a new VaultAdapter
   *
   * @param app - Obsidian App instance
   * @param basePath - Base folder path for notes (e.g., '04_Zettelkasten')
   */
  constructor(app: App, basePath: string) {
    this.app = app;
    this.basePath = basePath;
  }

  /**
   * Find a note by its ID
   */
  async findById(id: string): Promise<Note | null> {
    const file = this.findFileById(id);
    if (!file) return null;

    return this.fileToNote(file);
  }

  /**
   * Find a note by its file path
   */
  async findByPath(filePath: string): Promise<Note | null> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !this.isTFile(file)) return null;

    return this.fileToNote(file);
  }

  /**
   * Find notes that have all specified tags
   */
  async findByTags(tags: string[]): Promise<Note[]> {
    const allNotes = await this.findAll();

    return allNotes.filter((note) => {
      const noteTags = note.tags.map((t) => t.toLowerCase());
      return tags.every((tag) => noteTags.includes(tag.toLowerCase()));
    });
  }

  /**
   * Find all notes in the vault
   */
  async findAll(): Promise<Note[]> {
    const files = this.getNotesInFolder();
    const notes: Note[] = [];

    for (const file of files) {
      const note = await this.fileToNote(file);
      if (note) {
        notes.push(note);
      }
    }

    return notes;
  }

  /**
   * Find notes with pagination and filtering
   */
  async findMany(options?: FindNotesOptions): Promise<PaginatedResult<Note>> {
    let notes = await this.findAll();

    // Apply tag filter
    if (options?.tags && options.tags.length > 0) {
      notes = notes.filter((note) => {
        const noteTags = note.tags.map((t) => t.toLowerCase());
        return options.tags!.some((tag) =>
          noteTags.includes(tag.toLowerCase()),
        );
      });
    }

    // Apply sorting
    if (options?.sortBy) {
      const sortField = options.sortBy;
      const sortOrder = options.sortOrder ?? 'desc';

      notes.sort((a, b) => {
        const aValue = a[sortField as keyof Note];
        const bValue = b[sortField as keyof Note];

        if (aValue === undefined || bValue === undefined) return 0;

        let comparison = 0;
        if (aValue < bValue) comparison = -1;
        if (aValue > bValue) comparison = 1;

        return sortOrder === 'desc' ? -comparison : comparison;
      });
    }

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? notes.length;
    const paginatedNotes = notes.slice(offset, offset + limit);

    return {
      items: paginatedNotes,
      total: notes.length,
      hasMore: offset + limit < notes.length,
    };
  }

  /**
   * Save a note (create or update)
   */
  async save(note: Note): Promise<Note> {
    const existingFile = this.findFileById(note.id);
    const content = this.noteToMarkdown(note);

    if (existingFile) {
      // Update existing note
      await this.app.vault.modify(existingFile, content);
    } else {
      // Create new note
      const filePath =
        note.filePath || `${this.basePath}/${note.id} ${note.title}.md`;
      await this.app.vault.create(filePath, content);
    }

    return note;
  }

  /**
   * Delete a note by ID
   */
  async delete(id: string): Promise<boolean> {
    const file = this.findFileById(id);
    if (!file) return false;

    await this.app.vault.delete(file);
    return true;
  }

  /**
   * Check if a note exists by ID
   */
  async exists(id: string): Promise<boolean> {
    return this.findFileById(id) !== null;
  }

  /**
   * Count total notes
   */
  async count(): Promise<number> {
    return this.getNotesInFolder().length;
  }

  // Private helper methods

  /**
   * Get all markdown files in the configured base folder
   */
  private getNotesInFolder(): TFile[] {
    return this.app.vault
      .getFiles()
      .filter(
        (file) =>
          file.path.startsWith(this.basePath) && file.extension === 'md',
      );
  }

  /**
   * Find a file by note ID (hash-based)
   */
  private findFileById(id: string): TFile | null {
    const files = this.getNotesInFolder();
    return files.find((file) => generateNoteId(file.path) === id) ?? null;
  }

  /**
   * Type guard for TFile
   */
  private isTFile(file: unknown): file is TFile {
    return (
      file !== null &&
      typeof file === 'object' &&
      'path' in file &&
      'extension' in file
    );
  }

  /**
   * Convert Obsidian TFile to domain Note entity
   */
  private async fileToNote(file: TFile): Promise<Note | null> {
    const id = generateNoteId(file.path);
    const content = await this.app.vault.read(file);
    const metadata = this.app.metadataCache.getFileCache(file);
    const tags = this.extractTags(content, metadata);

    try {
      return Note.create({
        id,
        title: file.basename,
        filePath: file.path,
        content,
        tags,
        createdAt: new Date(file.stat.ctime),
        updatedAt: new Date(file.stat.mtime),
      });
    } catch {
      // If Note validation fails, skip this file
      return null;
    }
  }

  /**
   * Extract tags from content and metadata
   */
  private extractTags(
    content: string,
    metadata: CachedMetadata | null,
  ): string[] {
    const tags = new Set<string>();

    // Extract from frontmatter
    if (metadata?.frontmatter?.tags) {
      const fmTags = metadata.frontmatter.tags;
      if (Array.isArray(fmTags)) {
        fmTags.forEach((tag) => tags.add(String(tag).toLowerCase()));
      } else if (typeof fmTags === 'string') {
        tags.add(fmTags.toLowerCase());
      }
    }

    // Extract from metadata cache tags
    if (metadata?.tags) {
      metadata.tags.forEach((tagCache) => {
        const tag = tagCache.tag.replace(/^#/, '').toLowerCase();
        tags.add(tag);
      });
    }

    // Fallback: Parse frontmatter manually if metadata cache is not available
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const tagsMatch = frontmatter.match(/tags:\s*\n((?:\s+-\s+.+\n?)+)/);
      if (tagsMatch) {
        const tagLines = tagsMatch[1].match(/-\s+(.+)/g);
        tagLines?.forEach((line) => {
          const tag = line.replace(/^-\s+/, '').trim().toLowerCase();
          tags.add(tag);
        });
      }
    }

    return Array.from(tags);
  }

  /**
   * Convert domain Note to Markdown content
   */
  private noteToMarkdown(note: Note): string {
    const frontmatter = [
      '---',
      `tags:`,
      ...note.tags.map((tag) => `  - ${tag}`),
      `created: ${note.createdAt?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0]}`,
      '---',
    ].join('\n');

    const body = note.content ?? `# ${note.title}\n\n`;

    return `${frontmatter}\n${body}`;
  }
}
