/**
 * Model Configs — Re-exports from shared package
 *
 * All model data lives in obsidian-llm-shared.
 * This file provides backward-compatible aliases for this plugin's existing imports.
 */

import {
  type ModelConfig,
  getModelsByProvider,
  getModelConfig,
  isReasoningModel,
  getEffectiveMaxTokens,
  getThinkingConfig,
} from 'obsidian-llm-shared';

// Re-export shared types/functions under names this plugin already uses
export type CompletionModelConfig = ModelConfig;

export const getCompletionModelsByProvider = getModelsByProvider;
export const getCompletionModelConfig = getModelConfig;

export {
  isReasoningModel,
  getEffectiveMaxTokens,
  getThinkingConfig,
};
