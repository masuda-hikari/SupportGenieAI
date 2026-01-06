import request from 'supertest';
import express from 'express';
import { healthRouter } from '../routes/health';

// テスト用Expressアプリ作成
const app = express();
app.use('/api/v1/health', healthRouter);

describe('Health API', () => {
  describe('GET /api/v1/health', () => {
    it('ヘルスチェックが正常に返る', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('GET /api/v1/health/detailed', () => {
    it('詳細ヘルスチェックが正常に返る', async () => {
      const response = await request(app)
        .get('/api/v1/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('memory');
      expect(response.body.memory).toHaveProperty('heapUsed');
      expect(response.body.memory).toHaveProperty('heapTotal');
      expect(response.body).toHaveProperty('services');
    });
  });
});
