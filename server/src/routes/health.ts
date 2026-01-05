import { Router, Request, Response } from 'express';

export const healthRouter = Router();

// ヘルスチェックエンドポイント
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0',
  });
});

// 詳細ヘルスチェック（内部用）
healthRouter.get('/detailed', (_req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '0.1.0',
    memory: {
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + 'MB',
    },
    env: process.env.NODE_ENV || 'development',
    // 将来的にDB接続状態などを追加
    services: {
      database: 'not_configured',
      vectorDb: 'not_configured',
      llm: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
        ? 'configured'
        : 'not_configured',
    },
  });
});
