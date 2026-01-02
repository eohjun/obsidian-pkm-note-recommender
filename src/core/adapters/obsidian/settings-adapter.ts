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

import { PluginSettingTab, Setting, type App, type Plugin } from 'obsidian';

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
  /** Auto-show recommendations when opening a note */
  autoShowRecommendations: boolean;
  /** Show recommendations in sidebar */
  showInSidebar: boolean;
  /** Debug mode - log additional information */
  debugMode: boolean;
}

/**
 * Default plugin settings
 */
export const DEFAULT_SETTINGS: PKMPluginSettings = {
  zettelkastenFolder: '04_Zettelkasten',
  maxRecommendations: 5,
  minScore: 0.3,
  useGraphConnections: true,
  useTagSimilarity: true,
  autoShowRecommendations: false,
  showInSidebar: true,
  debugMode: false,
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
}
