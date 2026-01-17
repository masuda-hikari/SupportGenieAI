import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { DocumentChunk, SearchResult, VectorStore } from '../types/knowledge';
import { EmbeddingService } from './embeddingService';

/**
 * インメモリベクトルストア
 * 開発・テスト用。本番環境ではPinecone/Chromaを使用
 */
export class InMemoryVectorStore implements VectorStore {
  private chunks: Map<string, DocumentChunk> = new Map();
  private tenantIndex: Map<string, Set<string>> = new Map();

  /**
   * チャンクを追加/更新
   */
  async upsert(chunks: DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      if (!chunk.id) {
        chunk.id = uuidv4();
      }

      this.chunks.set(chunk.id, chunk);

      // テナントインデックス更新
      if (!this.tenantIndex.has(chunk.tenantId)) {
        this.tenantIndex.set(chunk.tenantId, new Set());
      }
      this.tenantIndex.get(chunk.tenantId)!.add(chunk.id);
    }

    logger.debug('Upserted chunks to vector store', {
      count: chunks.length,
      tenants: [...new Set(chunks.map(c => c.tenantId))],
    });
  }

  /**
   * 類似度検索
   */
  async search(
    embedding: number[],
    tenantId: string,
    topK: number
  ): Promise<SearchResult[]> {
    const tenantChunkIds = this.tenantIndex.get(tenantId);
    if (!tenantChunkIds || tenantChunkIds.size === 0) {
      logger.debug('No chunks found for tenant', { tenantId });
      return [];
    }

    const results: SearchResult[] = [];

    for (const id of tenantChunkIds) {
      const chunk = this.chunks.get(id);
      if (!chunk || !chunk.embedding) continue;

      const score = EmbeddingService.cosineSimilarity(embedding, chunk.embedding);
      results.push({ chunk, score });
    }

    // スコア降順でソートし、上位K件を返す
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, topK);

    logger.debug('Vector search completed', {
      tenantId,
      totalChunks: tenantChunkIds.size,
      resultsReturned: topResults.length,
      topScore: topResults[0]?.score || 0,
    });

    return topResults;
  }

  /**
   * IDによる削除
   */
  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      const chunk = this.chunks.get(id);
      if (chunk) {
        // テナントインデックスから削除
        const tenantChunks = this.tenantIndex.get(chunk.tenantId);
        if (tenantChunks) {
          tenantChunks.delete(id);
        }
        this.chunks.delete(id);
      }
    }

    logger.debug('Deleted chunks from vector store', { count: ids.length });
  }

  /**
   * テナント全データ削除
   */
  async deleteByTenant(tenantId: string): Promise<void> {
    const tenantChunkIds = this.tenantIndex.get(tenantId);
    if (!tenantChunkIds) {
      return;
    }

    const deletedCount = tenantChunkIds.size;
    for (const id of tenantChunkIds) {
      this.chunks.delete(id);
    }
    this.tenantIndex.delete(tenantId);

    logger.info('Deleted all chunks for tenant', { tenantId, deletedCount });
  }

  /**
   * 統計情報取得
   */
  getStats(): { totalChunks: number; tenantCount: number; chunksByTenant: Record<string, number> } {
    const chunksByTenant: Record<string, number> = {};
    for (const [tenantId, ids] of this.tenantIndex) {
      chunksByTenant[tenantId] = ids.size;
    }

    return {
      totalChunks: this.chunks.size,
      tenantCount: this.tenantIndex.size,
      chunksByTenant,
    };
  }

  /**
   * 全データクリア
   */
  clear(): void {
    this.chunks.clear();
    this.tenantIndex.clear();
    logger.info('Vector store cleared');
  }
}

/**
 * シングルトンインスタンス
 */
let vectorStoreInstance: InMemoryVectorStore | null = null;

export function getVectorStore(): InMemoryVectorStore {
  if (!vectorStoreInstance) {
    vectorStoreInstance = new InMemoryVectorStore();
    logger.info('InMemory vector store initialized');
  }
  return vectorStoreInstance;
}
