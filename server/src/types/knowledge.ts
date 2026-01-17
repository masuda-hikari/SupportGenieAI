// ドキュメント型定義
export interface Document {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  source: string; // ファイルパス、URL、または識別子
  type: 'faq' | 'manual' | 'article' | 'policy' | 'other';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// チャンク化されたドキュメント
export interface DocumentChunk {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  chunkIndex: number;
  embedding?: number[]; // ベクトル埋め込み
  metadata?: {
    title?: string;
    source?: string;
    type?: string;
    [key: string]: unknown;
  };
}

// 埋め込みリクエスト
export interface EmbeddingRequest {
  text: string;
  model?: string;
}

// 埋め込みレスポンス
export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  tokenCount: number;
}

// 検索クエリ
export interface SearchQuery {
  query: string;
  tenantId: string;
  topK?: number; // 取得件数（デフォルト: 3）
  minScore?: number; // 最低類似度スコア（デフォルト: 0.7）
}

// 検索結果
export interface SearchResult {
  chunk: DocumentChunk;
  score: number; // 類似度スコア（0-1）
}

// インジェストリクエスト
export interface IngestRequest {
  tenantId: string;
  documents: {
    title: string;
    content: string;
    source: string;
    type: Document['type'];
    metadata?: Record<string, unknown>;
  }[];
}

// インジェスト結果
export interface IngestResult {
  documentId: string;
  chunksCreated: number;
  status: 'success' | 'failed';
  error?: string;
}

// ベクトルストアインターフェース（抽象化）
export interface VectorStore {
  // ベクトル追加
  upsert(chunks: DocumentChunk[]): Promise<void>;
  // 類似度検索
  search(embedding: number[], tenantId: string, topK: number): Promise<SearchResult[]>;
  // 削除
  delete(ids: string[]): Promise<void>;
  // テナント全削除
  deleteByTenant(tenantId: string): Promise<void>;
}

// チャンク設定
export interface ChunkConfig {
  maxChunkSize: number; // 最大文字数（デフォルト: 500）
  overlapSize: number; // オーバーラップ文字数（デフォルト: 50）
  separators: string[]; // 分割セパレータ
}
