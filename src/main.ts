/**
 * PKM Note Recommender - Obsidian Plugin
 *
 * Provides note recommendations based on tags, graph connections, and semantic similarity.
 */

import { Plugin, Notice, type WorkspaceLeaf } from 'obsidian';
import { RecommendNotesUseCase } from './core/application/use-cases/recommend-notes.js';
import { GetNoteContextUseCase } from './core/application/use-cases/get-note-context.js';
import { VaultEmbeddingService } from './core/application/services/vault-embedding-service.js';
import { ConnectionReasonService } from './core/application/services/connection-reason-service.js';
import { AddConnectionUseCase } from './core/application/use-cases/add-connection.js';
import {
  VaultAdapter,
  CommandAdapter,
  SettingsAdapter,
  PKMSettingTab,
  type PKMPluginSettings,
} from './core/adapters/obsidian/index.js';
import { VaultEmbeddingsReader } from './core/adapters/storage/vault-embeddings-reader.js';
import { createLLMProvider } from './core/adapters/llm/index.js';
import { RecommendationView, VIEW_TYPE_RECOMMENDATIONS } from './views/recommendation-view.js';

export default class PKMNoteRecommenderPlugin extends Plugin {
  settings!: PKMPluginSettings;

  private vaultAdapter!: VaultAdapter;
  private commandAdapter!: CommandAdapter;
  private settingsAdapter!: SettingsAdapter;
  private recommendNotesUseCase!: RecommendNotesUseCase;
  private getNoteContextUseCase!: GetNoteContextUseCase;
  private vaultEmbeddingsReader: VaultEmbeddingsReader | null = null;
  private vaultEmbeddingService: VaultEmbeddingService | null = null;
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

    try {
      // Use shared Vault Embeddings data (from 09_Embedded/ folder)
      this.vaultEmbeddingsReader = new VaultEmbeddingsReader(this.app, {
        storagePath: '09_Embedded',
        embeddingsFolder: 'embeddings',
      });
      await this.vaultEmbeddingsReader.initialize();

      if (!this.vaultEmbeddingsReader.isAvailable()) {
        console.warn('Vault Embeddings not available. Install Vault Embeddings plugin and run "Embed All Notes".');
        return;
      }

      this.vaultEmbeddingService = new VaultEmbeddingService(
        this.vaultEmbeddingsReader,
        {
          similarityThreshold: this.settings.llm.semanticThreshold,
          maxRecommendations: this.settings.maxRecommendations,
        },
      );

      // Connect embedding service to use case
      this.recommendNotesUseCase.setEmbeddingService(this.vaultEmbeddingService);

      const stats = await this.vaultEmbeddingService.getStats();
      console.info(`Vault Embedding service initialized: ${stats.totalEmbeddings} embeddings from ${stats.model}`);
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
    this.vaultEmbeddingService = null;
    this.vaultEmbeddingsReader = null;
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
      id: 'pkm-refresh-embeddings',
      name: 'Refresh embeddings from Vault Embeddings',
      callback: () => { void this.refreshEmbeddings(); },
    });

    this.addCommand({
      id: 'pkm-embedding-stats',
      name: 'Show embedding statistics',
      callback: () => { void this.showEmbeddingStats(); },
    });
  }

  private async refreshEmbeddings(): Promise<void> {
    if (!this.vaultEmbeddingService) {
      new Notice('Vault Embeddings not available. Install Vault Embeddings plugin first.');
      return;
    }

    try {
      await this.vaultEmbeddingService.refresh();
      const stats = await this.vaultEmbeddingService.getStats();
      new Notice(`Embeddings refreshed: ${stats.totalEmbeddings} embeddings loaded`);
    } catch (error) {
      console.error('Failed to refresh embeddings:', error);
      new Notice(`Failed to refresh embeddings: ${(error as Error).message}`);
    }
  }

  private async showEmbeddingStats(): Promise<void> {
    if (!this.vaultEmbeddingService) {
      new Notice('Vault Embeddings not available. Install Vault Embeddings plugin first.');
      return;
    }

    try {
      const stats = await this.vaultEmbeddingService.getStats();
      new Notice(
        `Embedding Statistics (from Vault Embeddings):\n` +
        `Source: ${stats.provider}\n` +
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

    // Note: Auto-embedding is handled by the Vault Embeddings plugin.
    // PKM Note Recommender only consumes the shared embeddings.
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

}
