import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { EmbeddingRequest, EmbeddingResponse } from '../types/knowledge';

/**
 * 埋め込みサービス
 * テキストをベクトル埋め込みに変換
 */
export class EmbeddingService {
  private openai: OpenAI | null = null;
  private anthropic: Anthropic | null = null;
  private provider: 'openai' | 'anthropic' | 'none' = 'none';
  private model: string = 'text-embedding-3-small';

  constructor() {
    // OpenAI Embeddings（推奨）
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      this.provider = 'openai';
      this.model = 'text-embedding-3-small';
      logger.info('Embedding service initialized with OpenAI');
    } else if (process.env.ANTHROPIC_API_KEY) {
      // Anthropicは埋め込みAPIを提供していないため、
      // 実運用ではOpenAIまたは別のサービスを使用
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      this.provider = 'anthropic';
      logger.warn('Anthropic does not provide embedding API. Using fallback simple embedding.');
    } else {
      logger.warn('No embedding API configured. Using fallback simple embedding.');
    }
  }

  /**
   * テキストを埋め込みベクトルに変換
   */
  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    logger.debug('Generating embedding', {
      textLength: request.text.length,
      provider: this.provider,
    });

    try {
      switch (this.provider) {
        case 'openai':
          return await this.embedWithOpenAI(request);
        default:
          // フォールバック: シンプルな文字ベースのハッシュ埋め込み
          return this.simpleEmbedding(request);
      }
    } catch (error) {
      logger.error('Embedding generation failed', { error });
      // フォールバック
      return this.simpleEmbedding(request);
    }
  }

  /**
   * 複数テキストを一括埋め込み
   */
  async embedBatch(texts: string[]): Promise<EmbeddingResponse[]> {
    if (this.provider === 'openai' && this.openai) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: texts,
        });

        return response.data.map((item, index) => ({
          embedding: item.embedding,
          model: this.model,
          tokenCount: Math.ceil(texts[index].length / 4), // 概算
        }));
      } catch (error) {
        logger.error('Batch embedding failed, falling back to individual', { error });
      }
    }

    // フォールバック: 個別処理
    return Promise.all(texts.map(text => this.embed({ text })));
  }

  /**
   * OpenAI埋め込み
   */
  private async embedWithOpenAI(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openai.embeddings.create({
      model: request.model || this.model,
      input: request.text,
    });

    const embedding = response.data[0].embedding;

    logger.debug('OpenAI embedding generated', {
      dimensions: embedding.length,
      usage: response.usage,
    });

    return {
      embedding,
      model: request.model || this.model,
      tokenCount: response.usage?.total_tokens || 0,
    };
  }

  /**
   * シンプルな埋め込み（フォールバック用）
   * 本番環境では使用しないこと
   */
  private simpleEmbedding(request: EmbeddingRequest): EmbeddingResponse {
    logger.warn('Using simple fallback embedding - not suitable for production');

    // 384次元のベクトルを生成（text-embedding-3-smallと同じ次元数）
    const dimensions = 384;
    const embedding: number[] = new Array(dimensions).fill(0);

    // テキストの特徴を抽出してベクトル化
    const normalized = request.text.toLowerCase();
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const index = (charCode + i) % dimensions;
      embedding[index] += 1;
    }

    // L2正規化
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < dimensions; i++) {
        embedding[i] /= magnitude;
      }
    }

    return {
      embedding,
      model: 'simple-fallback',
      tokenCount: Math.ceil(request.text.length / 4),
    };
  }

  /**
   * コサイン類似度計算
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      magnitudeA += a[i] * a[i];
      magnitudeB += b[i] * b[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * プロバイダー情報取得
   */
  getProviderInfo(): { provider: string; model: string; available: boolean } {
    return {
      provider: this.provider,
      model: this.model,
      available: this.provider !== 'none',
    };
  }
}
