import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../services/aiService';
import { sessionService } from '../services/sessionService';
import { getKnowledgeBaseService } from '../services/knowledgeBaseService';
import { logger } from '../utils/logger';
import { ChatRequest, ChatResponse, KnowledgeBaseResult } from '../types/chat';

export const chatRouter = Router();

const aiService = new AIService();
const knowledgeBaseService = getKnowledgeBaseService();

// チャットメッセージ送信エンドポイント
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, sessionId, tenantId } = req.body as ChatRequest;

    // バリデーション
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'message field is required and must be a non-empty string',
      });
      return;
    }

    // メッセージ長制限（4000文字）
    if (message.length > 4000) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Message too long. Maximum 4000 characters allowed.',
      });
      return;
    }

    // セッション取得または作成
    const session = sessionService.getOrCreateSession(
      sessionId,
      tenantId || 'default'
    );

    logger.info('Processing chat request', {
      sessionId: session.id,
      tenantId: session.tenantId,
      messageLength: message.length,
      historyLength: session.messages.length,
    });

    // ユーザーメッセージを履歴に追加
    sessionService.addMessage(session.id, 'user', message);

    // ナレッジベース検索（RAG）
    let knowledgeBaseResults: KnowledgeBaseResult[] = [];
    try {
      knowledgeBaseResults = await knowledgeBaseService.search({
        query: message,
        tenantId: session.tenantId,
        topK: 3,
        minScore: 0.5,
      });
      logger.debug('Knowledge base search completed', {
        sessionId: session.id,
        resultsCount: knowledgeBaseResults.length,
      });
    } catch (kbError) {
      logger.warn('Knowledge base search failed, continuing without RAG', { error: kbError });
    }

    // AI用コンテキスト構築（RAG結果を含む）
    const context = sessionService.buildAIContext(session);
    context.knowledgeBaseResults = knowledgeBaseResults;

    // AI応答を取得
    const reply = await aiService.generateResponse(message, context);

    // AI応答を履歴に追加
    sessionService.addMessage(session.id, 'assistant', reply);

    // 信頼度計算（RAG結果のソースを使用）
    const sources = knowledgeBaseResults.map(r => r.source);
    const confidence = aiService.calculateConfidence(reply, sources);

    // エスカレーション判定
    const shouldEscalate = aiService.shouldEscalate(message, reply, confidence);

    const response: ChatResponse = {
      reply,
      sessionId: session.id,
      timestamp: new Date().toISOString(),
      confidence,
      sources: sources.length > 0 ? sources : undefined,
      escalated: shouldEscalate,
    };

    // エスカレーション推奨の場合はメッセージに追記
    if (shouldEscalate && !reply.includes('オペレーター')) {
      response.reply += '\n\n※ご希望でしたら、人間のオペレーターにおつなぎすることも可能です。';
    }

    res.json(response);
  } catch (error) {
    logger.error('Chat request failed', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process chat request',
    });
  }
});

// 会話履歴取得
chatRouter.get('/history/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const session = sessionService.getSession(sessionId);

  if (!session) {
    res.status(404).json({
      error: 'Not Found',
      message: 'Session not found or expired',
    });
    return;
  }

  res.json({
    sessionId: session.id,
    tenantId: session.tenantId,
    messages: session.messages,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  });
});

// エスカレーション（人間へ転送）
chatRouter.post('/escalate', (req: Request, res: Response) => {
  const { sessionId, reason } = req.body;

  if (!sessionId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'sessionId is required',
    });
    return;
  }

  const session = sessionService.getSession(sessionId);

  if (!session) {
    res.status(404).json({
      error: 'Not Found',
      message: 'Session not found or expired',
    });
    return;
  }

  logger.info('Escalation requested', {
    sessionId,
    reason,
    messageCount: session.messages.length,
  });

  // セッションステータスを更新
  sessionService.updateSessionStatus(sessionId, 'escalated');

  // システムメッセージを追加
  sessionService.addMessage(
    sessionId,
    'assistant',
    `ご要望を承りました。人間のオペレーターへおつなぎします。\n理由: ${reason || '指定なし'}`
  );

  res.json({
    success: true,
    message: 'Your request has been escalated to a human agent',
    ticketId: uuidv4(),
    estimatedWaitTime: '5-10 minutes',
    conversationSummary: {
      messageCount: session.messages.length,
      sessionDuration: calculateSessionDuration(session.createdAt),
    },
  });
});

// セッション終了
chatRouter.post('/close', (req: Request, res: Response) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'sessionId is required',
    });
    return;
  }

  sessionService.closeSession(sessionId);

  res.json({
    success: true,
    message: 'Session closed successfully',
  });
});

// セッション統計（管理用）
chatRouter.get('/stats', (_req: Request, res: Response) => {
  const stats = sessionService.getStats();
  const providerInfo = aiService.getProviderInfo();

  res.json({
    sessions: stats,
    ai: providerInfo,
  });
});

// セッション継続時間計算
function calculateSessionDuration(createdAt: string): string {
  const start = new Date(createdAt).getTime();
  const now = Date.now();
  const durationMs = now - start;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  return `${minutes}分${seconds}秒`;
}
