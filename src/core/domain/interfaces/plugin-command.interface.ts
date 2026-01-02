/**
 * Plugin Command Interface
 *
 * Domain interface for commands that can be executed in both CLI and Obsidian plugin.
 * This abstraction allows sharing command logic between different platforms.
 *
 * Clean Architecture:
 * - Domain layer interface (no external dependencies)
 * - Implemented by adapters (CLI, Obsidian)
 * - Used by Application layer use cases
 */

/**
 * Context provided when executing a command
 */
export interface CommandContext {
  /** Current note ID in YYYYMMDDHHMM format (optional) */
  currentNoteId?: string;
  /** Path to the current note file */
  currentNotePath: string;
  /** Currently selected text (if any) */
  selection?: string;
  /** Additional metadata for the command execution */
  metadata?: Record<string, unknown>;
}

/**
 * Result of command execution
 */
export interface CommandResult {
  /** Whether the command executed successfully */
  success: boolean;
  /** Human-readable message about the result */
  message?: string;
  /** Error message if success is false */
  error?: string;
  /** Data returned by the command */
  data?: Record<string, unknown>;
}

/**
 * Command metadata for registration and display
 */
export interface CommandMetadata {
  /** Unique command identifier (e.g., 'pkm:recommend-notes') */
  id: string;
  /** Human-readable command name */
  name: string;
  /** Description of what the command does */
  description: string;
  /** Optional keyboard shortcut */
  hotkey?: string;
  /** Optional command category for grouping */
  category?: string;
  /** Optional icon identifier */
  icon?: string;
}

/**
 * Plugin Command Interface
 *
 * Commands are platform-agnostic actions that can be triggered
 * from CLI, Obsidian command palette, or keyboard shortcuts.
 */
export interface IPluginCommand {
  /** Unique command identifier */
  readonly id: string;
  /** Human-readable command name */
  readonly name: string;
  /** Description of what the command does */
  readonly description: string;
  /** Optional keyboard shortcut */
  readonly hotkey?: string;

  /**
   * Execute the command with the given context
   *
   * @param context - Execution context including current note info
   * @returns Promise resolving to command result
   */
  execute(context: CommandContext): Promise<CommandResult>;

  /**
   * Check if the command can be executed in the current context
   *
   * @param context - Current execution context
   * @returns True if command can be executed
   */
  canExecute(context: CommandContext): boolean;

  /**
   * Get command metadata for registration and display
   *
   * @returns Command metadata object
   */
  getMetadata(): CommandMetadata;
}

/**
 * Command registry interface for managing available commands
 */
export interface ICommandRegistry {
  /**
   * Register a command
   *
   * @param command - Command to register
   */
  register(command: IPluginCommand): void;

  /**
   * Unregister a command by ID
   *
   * @param commandId - ID of command to unregister
   */
  unregister(commandId: string): void;

  /**
   * Get a command by ID
   *
   * @param commandId - Command ID to look up
   * @returns Command if found, undefined otherwise
   */
  get(commandId: string): IPluginCommand | undefined;

  /**
   * Get all registered commands
   *
   * @returns Array of all registered commands
   */
  getAll(): IPluginCommand[];

  /**
   * Get commands filtered by category
   *
   * @param category - Category to filter by
   * @returns Commands in the specified category
   */
  getByCategory(category: string): IPluginCommand[];
}
