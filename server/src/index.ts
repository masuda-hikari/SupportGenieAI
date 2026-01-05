import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat';
import { healthRouter } from './routes/health';
import { logger } from './utils/logger';

// 環境変数読み込み
dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
}));
app.use(express.json());

// リクエストロギング
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// ルート
app.use('/api/v1/health', healthRouter);
app.use('/api/v1/chat', chatRouter);

// ルートエンドポイント
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'SupportGenieAI',
    version: '0.1.0',
    status: 'running',
    documentation: '/api/v1/docs',
  });
});

// 404ハンドラー
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  });
});

// エラーハンドラー
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// WebSocket接続
io.on('connection', (socket) => {
  logger.info('Client connected', { socketId: socket.id });

  socket.on('chat:message', async (data: { message: string; sessionId: string }) => {
    logger.info('Chat message received', { sessionId: data.sessionId });

    // TODO: AI処理を実装
    // 仮のエコー応答
    socket.emit('chat:response', {
      reply: `Echo: ${data.message}`,
      sessionId: data.sessionId,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected', { socketId: socket.id });
  });
});

// サーバー起動
httpServer.listen(PORT, () => {
  logger.info(`SupportGenieAI server started`, {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
  });
  console.log(`🤖 SupportGenieAI server running at http://localhost:${PORT}`);
});

export { app, io };
