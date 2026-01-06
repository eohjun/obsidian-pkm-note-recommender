/**
 * RecommendationView - Obsidian View for Note Recommendations
 *
 * Enhanced with:
 * - Connection classification and reason display (LLM-generated)
 * - Add connection button (+) for each recommendation
 */

import { ItemView, Notice, type WorkspaceLeaf, type TFile } from 'obsidian';
import type {
  RecommendNotesUseCase,
  RecommendationItem,
} from '../core/application/use-cases/recommend-notes.js';
import type { ConnectionReasonService, ConnectionReasonResult } from '../core/application/services/connection-reason-service.js';
import type { AddConnectionUseCase } from '../core/application/use-cases/add-connection.js';
import type { PKMPluginSettings } from '../core/adapters/obsidian/index.js';
import type { ConnectionClassificationType } from '../core/domain/value-objects/connection-classification.js';
import { generateNoteId } from '../core/domain/utils/note-id.js';

export const VIEW_TYPE_RECOMMENDATIONS = 'pkm-recommendations-view';

export type StatusCallback = (status: 'ready' | 'loading' | 'error' | number) => void;

type ConnectionStatus = 'pending' | 'loading' | 'ready' | 'error';

interface EnhancedRecommendation extends RecommendationItem {
  connection?: ConnectionReasonResult;
  connectionStatus: ConnectionStatus;
  isAdded: boolean;
}

interface ViewState {
  sourceNoteId: string | null;
  sourceFilePath: string | null;
  sourceTitle: string | null;
  sourceContent: string | null;
  recommendations: EnhancedRecommendation[];
}

export class RecommendationView extends ItemView {
  private readonly recommendNotesUseCase: RecommendNotesUseCase;
  private readonly connectionReasonService: ConnectionReasonService | null;
  private readonly addConnectionUseCase: AddConnectionUseCase | null;
  private readonly settings: PKMPluginSettings;
  private readonly onStatusChange?: StatusCallback;
  private isLoading = false;

  private state: ViewState = {
    sourceNoteId: null,
    sourceFilePath: null,
    sourceTitle: null,
    sourceContent: null,
    recommendations: [],
  };

