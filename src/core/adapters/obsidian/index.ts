/**
 * Obsidian Adapters - Public API
 *
 * Exports all Obsidian-specific adapters for the PKM plugin.
 * These adapters bridge the domain/application layers to Obsidian's APIs.
 *
 * Clean Architecture:
 * - Adapters layer implements domain interfaces
 * - Converts between Obsidian types and domain entities
 * - Handles Obsidian-specific concerns (workspace, vault, commands)
 */

// Vault Adapter (INoteRepository implementation)
export { VaultAdapter } from './vault-adapter.js';

// Command Adapter (ICommandRegistry implementation)
export { CommandAdapter } from './command-adapter.js';

// Settings Adapter
export {
  SettingsAdapter,
  PKMSettingTab,
  DEFAULT_SETTINGS,
} from './settings-adapter.js';
export type {
  PKMPluginSettings,
  ISettingsAdapter,
} from './settings-adapter.js';
