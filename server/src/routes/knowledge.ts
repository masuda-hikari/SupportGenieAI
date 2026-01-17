import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { getKnowledgeBaseService } from '../services/knowledgeBaseService';
import { IngestRequest, SearchQuery } from '../types/knowledge';

const router = Router();
const knowledgeBaseService = getKnowledgeBaseService();

/**
 * POST /api/knowledge/ingest
 * ドキュメントの取り込み
 */
router.post('/ingest', async (req: Request, res: Response) => {
  try {
    const { tenantId, documents } = req.body as IngestRequest;

    // バリデーション
    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId is required',
      });
    }

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({
        error: 'documents array is required and must not be empty',
      });
    }

    // 各ドキュメントのバリデーション
    for (const doc of documents) {
      if (!doc.title || !doc.content || !doc.source || !doc.type) {
        return res.status(400).json({
          error: 'Each document must have title, content, source, and type',
        });
      }
    }

    logger.info('Ingest request received', {
      tenantId,
      documentCount: documents.length,
    });

    const results = await knowledgeBaseService.ingest({ tenantId, documents });

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    return res.status(200).json({
      message: `Ingested ${successCount} documents, ${failedCount} failed`,
      results,
    });
  } catch (error) {
    logger.error('Ingest failed', { error });
    return res.status(500).json({
      error: 'Internal server error during ingestion',
    });
  }
});

/**
 * POST /api/knowledge/search
 * ナレッジベース検索
 */
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { query, tenantId, topK, minScore } = req.body as SearchQuery;

    // バリデーション
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'query is required and must be a string',
      });
    }

    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId is required',
      });
    }

    logger.debug('Search request received', {
      tenantId,
      queryLength: query.length,
    });

    const results = await knowledgeBaseService.search({
      query,
      tenantId,
      topK: topK || 3,
      minScore: minScore || 0.5,
    });

    return res.status(200).json({
      results,
      count: results.length,
    });
  } catch (error) {
    logger.error('Search failed', { error });
    return res.status(500).json({
      error: 'Internal server error during search',
    });
  }
});

/**
 * GET /api/knowledge/documents/:tenantId
 * テナントのドキュメント一覧取得
 */
router.get('/documents/:tenantId', (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId is required',
      });
    }

    const documents = knowledgeBaseService.getDocuments(tenantId);

    return res.status(200).json({
      documents,
      count: documents.length,
    });
  } catch (error) {
    logger.error('Get documents failed', { error });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/knowledge/documents/:tenantId/:documentId
 * ドキュメント削除
 */
router.delete('/documents/:tenantId/:documentId', async (req: Request, res: Response) => {
  try {
    const { tenantId, documentId } = req.params;

    if (!tenantId || !documentId) {
      return res.status(400).json({
        error: 'tenantId and documentId are required',
      });
    }

    const deleted = await knowledgeBaseService.deleteDocument(documentId, tenantId);

    if (!deleted) {
      return res.status(404).json({
        error: 'Document not found or access denied',
      });
    }

    return res.status(200).json({
      message: 'Document deleted successfully',
    });
  } catch (error) {
    logger.error('Delete document failed', { error });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * DELETE /api/knowledge/documents/:tenantId
 * テナントの全ドキュメント削除
 */
router.delete('/documents/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;

    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId is required',
      });
    }

    const deletedCount = await knowledgeBaseService.deleteAllForTenant(tenantId);

    return res.status(200).json({
      message: `Deleted ${deletedCount} documents for tenant ${tenantId}`,
      deletedCount,
    });
  } catch (error) {
    logger.error('Delete all documents failed', { error });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

/**
 * GET /api/knowledge/stats
 * 統計情報取得
 */
router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = knowledgeBaseService.getStats();

    return res.status(200).json(stats);
  } catch (error) {
    logger.error('Get stats failed', { error });
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
});

export default router;
