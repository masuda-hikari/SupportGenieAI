import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AIService } from '../services/aiService';
import { logger } from '../utils/logger';
import { ChatRequest, ChatResponse } from '../types/chat';

export const chatRouter = Router();

const aiService = new AIService();

// チャットメッセージ送信エンドポイント
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, sessionId, tenantId } = req.body as ChatRequest;

    // バリデーション
    if (!message || typeof message !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'message field is required and must be a string',
      });
      return;
    }

    // セッションIDがなければ生成
    const currentSessionId = sessionId || uuidv4();

    logger.info('Processing chat request', {
      sessionId: currentSessionId,
      tenantId: tenantId || 'default',
      messageLength: message.length,
    });

    // AI応答を取得
    const reply = await aiService.generateResponse(message, {
      sessionId: currentSessionId,
      tenantId: tenantId || 'default',
    });

    const response: ChatResponse = {
      reply,
      sessionId: currentSessionId,
      timestamp: new Date().toISOString(),
      confidence: 0.85, // TODO: 実際の信頼度計算を実装
    };

    res.json(response);
  } catch (error) {
    logger.error('Chat request failed', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process chat request',
    });
  }
});

// 会話履歴取得（将来実装）
chatRouter.get('/history/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;

  // TODO: データベースから履歴を取得
  res.json({
    sessionId,
    messages: [],
    message: 'History retrieval not yet implemented',
  });
});

// エスカレーション（人間へ転送）
chatRouter.post('/escalate', (req: Request, res: Response) => {
  const { sessionId, reason } = req.body;

  logger.info('Escalation requested', { sessionId, reason });

  // TODO: 実際のエスカレーション処理を実装
  // - チケット作成
  // - 通知送信
  // - 会話ログ保存

  res.json({
    success: true,
    message: 'Your request has been escalated to a human agent',
    ticketId: uuidv4(),
    estimatedWaitTime: '5-10 minutes',
  });
});
