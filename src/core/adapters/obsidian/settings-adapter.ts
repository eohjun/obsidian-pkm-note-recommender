/**
 * SettingsAdapter - Obsidian Plugin Settings Management
 *
 * Adapter layer component that manages plugin settings persistence
 * and provides a settings tab UI for the plugin.
 *
 * Clean Architecture:
 * - Adapters layer handles Obsidian-specific settings UI
 * - Settings interface is platform-agnostic
 * - Persists settings using Obsidian's data API
 */

import { PluginSettingTab, Setting, type App, type Plugin, Notice } from 'obsidian';
import type { LLMProviderType } from '../../domain/interfaces/llm-provider.interface.js';
import { LLM_PROVIDERS, validateApiKeyFormat } from '../llm/index.js';

/**
 * LLM Provider settings
 */
export interface LLMSettings {
  /** Selected LLM provider */
  provider: LLMProviderType;
  /** OpenAI API key */
  openaiApiKey: string;
  /** Google Gemini API key */
  geminiApiKey: string;
  /** Anthropic (Voyage AI) API key */
  anthropicApiKey: string;
  /** Auto-embed notes when saved */
  autoEmbed: boolean;
  /** Minimum similarity threshold for semantic recommendations */
  semanticThreshold: number;
}

/**
 * Plugin settings interface - platform agnostic
 */
export interface PKMPluginSettings {
  /** Base folder for Zettelkasten notes */
  zettelkastenFolder: string;
  /** Maximum number of recommendations to show */
  maxRecommendations: number;
  /** Minimum score threshold for recommendations (0-1) */
  minScore: number;
  /** Use graph-based connections for recommendations */
  useGraphConnections: boolean;
  /** Use tag similarity for recommendations */
  useTagSimilarity: boolean;
  /** Use semantic (embedding) similarity for recommendations */
  useSemanticSimilarity: boolean;
  /** Auto-show recommendations when opening a note */
  autoShowRecommendations: boolean;
  /** Show recommendations in sidebar */
  showInSidebar: boolean;
  /** Debug mode - log additional information */
  debugMode: boolean;
  /** LLM settings */
  llm: LLMSettings;
}

/**
 * Default LLM settings
 */
export const DEFAULT_LLM_SETTINGS: LLMSettings = {
  provider: 'openai',
  openaiApiKey: '',
  geminiApiKey: '',
  anthropicApiKey: '',
  autoEmbed: true,
  semanticThreshold: 0.5,
};

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: PKMPluginSettings = {
  zettelkastenFolder: '04_Zettelkasten',
  maxRecommendations: 5,
  minScore: 0.3,
  useGraphConnections: true,
  useTagSimilarity: true,
  useSemanticSimilarity: true,
  autoShowRecommendations: false,
  showInSidebar: true,
  debugMode: false,
  llm: DEFAULT_LLM_SETTINGS,
};

/**
 * Settings adapter interface for dependency injection
 */
export interface ISettingsAdapter {
  getSettings(): PKMPluginSettings;
  updateSettings(partial: Partial<PKMPluginSettings>): Promise<void>;
  resetToDefaults(): Promise<void>;
  loadSettings(): Promise<void>;
}

/**
 * SettingsAdapter - Manages plugin settings with Obsidian integration
 */
export class SettingsAdapter implements ISettingsAdapter {
  private readonly plugin: Plugin;
  private settings: PKMPluginSettings;

  /**
   * Create a new SettingsAdapter
   *
   * @param plugin - Obsidian Plugin instance
   */
  constructor(plugin: Plugin) {
    this.plugin = plugin;
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /**
   * Load settings from Obsidian's data storage
   */
  async loadSettings(): Promise<void> {
    const data = await this.plugin.loadData();
    if (data) {
      this.settings = { ...DEFAULT_SETTINGS, ...data };
    }
  }

  /**
   * Get current settings (returns a copy)
   */
  getSettings(): PKMPluginSettings {
    return { ...this.settings };
  }

  /**
   * Update settings and persist to storage
   */
  async updateSettings(partial: Partial<PKMPluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    await this.plugin.saveData(this.settings);
  }

  /**
   * Reset settings to defaults
   */
  async resetToDefaults(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS };
    await this.plugin.saveData(this.settings);
  }
}

/**
 * PKMSettingTab - Obsidian Settings Tab UI
 *
 * Provides a user interface for configuring plugin settings.
 */
