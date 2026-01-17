import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import {
  Document,
  DocumentChunk,
  SearchQuery,
  SearchResult,
  IngestRequest,
  IngestResult,
  ChunkConfig,
} from '../types/knowledge';
import { KnowledgeBaseResult } from '../types/chat';
import { EmbeddingService } from './embeddingService';
import { getVectorStore, InMemoryVectorStore } from './vectorStore';

// デフォルトチャンク設定
const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
  maxChunkSize: 500,
  overlapSize: 50,
  separators: ['\n\n', '\n', '。', '. ', ' '],
};

/**
 * ナレッジベースサービス
 * ドキュメントの取り込み、チャンク化、検索を担当
 */
export class KnowledgeBaseService {
  private embeddingService: EmbeddingService;
  private vectorStore: InMemoryVectorStore;
  private chunkConfig: ChunkConfig;

  // メモリ上のドキュメントストア（開発用）
  private documents: Map<string, Document> = new Map();

  constructor(config?: Partial<ChunkConfig>) {
    this.embeddingService = new EmbeddingService();
    this.vectorStore = getVectorStore();
    this.chunkConfig = { ...DEFAULT_CHUNK_CONFIG, ...config };

    logger.info('KnowledgeBaseService initialized', {
      embeddingProvider: this.embeddingService.getProviderInfo(),
      chunkConfig: this.chunkConfig,
    });
  }

  /**
   * ドキュメントの取り込み
   */
  async ingest(request: IngestRequest): Promise<IngestResult[]> {
    const results: IngestResult[] = [];

    for (const doc of request.documents) {
      try {
        // ドキュメント作成
        const document: Document = {
          id: uuidv4(),
          tenantId: request.tenantId,
          title: doc.title,
          content: doc.content,
          source: doc.source,
          type: doc.type,
          metadata: doc.metadata,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // チャンク化
        const chunks = this.chunkDocument(document);

        // 埋め込み生成
        const texts = chunks.map(c => c.content);
        const embeddings = await this.embeddingService.embedBatch(texts);

        // 埋め込みをチャンクに追加
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].embedding = embeddings[i].embedding;
        }

        // ベクトルストアに保存
        await this.vectorStore.upsert(chunks);

        // ドキュメント保存
        this.documents.set(document.id, document);

        results.push({
          documentId: document.id,
          chunksCreated: chunks.length,
          status: 'success',
        });

        logger.info('Document ingested', {
          documentId: document.id,
          title: document.title,
          chunks: chunks.length,
          tenantId: request.tenantId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({
          documentId: '',
          chunksCreated: 0,
          status: 'failed',
          error: errorMessage,
        });

        logger.error('Document ingestion failed', {
          title: doc.title,
          error: errorMessage,
        });
      }
    }

    return results;
  }

  /**
   * ドキュメントをチャンクに分割
   */
  private chunkDocument(document: Document): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const content = document.content;

    if (content.length <= this.chunkConfig.maxChunkSize) {
      // 短いドキュメントはそのまま1チャンク
      chunks.push({
        id: uuidv4(),
        documentId: document.id,
        tenantId: document.tenantId,
        content: content,
        chunkIndex: 0,
        metadata: {
          title: document.title,
          source: document.source,
          type: document.type,
        },
      });
      return chunks;
    }

    // 再帰的に分割
    const textChunks = this.splitText(content, this.chunkConfig);

    for (let i = 0; i < textChunks.length; i++) {
      chunks.push({
        id: uuidv4(),
        documentId: document.id,
        tenantId: document.tenantId,
        content: textChunks[i],
        chunkIndex: i,
        metadata: {
          title: document.title,
          source: document.source,
          type: document.type,
        },
      });
    }

    return chunks;
  }

  /**
   * テキストを再帰的に分割
   */
  private splitText(text: string, config: ChunkConfig): string[] {
    if (text.length <= config.maxChunkSize) {
      return [text.trim()].filter(t => t.length > 0);
    }

    // セパレータで分割を試行
    for (const separator of config.separators) {
      if (text.includes(separator)) {
        const parts = text.split(separator);
        const result: string[] = [];
        let current = '';

        for (const part of parts) {
          const candidate = current + (current ? separator : '') + part;

          if (candidate.length <= config.maxChunkSize) {
            current = candidate;
          } else {
            if (current) {
              result.push(current.trim());
            }
            // 部分が大きすぎる場合は次のセパレータで再帰的に分割
            if (part.length > config.maxChunkSize) {
              const subParts = this.splitText(part, config);
              result.push(...subParts);
              current = '';
            } else {
              current = part;
            }
          }
        }

        if (current.trim()) {
          result.push(current.trim());
        }

        if (result.length > 0) {
          // オーバーラップを追加
          return this.addOverlap(result, config.overlapSize);
        }
      }
    }

    // セパレータが見つからない場合は強制分割
    const result: string[] = [];
    for (let i = 0; i < text.length; i += config.maxChunkSize - config.overlapSize) {
      const chunk = text.slice(i, i + config.maxChunkSize).trim();
      if (chunk) {
        result.push(chunk);
      }
    }

    return result;
  }

