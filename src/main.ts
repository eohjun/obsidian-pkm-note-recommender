/**
 * PKM Note Recommender - Obsidian Plugin
 *
 * Provides note recommendations based on tags, graph connections, and semantic similarity.
 */

import { Plugin, Notice, type WorkspaceLeaf } from 'obsidian';
import { RecommendNotesUseCase } from './core/application/use-cases/recommend-notes.js';
import { GetNoteContextUseCase } from './core/application/use-cases/get-note-context.js';
import { EmbeddingService } from './core/application/services/embedding-service.js';
import { ConnectionReasonService } from './core/application/services/connection-reason-service.js';
import { AddConnectionUseCase } from './core/application/use-cases/add-connection.js';
import {
  VaultAdapter,
  CommandAdapter,
  SettingsAdapter,
  PKMSettingTab,
  type PKMPluginSettings,
} from './core/adapters/obsidian/index.js';
import { LocalEmbeddingStore } from './core/adapters/storage/local-embedding-store.js';
import { createLLMProvider } from './core/adapters/llm/index.js';
import { RecommendationView, VIEW_TYPE_RECOMMENDATIONS } from './views/recommendation-view.js';

export default class PKMNoteRecommenderPlugin extends Plugin {
  settings!: PKMPluginSettings;

  private vaultAdapter!: VaultAdapter;
  private commandAdapter!: CommandAdapter;
  private settingsAdapter!: SettingsAdapter;
  private recommendNotesUseCase!: RecommendNotesUseCase;
  private getNoteContextUseCase!: GetNoteContextUseCase;
  private embeddingService: EmbeddingService | null = null;
  private embeddingStore: LocalEmbeddingStore | null = null;
  private connectionReasonService!: ConnectionReasonService;
  private addConnectionUseCase: AddConnectionUseCase | null = null;
  private statusBarItem: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.info('Loading PKM Note Recommender plugin');

    await this.initializeSettings();
    this.initializeAdapters();
    this.initializeUseCases();
    await this.initializeEmbeddingService();
    await this.initializeConnectionServices();

    this.registerView(
      VIEW_TYPE_RECOMMENDATIONS,
      (leaf) => new RecommendationView(
        leaf,
        this.recommendNotesUseCase,
        this.settings,
        (status) => this.updateStatusBar(status),
        this.connectionReasonService,
        this.addConnectionUseCase,
      ),
    );

    this.registerCommands();
    this.registerEventHandlers();

    this.addRibbonIcon('lightbulb', 'Show Note Recommendations', () => {
      void this.activateView();
    });

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar('ready');

