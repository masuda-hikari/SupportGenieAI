import request from 'supertest';
import express from 'express';
import { chatRouter } from '../routes/chat';

// テスト用Expressアプリ作成
const app = express();
app.use(express.json());
app.use('/api/v1/chat', chatRouter);

describe('Chat API', () => {
  describe('POST /api/v1/chat', () => {
    it('有効なメッセージで応答を返す', async () => {
      const response = await request(app)
        .post('/api/v1/chat')
        .send({ message: 'こんにちは' })
        .expect(200);

      expect(response.body).toHaveProperty('reply');
      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('confidence');
      expect(typeof response.body.reply).toBe('string');
      expect(response.body.reply.length).toBeGreaterThan(0);
    });

    it('セッションIDが提供されていれば維持される', async () => {
      const sessionId = 'test-session-123';
      const response = await request(app)
        .post('/api/v1/chat')
        .send({ message: 'テスト', sessionId })
        .expect(200);

      expect(response.body.sessionId).toBe(sessionId);
    });

    it('メッセージがない場合は400エラー', async () => {
      const response = await request(app)
        .post('/api/v1/chat')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    it('メッセージが空文字の場合も400エラー', async () => {
      const response = await request(app)
        .post('/api/v1/chat')
        .send({ message: '' })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    it('メッセージが長すぎる場合は400エラー', async () => {
      const longMessage = 'a'.repeat(5000);
      const response = await request(app)
        .post('/api/v1/chat')
        .send({ message: longMessage })
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad Request');
    });
  });

  describe('GET /api/v1/chat/stats', () => {
    it('統計情報を取得できる', async () => {
      const response = await request(app)
        .get('/api/v1/chat/stats')
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('ai');
    });
  });
});
