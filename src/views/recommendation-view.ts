/**
 * RecommendationView - Obsidian View for Note Recommendations
 */

import { ItemView, type WorkspaceLeaf, type TFile } from 'obsidian';
import type { RecommendNotesUseCase } from '../core/application/use-cases/recommend-notes.js';
import type { PKMPluginSettings } from '../core/adapters/obsidian/index.js';

export const VIEW_TYPE_RECOMMENDATIONS = 'pkm-recommendations-view';

const NOTE_ID_REGEX = /^(\d{12})/;

export type StatusCallback = (status: 'ready' | 'loading' | 'error' | number) => void;

export class RecommendationView extends ItemView {
  private readonly recommendNotesUseCase: RecommendNotesUseCase;
  private readonly settings: PKMPluginSettings;
  private readonly onStatusChange?: StatusCallback;
  private isLoading = false;

  constructor(
    leaf: WorkspaceLeaf,
    recommendNotesUseCase: RecommendNotesUseCase,
    settings: PKMPluginSettings,
    onStatusChange?: StatusCallback,
  ) {
    super(leaf);
    this.recommendNotesUseCase = recommendNotesUseCase;
    this.settings = settings;
    this.onStatusChange = onStatusChange;
  }

  getViewType(): string {
    return VIEW_TYPE_RECOMMENDATIONS;
  }

  getDisplayText(): string {
    return 'Note Recommendations';
  }

  getIcon(): string {
    return 'lightbulb';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('pkm-recommendations-container');

    const header = container.createEl('div', { cls: 'pkm-recommendations-header' });
    header.createEl('h4', { text: 'Related Notes' });

    const refreshBtn = header.createEl('button', { cls: 'pkm-refresh-btn' });
    refreshBtn.setText('↻');
    refreshBtn.setAttribute('aria-label', 'Refresh recommendations');
    refreshBtn.addEventListener('click', () => this.refresh());

    container.createEl('div', { cls: 'pkm-recommendations-content' });

    await this.refresh();
  }

  async onClose(): Promise<void> {}

  async refresh(): Promise<void> {
    if (this.isLoading) return;

    const contentEl = this.containerEl.querySelector('.pkm-recommendations-content');
    if (!contentEl) return;

    this.isLoading = true;
    this.onStatusChange?.('loading');
    contentEl.empty();

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      this.showMessage(contentEl as HTMLElement, 'No note is currently open');
      this.isLoading = false;
      this.onStatusChange?.('ready');
      return;
    }

    const noteId = this.extractNoteId(activeFile);
    if (!noteId) {
      this.showMessage(contentEl as HTMLElement, 'Current file is not a Zettelkasten note');
      this.isLoading = false;
      this.onStatusChange?.('ready');
      return;
    }

    this.showMessage(contentEl as HTMLElement, 'Loading recommendations...');

    try {
      const response = await this.recommendNotesUseCase.execute({
        sourceNoteId: noteId,
        maxResults: this.settings.maxRecommendations,
        useGraphConnections: this.settings.useGraphConnections,
        useSemanticSimilarity: this.settings.useSemanticSimilarity,
        semanticThreshold: this.settings.llm.semanticThreshold,
        minScore: this.settings.minScore,
      });

      contentEl.empty();

      if (!response.success) {
        this.showMessage(contentEl as HTMLElement, `Error: ${response.error}`);
        this.onStatusChange?.('error');
        return;
      }

      if (response.recommendations.length === 0) {
        this.showMessage(contentEl as HTMLElement, 'No related notes found. Try adding tags to your note.');
        this.onStatusChange?.(0);
        return;
      }

      this.renderRecommendations(contentEl as HTMLElement, response.recommendations);
      this.onStatusChange?.(response.recommendations.length);
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      this.showMessage(contentEl as HTMLElement, 'Failed to load recommendations');
      this.onStatusChange?.('error');
    } finally {
      this.isLoading = false;
    }
  }

  private extractNoteId(file: TFile): string | undefined {
    const match = file.basename.match(NOTE_ID_REGEX);
    return match ? match[1] : undefined;
  }

  private showMessage(container: HTMLElement, message: string): void {
    container.empty();
    const msgEl = container.createEl('div', { cls: 'pkm-recommendations-message' });
    msgEl.setText(message);
  }

  private renderRecommendations(
    container: HTMLElement,
    recommendations: Array<{ noteId: string; title: string; score: number; reasons: string[] }>,
  ): void {
    const listEl = container.createEl('ul', { cls: 'pkm-recommendations-list' });

    for (const rec of recommendations) {
      const itemEl = listEl.createEl('li', { cls: 'pkm-recommendation-item' });
      const headerEl = itemEl.createEl('div', { cls: 'pkm-recommendation-header' });

      const titleEl = headerEl.createEl('a', {
        cls: 'pkm-recommendation-title',
        text: rec.title,
      });
      titleEl.addEventListener('click', () => this.openNote(rec.noteId));

      const scoreEl = headerEl.createEl('span', {
        cls: 'pkm-recommendation-score',
        text: `${Math.round(rec.score * 100)}%`,
      });

      if (rec.score >= 0.7) {
        scoreEl.addClass('pkm-score-high');
      } else if (rec.score >= 0.4) {
        scoreEl.addClass('pkm-score-medium');
      } else {
        scoreEl.addClass('pkm-score-low');
      }

      if (rec.reasons.length > 0) {
        const reasonsEl = itemEl.createEl('div', { cls: 'pkm-recommendation-reasons' });
        for (const reason of rec.reasons) {
          reasonsEl.createEl('span', { cls: 'pkm-recommendation-reason', text: reason });
        }
      }
    }
  }

  private async openNote(noteId: string): Promise<void> {
    const files = this.app.vault.getFiles();
    const file = files.find((f) => f.basename.startsWith(noteId));
    if (file) {
      await this.app.workspace.getLeaf().openFile(file);
    }
  }
}
