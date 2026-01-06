/**
 * CommandAdapter - Obsidian Command Registration
 *
 * Adapter layer component that bridges domain IPluginCommand to
 * Obsidian's command system.
 *
 * Clean Architecture:
 * - Adapters layer can import from domain and application layers
 * - Converts domain commands to Obsidian commands
 * - Handles command context extraction from Obsidian workspace
 */

import type { App, Plugin, TFile } from 'obsidian';
import type {
  IPluginCommand,
  CommandContext,
  ICommandRegistry,
} from '../../domain/interfaces/plugin-command.interface.js';
import { generateNoteId } from '../../domain/utils/note-id.js';

/**
 * CommandAdapter - Bridges domain commands to Obsidian command system
 *
 * Registers domain IPluginCommand implementations as Obsidian commands
 * and handles context extraction from the workspace.
 */
export class CommandAdapter implements ICommandRegistry {
  private readonly app: App;
  private readonly plugin: Plugin;
  private readonly commands: Map<string, IPluginCommand> = new Map();

  /**
   * Create a new CommandAdapter
   *
   * @param app - Obsidian App instance
   * @param plugin - Obsidian Plugin instance
   */
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }

  /**
   * Register a domain command as an Obsidian command
   */
  register(command: IPluginCommand): void {
    if (this.commands.has(command.id)) {
      console.warn(`Command ${command.id} is already registered`);
      return;
    }

    this.commands.set(command.id, command);

    // Register with Obsidian
    this.plugin.addCommand({
      id: command.id,
      name: command.name,
      checkCallback: (checking: boolean) => {
        const context = this.getCurrentContext();

        if (checking) {
          return command.canExecute(context);
        }

        if (command.canExecute(context)) {
          command.execute(context).catch((error) => {
            console.error(`Command ${command.id} failed:`, error);
          });
        }
      },
    });
  }

  /**
   * Unregister a command
   */
  unregister(commandId: string): void {
    this.commands.delete(commandId);
    // Note: Obsidian doesn't have a built-in way to unregister commands
    // They're automatically cleaned up when the plugin is unloaded
  }

  /**
   * Get a command by ID
   */
  get(commandId: string): IPluginCommand | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Get all registered commands
   */
  getAll(): IPluginCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands filtered by category
   */
  getByCategory(category: string): IPluginCommand[] {
    return this.getAll().filter(
      (cmd) => cmd.getMetadata().category === category,
    );
  }

  /**
   * Register multiple commands at once
   */
  registerAll(commands: IPluginCommand[]): void {
    for (const command of commands) {
      this.register(command);
    }
  }

  /**
   * Get the current execution context from Obsidian workspace
   */
  getCurrentContext(): CommandContext {
    const activeFile = this.app.workspace.getActiveFile();

    return {
      currentNoteId: activeFile ? this.extractNoteId(activeFile) : undefined,
      currentNotePath: activeFile?.path ?? '',
      selection: this.getActiveSelection(),
      metadata: {
        triggeredAt: Date.now(),
        source: 'obsidian-command',
      },
    };
  }

  // Private helper methods

  /**
   * Extract note ID from a file (hash-based, compatible with Vault Embeddings)
   */
  private extractNoteId(file: TFile): string {
    return generateNoteId(file.path);
  }

  /**
   * Get the currently selected text from the active editor
   */
  private getActiveSelection(): string | undefined {
    // Get active view's editor selection
    const activeView = this.app.workspace.getActiveViewOfType(
      // MarkdownView is not available in type declarations, so we use any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.app as any).workspace.constructor.MarkdownView,
    );

    if (activeView && 'editor' in activeView) {
      const editor = (activeView as { editor: { getSelection: () => string } })
        .editor;
      const selection = editor.getSelection();
      return selection || undefined;
    }

    return undefined;
  }
}