  constructor(
    leaf: WorkspaceLeaf,
    recommendNotesUseCase: RecommendNotesUseCase,
    settings: PKMPluginSettings,
    onStatusChange?: StatusCallback,
    connectionReasonService?: ConnectionReasonService | null,
    addConnectionUseCase?: AddConnectionUseCase | null,
  ) {
    super(leaf);
    this.recommendNotesUseCase = recommendNotesUseCase;
    this.settings = settings;
    this.onStatusChange = onStatusChange;
    this.connectionReasonService = connectionReasonService ?? null;
    this.addConnectionUseCase = addConnectionUseCase ?? null;
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

    // Store source note info
    try {
      const sourceContent = await this.app.vault.cachedRead(activeFile);
      this.state.sourceNoteId = noteId;
      this.state.sourceFilePath = activeFile.path;
      this.state.sourceTitle = activeFile.basename;
      this.state.sourceContent = sourceContent;
    } catch {
      this.showMessage(contentEl as HTMLElement, 'Failed to read current note');
      this.isLoading = false;
      this.onStatusChange?.('error');
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
        this.showMessage(contentEl as HTMLElement, 'No related notes found.');
        this.onStatusChange?.(0);
        return;
      }

      // Convert to enhanced recommendations
      this.state.recommendations = response.recommendations.map((rec) => ({
        ...rec,
        connectionStatus: 'pending' as ConnectionStatus,
        isAdded: false,
      }));

      this.renderRecommendations(contentEl as HTMLElement);
      this.onStatusChange?.(response.recommendations.length);

      // Start loading connection reasons in background
      if (this.connectionReasonService?.isReady()) {
        void this.loadConnectionReasons();
      }
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      this.showMessage(contentEl as HTMLElement, 'Failed to load recommendations');
      this.onStatusChange?.('error');
    } finally {
      this.isLoading = false;
    }
  }

  private extractNoteId(file: TFile): string {
    return generateNoteId(file.path);
  }

  private showMessage(container: HTMLElement, message: string): void {
    container.empty();
    const msgEl = container.createEl('div', { cls: 'pkm-recommendations-message' });
    msgEl.setText(message);
  }

  /**
   * Load connection reasons for all recommendations asynchronously
   */
  private async loadConnectionReasons(): Promise<void> {
    if (!this.connectionReasonService || !this.state.sourceContent) return;

    for (let i = 0; i < this.state.recommendations.length; i++) {
      const rec = this.state.recommendations[i];

      // Check cache first
      const cached = this.connectionReasonService.getCachedReason(
        this.state.sourceNoteId!,
        rec.noteId,
      );

      if (cached) {
        this.state.recommendations[i] = {
          ...rec,
          connection: cached,
          connectionStatus: 'ready',
        };
        this.updateItemUI(i);
        continue;
      }

      // Mark as loading
      this.state.recommendations[i] = { ...rec, connectionStatus: 'loading' };
      this.updateItemUI(i);

      try {
        // Load target note content
        const targetContent = await this.loadNoteContent(rec.noteId);
        if (!targetContent) {
          this.state.recommendations[i] = { ...rec, connectionStatus: 'error' };
          this.updateItemUI(i);
          continue;
        }

        const result = await this.connectionReasonService.generateConnectionReason(
          this.state.sourceNoteId!,
          this.state.sourceTitle!,
          this.state.sourceContent!,
          rec.noteId,
          rec.title,
          targetContent,
        );

        this.state.recommendations[i] = {
          ...rec,
          connection: result,
          connectionStatus: 'ready',
        };
        this.updateItemUI(i);
      } catch (error) {
        console.error(`Failed to load connection reason for ${rec.noteId}:`, error);
        this.state.recommendations[i] = { ...rec, connectionStatus: 'error' };
        this.updateItemUI(i);
      }
    }
  }

  private async loadNoteContent(noteId: string): Promise<string | null> {
    const files = this.app.vault.getFiles();
    const file = files.find((f) => f.basename.startsWith(noteId));
    if (!file) return null;

    try {
      return await this.app.vault.cachedRead(file);
    } catch {
      return null;
    }
  }

  private renderRecommendations(container: HTMLElement): void {
    const listEl = container.createEl('ul', { cls: 'pkm-recommendations-list' });

    for (let i = 0; i < this.state.recommendations.length; i++) {
      this.renderRecommendationItem(listEl, i);
    }
  }

  private renderRecommendationItem(listEl: HTMLElement, index: number): void {
    const rec = this.state.recommendations[index];
    const itemEl = listEl.createEl('li', {
      cls: 'pkm-recommendation-item',
      attr: { 'data-index': index.toString() },
    });

    // Header row: title + score + add button
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
    this.applyScoreStyle(scoreEl, rec.score);

    // Add connection button
    if (this.addConnectionUseCase) {
      const addBtn = headerEl.createEl('button', {
        cls: rec.isAdded ? 'pkm-add-connection-btn pkm-add-btn-disabled' : 'pkm-add-connection-btn',
        text: rec.isAdded ? '✓' : '+',
        attr: {
          'aria-label': '연결 추가',
          'data-index': index.toString(),
        },
      });

      if (rec.isAdded) {
        addBtn.disabled = true;
      } else {
        addBtn.addEventListener('click', () => this.handleAddConnection(index));
      }
    }

    // Connection classification row
    const connectionEl = itemEl.createEl('div', { cls: 'pkm-recommendation-connection' });
    this.renderConnectionStatus(connectionEl, rec);

    // Original reasons row (shown when connection is not ready)
    if (rec.reasons.length > 0 && rec.connectionStatus !== 'ready') {
      const reasonsEl = itemEl.createEl('div', { cls: 'pkm-recommendation-reasons' });
      for (const reason of rec.reasons) {
        reasonsEl.createEl('span', { cls: 'pkm-recommendation-reason', text: reason });
      }
    }
  }

  private renderConnectionStatus(container: HTMLElement, rec: EnhancedRecommendation): void {
    container.empty();

    switch (rec.connectionStatus) {
      case 'loading':
        container.addClass('pkm-connection-loading');
        container.createEl('span', {
          cls: 'pkm-connection-spinner',
          text: '분석 중...',
        });
        break;

      case 'ready':
        container.removeClass('pkm-connection-loading');
        if (rec.connection) {
          container.createEl('span', {
            cls: `pkm-classification-badge pkm-classification-${this.getClassificationClass(rec.connection.classification)}`,
            text: rec.connection.classification,
          });
          container.createEl('span', {
            cls: 'pkm-connection-reason-text',
            text: rec.connection.reason,
          });
        }
        break;

      case 'error':
        container.removeClass('pkm-connection-loading');
        container.createEl('span', {
          cls: 'pkm-connection-error',
          text: '분류 실패',
        });
        break;

      case 'pending':
        // Show nothing while pending
        break;
    }
  }

  private getClassificationClass(classification: ConnectionClassificationType): string {
    const classMap: Record<ConnectionClassificationType, string> = {
      '상위 맥락': 'context',
      '보충 설명': 'supplementary',
      '적용 사례': 'application',
      '비판 관점': 'critical',
      '연결 직관': 'intuitive',
    };
    return classMap[classification] || 'default';
  }

  private updateItemUI(index: number): void {
    const itemEl = this.containerEl.querySelector(`[data-index="${index}"]`);
    if (!itemEl) return;

    const rec = this.state.recommendations[index];

    // Update connection status
    const connectionEl = itemEl.querySelector('.pkm-recommendation-connection');
    if (connectionEl) {
      this.renderConnectionStatus(connectionEl as HTMLElement, rec);
    }

    // Update add button if needed
    const addBtn = itemEl.querySelector('.pkm-add-connection-btn') as HTMLButtonElement | null;
    if (addBtn && rec.isAdded) {
      addBtn.disabled = true;
      addBtn.addClass('pkm-add-btn-disabled');
      addBtn.setText('✓');
    }

    // Hide original reasons if connection is ready
    const reasonsEl = itemEl.querySelector('.pkm-recommendation-reasons');
    if (reasonsEl && rec.connectionStatus === 'ready') {
      reasonsEl.addClass('pkm-reasons-hidden');
    }
  }

  private async handleAddConnection(index: number): Promise<void> {
    if (!this.addConnectionUseCase || !this.state.sourceFilePath) {
      new Notice('연결 추가 기능을 사용할 수 없습니다.');
      return;
    }

    const rec = this.state.recommendations[index];

    // Use generated connection or default
    const classification = rec.connection?.classification ?? '연결 직관';
    const reason = rec.connection?.reason ?? '관련 주제로 연결됨';

    try {
      const result = await this.addConnectionUseCase.execute({
        sourceFilePath: this.state.sourceFilePath,
        targetNoteId: rec.noteId,
        targetTitle: rec.title,
        classification,
        reason,
      });

      if (result.success) {
        new Notice(result.message);
        // Mark as added
        this.state.recommendations[index] = { ...rec, isAdded: true };
        this.updateItemUI(index);
      } else {
        new Notice(result.message);
      }
    } catch (error) {
      console.error('Failed to add connection:', error);
      new Notice('연결 추가 실패');
    }
  }

  private applyScoreStyle(el: HTMLElement, score: number): void {
    if (score >= 0.7) {
      el.addClass('pkm-score-high');
    } else if (score >= 0.4) {
      el.addClass('pkm-score-medium');
    } else {
      el.addClass('pkm-score-low');
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
