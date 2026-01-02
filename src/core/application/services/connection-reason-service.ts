/**
 * ConnectionReasonService
 *
 * Generates connection classifications and reasons using LLM.
 * Manages caching to avoid redundant API calls.
 */

import type { Plugin } from 'obsidian';
import type {
  ILLMProvider,
  TextCompletionRequest,
} from '../../domain/interfaces/llm-provider.interface.js';
import type { ConnectionClassificationType } from '../../domain/value-objects/connection-classification.js';

export interface ConnectionReasonResult {
  classification: ConnectionClassificationType;
  reason: string;
}

interface CachedReason {
  sourceNoteId: string;
  targetNoteId: string;
  result: ConnectionReasonResult;
  createdAt: string; // ISO string for serialization
}

const VALID_CLASSIFICATIONS: ConnectionClassificationType[] = [
  '상위 맥락',
  '보충 설명',
  '적용 사례',
  '비판 관점',
  '연결 직관',
];

const CLASSIFICATION_PROMPT = `당신은 Zettelkasten PKM 시스템의 연결 분류 전문가입니다.

두 노트 사이의 관계를 분석하고 다음 중 하나로 분류하세요:
- 상위 맥락: 대상 노트가 소스 노트의 더 큰 프레임워크나 배경을 제공
- 보충 설명: 대상 노트가 소스 노트의 특정 측면을 보충하거나 확장
- 적용 사례: 대상 노트가 소스 노트 개념의 실제 적용 예시
- 비판 관점: 대상 노트가 소스 노트에 대한 반론이나 대립 관점 제공
- 연결 직관: 표면적 관계는 적지만 깊은 구조적 유사성이나 직관적 연결 존재

응답 형식 (반드시 JSON만 출력):
{"classification": "분류명", "reason": "1-2문장의 연결 사유 설명"}

소스 노트 (현재 작업 중인 노트):
제목: {{sourceTitle}}
내용: {{sourceContent}}

대상 노트 (추천된 노트):
제목: {{targetTitle}}
내용: {{targetContent}}`;

const CACHE_KEY = 'connection-reasons-cache';
const CACHE_EXPIRY_DAYS = 7;

export class ConnectionReasonService {
  private provider: ILLMProvider | null = null;
  private cache: Map<string, CachedReason> = new Map();
  private pendingRequests: Map<string, Promise<ConnectionReasonResult>> = new Map();

  constructor(provider?: ILLMProvider) {
    if (provider) {
      this.provider = provider;
    }
  }

  /**
   * Set or update the LLM provider
   */
  setProvider(provider: ILLMProvider | null): void {
    this.provider = provider;
  }

  /**
   * Check if service is ready (has provider)
   */
  isReady(): boolean {
    return this.provider !== null;
  }

  private getCacheKey(sourceNoteId: string, targetNoteId: string): string {
    return `${sourceNoteId}:${targetNoteId}`;
  }

  /**
   * Get cached reason if available and not expired
   */
  getCachedReason(
    sourceNoteId: string,
    targetNoteId: string,
  ): ConnectionReasonResult | null {
    const key = this.getCacheKey(sourceNoteId, targetNoteId);
    const cached = this.cache.get(key);

    if (cached) {
      const createdAt = new Date(cached.createdAt);
      const ageMs = Date.now() - createdAt.getTime();
      const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (ageMs < expiryMs) {
        return cached.result;
      }
      // Expired - remove from cache
      this.cache.delete(key);
    }
    return null;
  }

  /**
   * Generate connection classification and reason using LLM
   */
  async generateConnectionReason(
    sourceNoteId: string,
    sourceTitle: string,
    sourceContent: string,
    targetNoteId: string,
    targetTitle: string,
    targetContent: string,
  ): Promise<ConnectionReasonResult> {
    if (!this.provider) {
      return this.getDefaultResult();
    }

    const cacheKey = this.getCacheKey(sourceNoteId, targetNoteId);

    // Check cache first
    const cached = this.getCachedReason(sourceNoteId, targetNoteId);
    if (cached) {
      return cached;
    }

    // Check if request is already pending (deduplication)
    const pending = this.pendingRequests.get(cacheKey);
    if (pending) {
      return pending;
    }

    // Create new request
    const requestPromise = this.doGenerateReason(
      sourceTitle,
      sourceContent,
      targetTitle,
      targetContent,
    )
      .then((result) => {
        // Cache the result
        this.cache.set(cacheKey, {
          sourceNoteId,
          targetNoteId,
          result,
          createdAt: new Date().toISOString(),
        });
        this.pendingRequests.delete(cacheKey);
        return result;
      })
      .catch((error) => {
        console.error('Failed to generate connection reason:', error);
        this.pendingRequests.delete(cacheKey);
        return this.getDefaultResult();
      });

    this.pendingRequests.set(cacheKey, requestPromise);
    return requestPromise;
  }