export class PKMSettingTab extends PluginSettingTab {
  private readonly settingsAdapter: ISettingsAdapter;

  /**
   * Create a new PKMSettingTab
   *
   * @param app - Obsidian App instance
   * @param plugin - Obsidian Plugin instance
   * @param settingsAdapter - Settings adapter for managing settings
   */
  constructor(app: App, plugin: Plugin, settingsAdapter: ISettingsAdapter) {
    super(app, plugin);
    this.settingsAdapter = settingsAdapter;
  }

  /**
   * Display the settings tab UI
   */
  display(): void {
    const { containerEl } = this;
    const settings = this.settingsAdapter.getSettings();

    containerEl.empty();

    // Header
    containerEl.createEl('h2', { text: 'PKM Note Recommender Settings' });

    // Folder Settings
    new Setting(containerEl)
      .setName('Zettelkasten folder')
      .setDesc('The folder containing your permanent notes (YYYYMMDDHHMM format)')
      .addText((text) =>
        text
          .setPlaceholder('04_Zettelkasten')
          .setValue(settings.zettelkastenFolder)
          .onChange(async (value) => {
            await this.settingsAdapter.updateSettings({
              zettelkastenFolder: value,
            });
          }),
      );

    // Recommendation Settings
    containerEl.createEl('h3', { text: 'Recommendation Settings' });

    new Setting(containerEl)
      .setName('Maximum recommendations')
      .setDesc('Maximum number of note recommendations to show')
      .addText((text) =>
        text
          .setPlaceholder('5')
          .setValue(String(settings.maxRecommendations))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              await this.settingsAdapter.updateSettings({
                maxRecommendations: num,
              });
            }
          }),
      );

    new Setting(containerEl)
      .setName('Minimum score threshold')
      .setDesc('Only show recommendations above this score (0-100%)')
      .addText((text) =>
        text
          .setPlaceholder('30')
          .setValue(String(Math.round(settings.minScore * 100)))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              await this.settingsAdapter.updateSettings({
                minScore: num / 100,
              });
            }
          }),
      );

    // Algorithm Settings
    containerEl.createEl('h3', { text: 'Algorithm Settings' });

    new Setting(containerEl)
      .setName('Use graph connections')
      .setDesc('Include linked notes in recommendations')
      .addToggle((toggle) =>
        toggle.setValue(settings.useGraphConnections).onChange(async (value) => {
          await this.settingsAdapter.updateSettings({
            useGraphConnections: value,
          });
        }),
      );

    new Setting(containerEl)
      .setName('Use tag similarity')
      .setDesc('Include notes with similar tags in recommendations')
      .addToggle((toggle) =>
        toggle.setValue(settings.useTagSimilarity).onChange(async (value) => {
          await this.settingsAdapter.updateSettings({
            useTagSimilarity: value,
          });
        }),
      );

    new Setting(containerEl)
      .setName('Use semantic similarity')
      .setDesc('Use AI embeddings to find semantically similar notes (requires API key)')
      .addToggle((toggle) =>
        toggle.setValue(settings.useSemanticSimilarity).onChange(async (value) => {
          await this.settingsAdapter.updateSettings({
            useSemanticSimilarity: value,
          });
        }),
      );

    // LLM Settings
    containerEl.createEl('h3', { text: 'AI Provider Settings' });
    containerEl.createEl('p', {
      text: 'Configure your AI provider for semantic note recommendations.',
      cls: 'setting-item-description',
    });

    new Setting(containerEl)
      .setName('AI Provider')
      .setDesc('Select which AI provider to use for generating embeddings')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('openai', 'OpenAI (recommended)')
          .addOption('gemini', 'Google Gemini')
          .addOption('anthropic', 'Anthropic (Voyage AI)')
          .setValue(settings.llm.provider)
          .onChange(async (value) => {
            await this.settingsAdapter.updateSettings({
              llm: { ...settings.llm, provider: value as LLMProviderType },
            });
            this.display(); // Refresh to show relevant API key field
          }),
      );

    // Show API key field for selected provider
    const providerInfo = LLM_PROVIDERS[settings.llm.provider];
    const apiKeyField = this.getApiKeyForProvider(settings);
    const apiKeyName = `${providerInfo.name} API Key`;

    new Setting(containerEl)
      .setName(apiKeyName)
      .setDesc(`Get your API key from: ${providerInfo.docsUrl}`)
      .addText((text) =>
        text
          .setPlaceholder(providerInfo.keyPlaceholder)
          .setValue(apiKeyField)
          .onChange(async (value) => {
            const llmUpdate = { ...settings.llm };
            switch (settings.llm.provider) {
              case 'openai':
                llmUpdate.openaiApiKey = value;
                break;
              case 'gemini':
                llmUpdate.geminiApiKey = value;
                break;
              case 'anthropic':
                llmUpdate.anthropicApiKey = value;
                break;
            }
            await this.settingsAdapter.updateSettings({ llm: llmUpdate });
          }),
      )
      .addButton((button) =>
        button.setButtonText('Test').onClick(async () => {
          // Get fresh settings (not the stale snapshot from display())
          await this.testApiKey();
        }),
      );

    new Setting(containerEl)
      .setName('Auto-embed notes')
      .setDesc('Automatically generate embeddings when notes are created or modified')
      .addToggle((toggle) =>
        toggle.setValue(settings.llm.autoEmbed).onChange(async (value) => {
          await this.settingsAdapter.updateSettings({
            llm: { ...settings.llm, autoEmbed: value },
          });
        }),
      );

    new Setting(containerEl)
      .setName('Semantic similarity threshold')
      .setDesc('Minimum similarity score for semantic recommendations (0-100%)')
      .addText((text) =>
        text
          .setPlaceholder('50')
          .setValue(String(Math.round(settings.llm.semanticThreshold * 100)))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num >= 0 && num <= 100) {
              await this.settingsAdapter.updateSettings({
                llm: { ...settings.llm, semanticThreshold: num / 100 },
              });
            }
          }),
      );

    // Display Settings
    containerEl.createEl('h3', { text: 'Display Settings' });

    new Setting(containerEl)
      .setName('Auto-show recommendations')
      .setDesc('Automatically show recommendations when opening a note')
      .addToggle((toggle) =>
        toggle
          .setValue(settings.autoShowRecommendations)
          .onChange(async (value) => {
            await this.settingsAdapter.updateSettings({
              autoShowRecommendations: value,
            });
          }),
      );

    new Setting(containerEl)
      .setName('Show in sidebar')
      .setDesc('Display recommendations in a sidebar panel')
      .addToggle((toggle) =>
        toggle.setValue(settings.showInSidebar).onChange(async (value) => {
          await this.settingsAdapter.updateSettings({
            showInSidebar: value,
          });
        }),
      );

    // Advanced Settings
    containerEl.createEl('h3', { text: 'Advanced' });

    new Setting(containerEl)
      .setName('Debug mode')
      .setDesc('Log additional debugging information to the console')
      .addToggle((toggle) =>
        toggle.setValue(settings.debugMode).onChange(async (value) => {
          await this.settingsAdapter.updateSettings({
            debugMode: value,
          });
        }),
      );

    // Reset Button
    new Setting(containerEl)
      .setName('Reset to defaults')
      .setDesc('Reset all settings to their default values')
      .addButton((button) =>
        button.setButtonText('Reset').onClick(async () => {
          await this.settingsAdapter.resetToDefaults();
          this.display(); // Refresh the settings display
        }),
      );
  }

  /**
   * Get API key for current provider
   */
  private getApiKeyForProvider(settings: PKMPluginSettings): string {
    switch (settings.llm.provider) {
      case 'openai':
        return settings.llm.openaiApiKey;
      case 'gemini':
        return settings.llm.geminiApiKey;
      case 'anthropic':
        return settings.llm.anthropicApiKey;
      default:
        return '';
    }
  }

  /**
   * Test API key validity
   */
  private async testApiKey(): Promise<void> {
    // Get fresh settings from adapter (not stale snapshot)
    const currentSettings = this.settingsAdapter.getSettings();
    const apiKey = this.getApiKeyForProvider(currentSettings);

    if (!apiKey) {
      new Notice('Please enter an API key first');
      return;
    }

    if (!validateApiKeyFormat(currentSettings.llm.provider, apiKey)) {
      new Notice('API key format looks incorrect');
      return;
    }

    new Notice('Testing API key...');

    try {
      const { createLLMProvider } = await import('../llm/index.js');
      const provider = createLLMProvider(currentSettings.llm.provider, { apiKey });
      const isValid = await provider.validateApiKey();

      if (isValid) {
        new Notice('API key is valid!');
      } else {
        new Notice('API key is invalid. Please check your key.');
      }
    } catch (error) {
      console.error('API key test failed:', error);
      new Notice(`API key test failed: ${(error as Error).message}`);
    }
  }
}
