// チャットリクエスト型
export interface ChatRequest {
  message: string;
  sessionId?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

// チャットレスポンス型
export interface ChatResponse {
  reply: string;
  sessionId: string;
  timestamp: string;
  confidence?: number;
  sources?: string[];
  escalated?: boolean;
}

// 会話メッセージ型
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// 会話セッション型
export interface ChatSession {
  id: string;
  tenantId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'closed' | 'escalated';
}

// AI生成コンテキスト型
export interface AIContext {
  sessionId: string;
  tenantId: string;
  conversationHistory?: Message[];
  knowledgeBaseResults?: KnowledgeBaseResult[];
}

// ナレッジベース検索結果型
export interface KnowledgeBaseResult {
  content: string;
  source: string;
  relevanceScore: number;
}

// テナント設定型
export interface TenantConfig {
  id: string;
  name: string;
  apiKey: string;
  settings: {
    aiModel: 'claude' | 'openai';
    temperature: number;
    maxTokens: number;
    systemPrompt?: string;
    escalationThreshold: number;
  };
  plan: 'starter' | 'business' | 'enterprise';
  usageLimit: number;
  currentUsage: number;
}
