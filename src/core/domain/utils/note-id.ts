/**
 * Note ID Generation Utilities
 *
 * Generates hash-based note IDs compatible with Vault Embeddings plugin.
 * All components should use these functions to ensure ID consistency.
 */

/**
 * Simple hash function for ID generation.
 * Must match Vault Embeddings implementation.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generate a hash-based note ID from file path.
 * Compatible with Vault Embeddings plugin.
 *
 * @param path - Full file path including .md extension
 * @returns Hash-based note ID (8 hex characters)
 */
export function generateNoteId(path: string): string {
  const pathWithoutExt = path.replace(/\.md$/, '');
  return simpleHash(pathWithoutExt);
}
