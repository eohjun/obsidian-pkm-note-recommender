/**
 * PKM Note Recommender - Obsidian Plugin
 *
 * Provides note recommendations based on tags and graph connections.
 */

import { Plugin, type WorkspaceLeaf } from 'obsidian';
import { RecommendNotesUseCase } from './core/application/use-cases/recommend-notes.js';
import { GetNoteContextUseCase } from './core/application/use-cases/get-note-context.js';
import {
  VaultAdapter,
  CommandAdapter,
  SettingsAdapter,
  PKMSettingTab,
  type PKMPluginSettings,
} from './core/adapters/obsidian/index.js';
import { RecommendationView, VIEW_TYPE_RECOMMENDATIONS } from './views/recommendation-view.js';

export default class PKMNoteRecommenderPlugin extends Plugin {
  settings!: PKMPluginSettings;

  private vaultAdapter!: VaultAdapter;
  private commandAdapter!: CommandAdapter;
  private settingsAdapter!: SettingsAdapter;
  private recommendNotesUseCase!: RecommendNotesUseCase;
  private getNoteContextUseCase!: GetNoteContextUseCase;
  private statusBarItem: HTMLElement | null = null;

  async onload(): Promise<void> {
    console.info('Loading PKM Note Recommender plugin');

    await this.initializeSettings();
    this.initializeAdapters();
    this.initializeUseCases();

    this.registerView(
      VIEW_TYPE_RECOMMENDATIONS,
      (leaf) => new RecommendationView(
        leaf,
        this.recommendNotesUseCase,
        this.settings,
        (status) => this.updateStatusBar(status),
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