  private async doGenerateReason(
    sourceTitle: string,
    sourceContent: string,
    targetTitle: string,
    targetContent: string,
  ): Promise<ConnectionReasonResult> {
    if (!this.provider) {
      return this.getDefaultResult();
    }

    const prompt = CLASSIFICATION_PROMPT
      .replace('{{sourceTitle}}', sourceTitle)
      .replace('{{sourceContent}}', this.truncateContent(sourceContent, 800))
      .replace('{{targetTitle}}', targetTitle)
      .replace('{{targetContent}}', this.truncateContent(targetContent, 800));

    const request: TextCompletionRequest = {
      prompt,
      maxTokens: 200,
      temperature: 0.3, // Lower temperature for consistent classifications
    };

    const response = await this.provider.generateCompletion(request);
    return this.parseResponse(response.text);
  }

  private truncateContent(content: string, maxLength: number): string {
    // Remove frontmatter
    const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n?/, '');

    // Remove markdown formatting
    const cleaned = withoutFrontmatter
      .replace(/^#+\s+.+$/gm, '') // Remove headings
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1') // Wiki links to text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Markdown links to text
      .replace(/[*_~`]/g, '') // Remove formatting chars
      .replace(/\n{3,}/g, '\n\n') // Normalize newlines
      .trim();

    if (cleaned.length <= maxLength) {
      return cleaned;
    }
    return cleaned.substring(0, maxLength) + '...';
  }

  private parseResponse(text: string): ConnectionReasonResult {
    try {
      // Extract JSON from response (handle potential markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (!jsonMatch) {
        console.warn('No JSON found in LLM response:', text);
        return this.getDefaultResult();
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate classification
      if (!VALID_CLASSIFICATIONS.includes(parsed.classification)) {
        console.warn('Invalid classification in response:', parsed.classification);
        return {
          classification: '연결 직관',
          reason: parsed.reason || '관련 주제로 연결됨',
        };
      }

      // Validate reason
      const reason = parsed.reason?.trim();
      if (!reason || reason.length < 5) {
        return {
          classification: parsed.classification,
          reason: '관련 주제로 연결됨',
        };
      }

      return {
        classification: parsed.classification,
        reason: reason.length > 200 ? reason.substring(0, 197) + '...' : reason,
      };
    } catch (error) {
      console.error('Failed to parse LLM response:', error, text);
      return this.getDefaultResult();
    }
  }

  private getDefaultResult(): ConnectionReasonResult {
    return {
      classification: '연결 직관',
      reason: '관련 주제로 연결됨',
    };
  }

  /**
   * Persist cache to storage
   */
  async saveCache(plugin: Plugin): Promise<void> {
    const cacheData = Array.from(this.cache.values());

    const existingData = (await plugin.loadData()) ?? {};
    await plugin.saveData({
      ...existingData,
      [CACHE_KEY]: cacheData,
    });
  }

  /**
   * Load cache from storage
   */
  async loadCache(plugin: Plugin): Promise<void> {
    const data = await plugin.loadData();
    const cacheData = data?.[CACHE_KEY];
    if (!Array.isArray(cacheData)) {
      return;
    }

    const expiryMs = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const item of cacheData) {
      // Skip invalid items
      if (!item.sourceNoteId || !item.targetNoteId || !item.result) {
        continue;
      }

      // Skip expired items
      const createdAt = new Date(item.createdAt);
      if (now - createdAt.getTime() > expiryMs) {
        continue;
      }

      const key = this.getCacheKey(item.sourceNoteId, item.targetNoteId);
      this.cache.set(key, item);
    }
  }

  /**
   * Clear all cached reasons
   */
  clearCache(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; pendingCount: number } {
    return {
      size: this.cache.size,
      pendingCount: this.pendingRequests.size,
    };
  }
}
