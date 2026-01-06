/**
 * AddConnectionUseCase
 *
 * Handles adding a connection to the current note's "연결된 노트" section.
 * Follows the permanent-note-author format:
 * `- [[noteId title]] • 분류 — 사유`
 */

import type { App, TFile } from 'obsidian';
import type { ConnectionClassificationType } from '../../domain/value-objects/connection-classification.js';

export interface AddConnectionRequest {
  sourceFilePath: string;
  targetNoteId: string;
  targetTitle: string;
  classification: ConnectionClassificationType;
  reason: string;
}

export interface AddConnectionResponse {
  success: boolean;
  message: string;
  alreadyExists?: boolean;
}

const CONNECTED_NOTES_HEADING = '### 🔗 연결된 노트';
const RELATED_TAGS_HEADING = '### 🏷️ 관련 태그';

export class AddConnectionUseCase {
  constructor(private readonly app: App) {}

  /**
   * Execute the use case: add a connection to the source note
   */
  async execute(request: AddConnectionRequest): Promise<AddConnectionResponse> {
    const {
      sourceFilePath,
      targetNoteId,
      targetTitle,
      classification,
      reason,
    } = request;

    // Get the source file
    const file = this.app.vault.getAbstractFileByPath(sourceFilePath);
    if (!file) {
      return {
        success: false,
        message: '소스 노트를 찾을 수 없습니다.',
      };
    }

    // Type guard for TFile
    if (!this.isTFile(file)) {
      return {
        success: false,
        message: '유효한 마크다운 파일이 아닙니다.',
      };
    }

    try {
      // Read current content
      const content = await this.app.vault.read(file);

      // Format the new connection line (use title only, not hash ID)
      const linkText = `[[${targetTitle}]]`;
      const newConnection = `- ${linkText} • ${classification} — ${reason}`;

      // Check if link already exists (by title, not by hash ID)
      if (this.hasExistingLink(content, targetTitle)) {
        return {
          success: false,
          message: '이미 연결된 노트입니다.',
          alreadyExists: true,
        };
      }

      // Find or create the connected notes section and add the connection
      const updatedContent = this.addConnectionToContent(
        content,
        newConnection,
      );

      // Write updated content
      await this.app.vault.modify(file, updatedContent);

      return {
        success: true,
        message: `연결 추가됨: ${targetTitle}`,
      };
    } catch (error) {
      console.error('Failed to add connection:', error);
      return {
        success: false,
        message: `연결 추가 실패: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Type guard to check if file is a TFile
   */
  private isTFile(file: unknown): file is TFile {
    return (
      file !== null &&
      typeof file === 'object' &&
      'path' in file &&
      'basename' in file &&
      'extension' in file
    );
  }

  /**
   * Check if a link to the target note already exists
   */
  private hasExistingLink(content: string, targetTitle: string): boolean {
    // Match [[title]] or [[title|alias]] pattern
    // Escape special regex characters in title
    const escapedTitle = targetTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkPattern = new RegExp(`\\[\\[${escapedTitle}(\\|[^\\]]*)?\\]\\]`);
    return linkPattern.test(content);
  }

  /**
   * Add connection line to the content, handling section creation if needed
   */
  private addConnectionToContent(
    content: string,
    newConnection: string,
  ): string {
    const sectionIndex = content.indexOf(CONNECTED_NOTES_HEADING);

    if (sectionIndex !== -1) {
      // Section exists - find where to insert the new connection
      return this.insertIntoExistingSection(content, sectionIndex, newConnection);
    } else {
      // Section doesn't exist - create it
      return this.createNewSection(content, newConnection);
    }
  }

  /**
   * Insert connection into existing "연결된 노트" section
   */
  private insertIntoExistingSection(
    content: string,
    sectionIndex: number,
    newConnection: string,
  ): string {
    // Find the end of the section (next heading or end of file)
    const afterHeading = sectionIndex + CONNECTED_NOTES_HEADING.length;
    const remainingContent = content.substring(afterHeading);

    // Find next section boundary (## or ### heading)
    const nextSectionMatch = remainingContent.match(/\n(#{2,3}\s)/);
    const sectionEndOffset = nextSectionMatch
      ? afterHeading + nextSectionMatch.index!
      : content.length;

    // Get the section content
    const sectionContent = content.substring(afterHeading, sectionEndOffset);

    // Find the last link line in the section to insert after it
    const linkLines = sectionContent.match(/^- \[\[.+\]\].*$/gm);

    if (linkLines && linkLines.length > 0) {
      // Find the position of the last link line
      const lastLink = linkLines[linkLines.length - 1];
      const lastLinkIndex = content.lastIndexOf(lastLink, sectionEndOffset);
      const insertPosition = lastLinkIndex + lastLink.length;

      return (
        content.substring(0, insertPosition) +
        '\n' +
        newConnection +
        content.substring(insertPosition)
      );
    } else {
      // No existing links - insert right after heading with proper spacing
      const insertPosition = afterHeading;
      const existingSpacing = sectionContent.match(/^\n*/)?.[0] || '';
      const needsNewline = !existingSpacing.includes('\n\n');

      return (
        content.substring(0, insertPosition) +
        (needsNewline ? '\n\n' : '\n') +
        newConnection +
        content.substring(insertPosition).replace(/^\n+/, '\n')
      );
    }
  }

  /**
   * Create new "연결된 노트" section
   */
  private createNewSection(content: string, newConnection: string): string {
    // Try to insert before "관련 태그" section if it exists
    const tagSectionIndex = content.indexOf(RELATED_TAGS_HEADING);

    if (tagSectionIndex !== -1) {
      // Insert before tags section
      const beforeTags = content.substring(0, tagSectionIndex).trimEnd();
      const afterTags = content.substring(tagSectionIndex);

      return (
        beforeTags +
        '\n\n' +
        CONNECTED_NOTES_HEADING +
        '\n\n' +
        newConnection +
        '\n\n' +
        afterTags
      );
    }

    // Try to insert before horizontal rule if it exists at the end
    const hrMatch = content.match(/\n---\s*$/);
    if (hrMatch) {
      const beforeHr = content.substring(0, hrMatch.index!).trimEnd();
      return (
        beforeHr +
        '\n\n' +
        CONNECTED_NOTES_HEADING +
        '\n\n' +
        newConnection +
        '\n\n---\n'
      );
    }

    // Append at the end
    return (
      content.trimEnd() +
      '\n\n' +
      CONNECTED_NOTES_HEADING +
      '\n\n' +
      newConnection +
      '\n'
    );
  }
}