  /**
   * チャンク間にオーバーラップを追加
   */
  private addOverlap(chunks: string[], overlapSize: number): string[] {
    if (chunks.length <= 1 || overlapSize <= 0) {
      return chunks;
    }

    const result: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      // 前のチャンクの末尾を先頭に追加
      if (i > 0) {
        const prevChunk = chunks[i - 1];
        const overlap = prevChunk.slice(-overlapSize);
        chunk = overlap + chunk;
      }

      result.push(chunk);
    }

    return result;
  }

  /**
   * 類似度検索
   */
  async search(query: SearchQuery): Promise<KnowledgeBaseResult[]> {
    const { query: queryText, tenantId, topK = 3, minScore = 0.5 } = query;

    logger.debug('Searching knowledge base', {
      queryLength: queryText.length,
      tenantId,
      topK,
      minScore,
    });

    // クエリを埋め込みに変換
    const queryEmbedding = await this.embeddingService.embed({ text: queryText });

    // ベクトル検索
    const results = await this.vectorStore.search(
      queryEmbedding.embedding,
      tenantId,
      topK * 2 // フィルタリング用に多めに取得
    );

    // スコアフィルタリングと変換
    const filteredResults: KnowledgeBaseResult[] = results
      .filter(r => r.score >= minScore)
      .slice(0, topK)
      .map(r => ({
        content: r.chunk.content,
        source: r.chunk.metadata?.source as string || 'Unknown',
        relevanceScore: r.score,
      }));

    logger.info('Knowledge base search completed', {
      tenantId,
      query: queryText.substring(0, 50) + '...',
      totalResults: results.length,
      filteredResults: filteredResults.length,
    });

    return filteredResults;
  }

  /**
   * ドキュメント削除
   */
  async deleteDocument(documentId: string, tenantId: string): Promise<boolean> {
    const document = this.documents.get(documentId);
    if (!document || document.tenantId !== tenantId) {
      return false;
    }

    // ベクトルストアからチャンクを削除（IDベースで削除が必要）
    // 現在の実装ではドキュメント全体の削除が難しいため、
    // 本番環境ではドキュメントIDをメタデータに保存して検索削除

    this.documents.delete(documentId);

    logger.info('Document deleted', { documentId, tenantId });
    return true;
  }

  /**
   * テナントの全ドキュメント削除
   */
  async deleteAllForTenant(tenantId: string): Promise<number> {
    let deletedCount = 0;

    // ドキュメント削除
    for (const [id, doc] of this.documents) {
      if (doc.tenantId === tenantId) {
        this.documents.delete(id);
        deletedCount++;
      }
    }

    // ベクトルストア削除
    await this.vectorStore.deleteByTenant(tenantId);

    logger.info('All documents deleted for tenant', { tenantId, deletedCount });
    return deletedCount;
  }

  /**
   * テナントのドキュメント一覧取得
   */
  getDocuments(tenantId: string): Document[] {
    const docs: Document[] = [];
    for (const doc of this.documents.values()) {
      if (doc.tenantId === tenantId) {
        docs.push(doc);
      }
    }
    return docs;
  }

  /**
   * 統計情報取得
   */
  getStats(): {
    totalDocuments: number;
    vectorStoreStats: ReturnType<InMemoryVectorStore['getStats']>;
  } {
    return {
      totalDocuments: this.documents.size,
      vectorStoreStats: this.vectorStore.getStats(),
    };
  }
}

/**
 * シングルトンインスタンス
 */
let knowledgeBaseInstance: KnowledgeBaseService | null = null;

export function getKnowledgeBaseService(): KnowledgeBaseService {
  if (!knowledgeBaseInstance) {
    knowledgeBaseInstance = new KnowledgeBaseService();
  }
  return knowledgeBaseInstance;
}
