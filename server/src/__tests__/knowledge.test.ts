import request from 'supertest';
import { app } from '../index';
import { getKnowledgeBaseService } from '../services/knowledgeBaseService';
import { getVectorStore } from '../services/vectorStore';

describe('Knowledge Base API', () => {
  const testTenantId = 'test-tenant-001';

  beforeEach(() => {
    // 各テスト前にベクトルストアをクリア
    const vectorStore = getVectorStore();
    vectorStore.clear();
  });

  describe('POST /api/v1/knowledge/ingest', () => {
    it('ドキュメントを正常に取り込む', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          tenantId: testTenantId,
          documents: [
            {
              title: '返品ポリシー',
              content: '商品到着後14日以内であれば返品可能です。未開封・未使用の状態に限ります。',
              source: 'faq/returns.md',
              type: 'faq',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].status).toBe('success');
      expect(response.body.results[0].chunksCreated).toBeGreaterThan(0);
    });

    it('複数ドキュメントを一括取り込み', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          tenantId: testTenantId,
          documents: [
            {
              title: '配送について',
              content: '通常配送は2-3営業日、お急ぎ便は翌日配送です。',
              source: 'faq/shipping.md',
              type: 'faq',
            },
            {
              title: '支払い方法',
              content: 'クレジットカード、銀行振込、コンビニ払いに対応しています。',
              source: 'faq/payment.md',
              type: 'faq',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results.every((r: { status: string }) => r.status === 'success')).toBe(true);
    });

    it('tenantIdがない場合は400を返す', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          documents: [
            {
              title: 'テスト',
              content: 'テスト内容',
              source: 'test.md',
              type: 'faq',
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('tenantId is required');
    });

    it('documentsがない場合は400を返す', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          tenantId: testTenantId,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/v1/knowledge/search', () => {
    beforeEach(async () => {
      // テストデータを投入
      await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          tenantId: testTenantId,
          documents: [
            {
              title: '返品ポリシー',
              content: '商品到着後14日以内であれば返品可能です。返品の際は、未開封・未使用の状態で、購入時の箱に入れてお送りください。',
              source: 'faq/returns.md',
              type: 'faq',
            },
            {
              title: '配送について',
              content: '通常配送は2-3営業日でお届けします。お急ぎ便をご選択いただくと翌日配送も可能です。',
              source: 'faq/shipping.md',
              type: 'faq',
            },
          ],
        });
    });

    it('関連ドキュメントを検索する', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/search')
        .send({
          query: '返品したい',
          tenantId: testTenantId,
          topK: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
    });

    it('queryがない場合は400を返す', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/search')
        .send({
          tenantId: testTenantId,
        });

      expect(response.status).toBe(400);
    });

    it('tenantIdがない場合は400を返す', async () => {
      const response = await request(app)
        .post('/api/v1/knowledge/search')
        .send({
          query: 'テスト',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/v1/knowledge/documents/:tenantId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          tenantId: testTenantId,
          documents: [
            {
              title: 'テストドキュメント',
              content: 'テスト内容です。',
              source: 'test.md',
              type: 'faq',
            },
          ],
        });
    });

    it('テナントのドキュメント一覧を取得する', async () => {
      const response = await request(app)
        .get(`/api/v1/knowledge/documents/${testTenantId}`);

      expect(response.status).toBe(200);
      expect(response.body.documents).toBeDefined();
      expect(response.body.count).toBeGreaterThan(0);
    });

    it('存在しないテナントでも200を返す（空配列）', async () => {
      const response = await request(app)
        .get('/api/v1/knowledge/documents/nonexistent-tenant');

      expect(response.status).toBe(200);
      expect(response.body.documents).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });

  describe('GET /api/v1/knowledge/stats', () => {
    it('統計情報を取得する', async () => {
      const response = await request(app)
        .get('/api/v1/knowledge/stats');

      expect(response.status).toBe(200);
      expect(response.body.totalDocuments).toBeDefined();
      expect(response.body.vectorStoreStats).toBeDefined();
    });
  });

  describe('DELETE /api/v1/knowledge/documents/:tenantId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/knowledge/ingest')
        .send({
          tenantId: testTenantId,
          documents: [
            {
              title: 'テスト',
              content: 'テスト内容',
              source: 'test.md',
              type: 'faq',
            },
          ],
        });
    });

    it('テナントの全ドキュメントを削除する', async () => {
      const response = await request(app)
        .delete(`/api/v1/knowledge/documents/${testTenantId}`);

      expect(response.status).toBe(200);
      expect(response.body.deletedCount).toBeGreaterThanOrEqual(0);

      // 削除後は空になっていることを確認
      const getResponse = await request(app)
        .get(`/api/v1/knowledge/documents/${testTenantId}`);

      expect(getResponse.body.count).toBe(0);
    });
  });
});

describe('EmbeddingService', () => {
  it('コサイン類似度を正しく計算する', () => {
    const { EmbeddingService } = require('../services/embeddingService');

    // 同じベクトルは類似度1.0
    const vec1 = [1, 0, 0];
    const vec2 = [1, 0, 0];
    expect(EmbeddingService.cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0);

    // 直交ベクトルは類似度0.0
    const vec3 = [1, 0, 0];
    const vec4 = [0, 1, 0];
    expect(EmbeddingService.cosineSimilarity(vec3, vec4)).toBeCloseTo(0.0);

    // 反対ベクトルは類似度-1.0
    const vec5 = [1, 0, 0];
    const vec6 = [-1, 0, 0];
    expect(EmbeddingService.cosineSimilarity(vec5, vec6)).toBeCloseTo(-1.0);
  });

  it('異なる次元のベクトルでエラーを投げる', () => {
    const { EmbeddingService } = require('../services/embeddingService');

    const vec1 = [1, 0, 0];
    const vec2 = [1, 0];
    expect(() => EmbeddingService.cosineSimilarity(vec1, vec2)).toThrow();
  });
});