    this.addSettingTab(new PKMSettingTab(this.app, this, this.settingsAdapter));
  }

  async onunload(): Promise<void> {
    console.info('Unloading PKM Note Recommender plugin');

    // Save connection reason cache before unload
    if (this.connectionReasonService) {
      await this.connectionReasonService.saveCache(this);
    }
  }

  private async initializeSettings(): Promise<void> {
    this.settingsAdapter = new SettingsAdapter(this);
    await this.settingsAdapter.loadSettings();
    this.settings = this.settingsAdapter.getSettings();
  }

  private initializeAdapters(): void {
    this.vaultAdapter = new VaultAdapter(this.app, this.settings.zettelkastenFolder);
    this.commandAdapter = new CommandAdapter(this.app, this);
  }

  private initializeUseCases(): void {
    const nullGraphRepo = {
      findNodeById: async () => null,
      findConnectedNodes: async () => [],
      findNodesByTags: async () => [],
      findNodes: async () => [],
      getAllNodes: async () => [],
      getAllEdges: async () => [],
      getStats: async () => ({
        nodeCount: 0,
        edgeCount: 0,
        averageDegree: 0,
        maxDegree: 0,
        generatedAt: new Date(),
      }),
      saveNode: async () => { throw new Error('NullGraphRepository: Cannot save nodes'); },
      addEdge: async () => false,
      removeEdge: async () => false,
      deleteNode: async () => false,
      nodeExists: async () => false,
      reload: async () => {},
    };

    this.recommendNotesUseCase = new RecommendNotesUseCase(
      this.vaultAdapter,
      nullGraphRepo,
    );

    this.getNoteContextUseCase = new GetNoteContextUseCase(
      this.vaultAdapter,
      nullGraphRepo,
    );
  }

  private async initializeEmbeddingService(): Promise<void> {
    if (!this.settings.useSemanticSimilarity) {
      console.info('Semantic similarity disabled, skipping embedding service initialization');
      return;
    }

    const llmSettings = this.settings.llm;
    const apiKey = this.getApiKeyForProvider();

    if (!apiKey) {
      console.info('No API key configured for LLM provider');
      return;
    }

    try {
      const provider = createLLMProvider(llmSettings.provider, { apiKey });

      this.embeddingStore = new LocalEmbeddingStore(this);
      await this.embeddingStore.initialize();

      this.embeddingService = new EmbeddingService(
        provider,
        this.embeddingStore,
        this.vaultAdapter,
        {
          batchSize: 20,
          similarityThreshold: llmSettings.semanticThreshold,
          maxRecommendations: this.settings.maxRecommendations,
          autoEmbed: llmSettings.autoEmbed,
        },
      );

      // Connect embedding service to use case
      this.recommendNotesUseCase.setEmbeddingService(this.embeddingService);

      console.info(`Embedding service initialized with ${llmSettings.provider} provider`);
    } catch (error) {
      console.error('Failed to initialize embedding service:', error);
    }
  }

  private async initializeConnectionServices(): Promise<void> {
    // Initialize ConnectionReasonService (always create, but provider may be null)
    this.connectionReasonService = new ConnectionReasonService();
    await this.connectionReasonService.loadCache(this);

    // Set LLM provider if configured
    const apiKey = this.getApiKeyForProvider();
    if (apiKey && this.settings.useSemanticSimilarity) {
      try {
        const provider = createLLMProvider(this.settings.llm.provider, { apiKey });
        this.connectionReasonService.setProvider(provider);
        console.info('ConnectionReasonService initialized with LLM provider');
      } catch (error) {
        console.error('Failed to initialize ConnectionReasonService LLM provider:', error);
      }
    }

    // Initialize AddConnectionUseCase
    this.addConnectionUseCase = new AddConnectionUseCase(this.app);
    console.info('AddConnectionUseCase initialized');
  }

  private getApiKeyForProvider(): string {
    switch (this.settings.llm.provider) {
      case 'openai':
        return this.settings.llm.openaiApiKey;
      case 'gemini':
        return this.settings.llm.geminiApiKey;
      case 'anthropic':
        return this.settings.llm.anthropicApiKey;
      default:
        return '';
    }
  }

  /**
   * Reinitialize embedding service when settings change
   */
  async reinitializeEmbeddingService(): Promise<void> {
    this.embeddingService = null;
    this.recommendNotesUseCase.setEmbeddingService(null);
    await this.initializeEmbeddingService();

    // Also reinitialize connection reason service's LLM provider
    const apiKey = this.getApiKeyForProvider();
    if (apiKey && this.settings.useSemanticSimilarity) {
      try {
        const provider = createLLMProvider(this.settings.llm.provider, { apiKey });
        this.connectionReasonService.setProvider(provider);
      } catch (error) {
        console.error('Failed to reinitialize ConnectionReasonService LLM provider:', error);
        this.connectionReasonService.setProvider(null);
      }
    } else {
      this.connectionReasonService.setProvider(null);
    }
  }

  private registerCommands(): void {
    this.addCommand({
      id: 'pkm-show-recommendations',
      name: 'Show note recommendations',
      callback: () => { void this.activateView(); },
    });

    this.addCommand({
      id: 'pkm-refresh-recommendations',
      name: 'Refresh note recommendations',
      callback: () => { this.refreshRecommendations(); },
    });

    this.addCommand({
      id: 'pkm-embed-all-notes',
      name: 'Generate embeddings for all notes',
      callback: () => { void this.embedAllNotes(); },
    });

    this.addCommand({
      id: 'pkm-embed-current-note',
      name: 'Generate embedding for current note',
      callback: () => { void this.embedCurrentNote(); },
    });

    this.addCommand({
      id: 'pkm-clear-embeddings',
      name: 'Clear all embeddings',
      callback: () => { void this.clearEmbeddings(); },
    });

    this.addCommand({
      id: 'pkm-embedding-stats',
      name: 'Show embedding statistics',
      callback: () => { void this.showEmbeddingStats(); },
    });
  }

  private async embedAllNotes(): Promise<void> {
    if (!this.embeddingService) {
      new Notice('Embedding service not configured. Please set up API key in settings.');
      return;
    }

    new Notice('Starting to generate embeddings for all notes...');

    try {
      const result = await this.embeddingService.embedAllNotes((current, total, _message) => {
        this.updateStatusBar(current); // Show progress count
      });

      new Notice(
        `Embeddings complete!\n` +
        `Total: ${result.total}\n` +
        `Embedded: ${result.embedded}\n` +
        `Skipped: ${result.skipped}\n` +
        `Errors: ${result.errors}`,
      );
      this.updateStatusBar('ready');
    } catch (error) {
      console.error('Failed to embed notes:', error);
      new Notice(`Failed to generate embeddings: ${(error as Error).message}`);
      this.updateStatusBar('error');
    }
  }

  private async embedCurrentNote(): Promise<void> {
    if (!this.embeddingService) {
      new Notice('Embedding service not configured. Please set up API key in settings.');
      return;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice('No note is currently open.');
      return;
    }

    if (!this.isValidNoteFile(activeFile.path)) {
      new Notice('Current file is not a Zettelkasten note.');
      return;
    }

    const noteId = activeFile.basename.match(/^(\d{12})/)?.[1];
    if (!noteId) {
      new Notice('Could not extract note ID from filename.');
      return;
    }

    new Notice('Generating embedding for current note...');

    try {
      const content = await this.app.vault.cachedRead(activeFile);
      await this.embeddingService.embedNote(noteId, content, activeFile.path);
      new Notice('Embedding generated successfully!');
    } catch (error) {
      console.error('Failed to embed note:', error);
      new Notice(`Failed to generate embedding: ${(error as Error).message}`);
    }
  }

  private async clearEmbeddings(): Promise<void> {
    if (!this.embeddingService) {
      new Notice('Embedding service not configured.');
      return;
    }

    try {
      await this.embeddingService.clearAllEmbeddings();
      new Notice('All embeddings have been cleared.');
    } catch (error) {
      console.error('Failed to clear embeddings:', error);
      new Notice(`Failed to clear embeddings: ${(error as Error).message}`);
    }
  }

  private async showEmbeddingStats(): Promise<void> {
    if (!this.embeddingService) {
      new Notice('Embedding service not configured. Please set up API key in settings.');
      return;
    }

    try {
      const stats = await this.embeddingService.getStats();
      new Notice(
        `Embedding Statistics:\n` +
        `Provider: ${stats.provider}\n` +
        `Model: ${stats.model}\n` +
        `Total embeddings: ${stats.totalEmbeddings}\n` +
        `Storage size: ${(stats.storageSize / 1024).toFixed(1)}KB`,
      );
    } catch (error) {
      console.error('Failed to get embedding stats:', error);
      new Notice(`Failed to get stats: ${(error as Error).message}`);
    }
  }

  private registerEventHandlers(): void {
    if (this.settings.autoShowRecommendations) {
      this.registerEvent(
        this.app.workspace.on('file-open', (file) => {
          if (file && this.isValidNoteFile(file.path)) {
            this.refreshRecommendations();
          }
        }),
      );
    }

    // Auto-embed notes when created or modified (if enabled)
    if (this.settings.llm.autoEmbed) {
      this.registerEvent(
        this.app.vault.on('create', (file) => {
          if (this.isValidNoteFile(file.path) && this.embeddingService) {
            void this.autoEmbedNote(file.path);
          }
        }),
      );
      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          if (this.isValidNoteFile(file.path) && this.embeddingService) {
            void this.autoEmbedNote(file.path);
          }
        }),
      );
    }
  }

  private async autoEmbedNote(filePath: string): Promise<void> {
    if (!this.embeddingService) return;

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file || !('basename' in file)) return;

    const noteId = (file as { basename: string }).basename.match(/^(\d{12})/)?.[1];
    if (!noteId) return;

    try {
      const content = await this.app.vault.cachedRead(file as import('obsidian').TFile);
      await this.embeddingService.embedNote(noteId, content, filePath);
      if (this.settings.debugMode) {
        console.debug(`Auto-embedded note: ${noteId}`);
      }
    } catch (error) {
      if (this.settings.debugMode) {
        console.error(`Failed to auto-embed note ${noteId}:`, error);
      }
    }
  }

  private isValidNoteFile(path: string): boolean {
    return (
      path.startsWith(this.settings.zettelkastenFolder) &&
      path.endsWith('.md') &&
      /^\d{12}/.test(path.split('/').pop() ?? '')
    );
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_RECOMMENDATIONS);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({ type: VIEW_TYPE_RECOMMENDATIONS, active: true });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
      // Always refresh after revealing to ensure up-to-date recommendations
      this.refreshRecommendations();
    }
  }

  refreshRecommendations(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_RECOMMENDATIONS);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof RecommendationView) {
        void view.refresh();
      }
    }
  }

  updateStatusBar(status: 'ready' | 'loading' | 'error' | number): void {
    if (!this.statusBarItem) return;

    let text: string;
    let tooltip: string;

    switch (status) {
      case 'ready':
        text = '💡 PKM';
        tooltip = 'PKM Note Recommender - Ready';
        break;
      case 'loading':
        text = '💡 ...';
        tooltip = 'PKM Note Recommender - Loading recommendations...';
        break;
      case 'error':
        text = '💡 ⚠️';
        tooltip = 'PKM Note Recommender - Error loading recommendations';
        break;
      default:
        text = `💡 ${status}`;
        tooltip = `PKM Note Recommender - ${status} related notes found`;
        break;
    }

    this.statusBarItem.setText(text);
    this.statusBarItem.setAttribute('aria-label', tooltip);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API for Cross-Plugin Access
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get the embedding service for cross-plugin access.
   * Other plugins can use this to leverage the embedding infrastructure.
   *
   * @example
   * ```typescript
   * const pkmPlugin = this.app.plugins.plugins['pkm-note-recommender'];
   * const embeddingService = pkmPlugin?.getEmbeddingService?.();
   * if (embeddingService) {
   *   const results = await embeddingService.findSimilarToContent('concept text');
   * }
   * ```
   *
   * @returns The EmbeddingService instance or null if not initialized
   */
  public getEmbeddingService(): EmbeddingService | null {
    return this.embeddingService;
  }

  /**
   * Check if the embedding service is available and ready.
   *
   * @returns true if embedding service is initialized and ready
   */
  public isEmbeddingServiceReady(): boolean {
    return this.embeddingService !== null;
  }

  /**
   * Get embedding statistics for external plugins.
   *
   * @returns Embedding stats or null if service not available
   */
  public async getEmbeddingStats(): Promise<{
    provider: string;
    model: string;
    totalEmbeddings: number;
    storageSize: number;
  } | null> {
    if (!this.embeddingService) return null;
    try {
      return await this.embeddingService.getStats();
    } catch {
      return null;
    }
  }
}
