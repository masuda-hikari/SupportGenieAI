import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { Message, ChatSession, AIContext } from '../types/chat';

// インメモリセッションストア（本番ではRedis/DBに置き換え）
const sessions: Map<string, ChatSession> = new Map();

// セッション有効期限（30分）
const SESSION_TTL_MS = 30 * 60 * 1000;

// 最大会話履歴数（コンテキスト制限のため）
const MAX_HISTORY_LENGTH = 20;

// セッション管理サービス
export class SessionService {
  // セッション取得または作成
  getOrCreateSession(sessionId: string | undefined, tenantId: string): ChatSession {
    // 既存セッションがあれば返す
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      // 有効期限チェック
      if (this.isSessionValid(session)) {
        session.updatedAt = new Date().toISOString();
        return session;
      }
      // 期限切れの場合は削除
      sessions.delete(sessionId);
    }

    // 新規セッション作成
    const newSessionId = sessionId || uuidv4();
    const session: ChatSession = {
      id: newSessionId,
      tenantId,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
    };

    sessions.set(newSessionId, session);
    logger.info('New session created', { sessionId: newSessionId, tenantId });

    return session;
  }

  // セッション取得
  getSession(sessionId: string): ChatSession | null {
    const session = sessions.get(sessionId);
    if (!session || !this.isSessionValid(session)) {
      return null;
    }
    return session;
  }

  // メッセージ追加
  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Message {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const message: Message = {
      id: uuidv4(),
      role,
      content,
      timestamp: new Date().toISOString(),
    };

    session.messages.push(message);
    session.updatedAt = new Date().toISOString();

    // 履歴数制限（古いメッセージを削除）
    if (session.messages.length > MAX_HISTORY_LENGTH) {
      session.messages = session.messages.slice(-MAX_HISTORY_LENGTH);
    }

    logger.debug('Message added to session', {
      sessionId,
      role,
      messageCount: session.messages.length,
    });

    return message;
  }

  // AI用コンテキスト生成
  buildAIContext(session: ChatSession): AIContext {
    return {
      sessionId: session.id,
      tenantId: session.tenantId,
      conversationHistory: session.messages,
      // knowledgeBaseResults は RAG実装後に追加
    };
  }

  // セッションステータス更新
  updateSessionStatus(sessionId: string, status: 'active' | 'closed' | 'escalated'): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.updatedAt = new Date().toISOString();
      logger.info('Session status updated', { sessionId, status });
    }
  }

  // セッション終了
  closeSession(sessionId: string): void {
    const session = sessions.get(sessionId);
    if (session) {
      session.status = 'closed';
      session.updatedAt = new Date().toISOString();
      // 本番ではDBに永続化後に削除
      logger.info('Session closed', { sessionId, messageCount: session.messages.length });
    }
  }

  // セッション有効性チェック
  private isSessionValid(session: ChatSession): boolean {
    const updatedAt = new Date(session.updatedAt).getTime();
    const now = Date.now();
    return now - updatedAt < SESSION_TTL_MS && session.status === 'active';
  }

  // 期限切れセッションのクリーンアップ
  cleanupExpiredSessions(): number {
    let cleanedCount = 0;
    const now = Date.now();

    for (const [sessionId, session] of sessions.entries()) {
      const updatedAt = new Date(session.updatedAt).getTime();
      if (now - updatedAt >= SESSION_TTL_MS) {
        sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('Expired sessions cleaned up', { count: cleanedCount });
    }

    return cleanedCount;
  }

  // 統計情報取得
  getStats(): { totalSessions: number; activeSessions: number } {
    let activeSessions = 0;
    for (const session of sessions.values()) {
      if (this.isSessionValid(session)) {
        activeSessions++;
      }
    }

    return {
      totalSessions: sessions.size,
      activeSessions,
    };
  }
}

// シングルトンインスタンス
export const sessionService = new SessionService();

// 定期クリーンアップ（5分ごと）
setInterval(() => {
  sessionService.cleanupExpiredSessions();
}, 5 * 60 * 1000);
