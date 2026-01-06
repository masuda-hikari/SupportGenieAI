import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { logger } from '../utils/logger';
import { AIContext, Message } from '../types/chat';

// システムプロンプト（カスタマーサポート向け）
const DEFAULT_SYSTEM_PROMPT = `あなたは親切で丁寧なカスタマーサポートAIアシスタントです。

## 役割
- 顧客からの問い合わせに迅速かつ正確に回答する
- 複雑な問題は人間のオペレーターへエスカレーションを提案する
- 常に敬語を使用し、プロフェッショナルな対応を心がける

## 回答のガイドライン
1. 簡潔で分かりやすい回答を心がける
2. 不明な点は正直に「確認が必要です」と伝える
3. 個人情報や機密情報は絶対に開示しない
4. 感情的な顧客には共感を示しつつ冷静に対応する

## 制限事項
- 推測で回答しない
- 約束や保証はしない（「〜の可能性があります」等の表現を使用）
- 他社製品やサービスの批判をしない`;

// AIサービスクラス
// LLM API（Claude/OpenAI）との統合を担当
export class AIService {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private preferredProvider: 'claude' | 'openai' | 'none' = 'none';

  constructor() {
    // Claude API初期化
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      this.preferredProvider = 'claude';
      logger.info('Claude API initialized');
    }

    // OpenAI API初期化（フォールバック用）
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
      if (this.preferredProvider === 'none') {
        this.preferredProvider = 'openai';
      }
      logger.info('OpenAI API initialized');
    }

    if (this.preferredProvider === 'none') {
      logger.warn('No LLM API key configured. AI responses will be placeholders.');
    }
  }

  // 応答生成メソッド
  async generateResponse(userMessage: string, context: AIContext): Promise<string> {
    logger.info('Generating AI response', {
      sessionId: context.sessionId,
      tenantId: context.tenantId,
      provider: this.preferredProvider,
    });

    try {
      switch (this.preferredProvider) {
        case 'claude':
          return await this.generateClaudeResponse(userMessage, context);
        case 'openai':
          return await this.generateOpenAIResponse(userMessage, context);
        default:
          return this.generatePlaceholderResponse(userMessage);
      }
    } catch (error) {
      logger.error('AI response generation failed', { error });
      // フォールバック: エラー時はプレースホルダー応答
      return this.generateErrorResponse(error);
    }
  }

  // Claude API呼び出し
  private async generateClaudeResponse(
    userMessage: string,
    context: AIContext
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    // 会話履歴をClaude形式に変換
    const messages = this.buildClaudeMessages(userMessage, context);

    logger.debug('Calling Claude API', {
      messageCount: messages.length,
      sessionId: context.sessionId,
    });

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: DEFAULT_SYSTEM_PROMPT,
      messages: messages,
    });

    // レスポンスからテキストを抽出
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text content in Claude response');
    }

    logger.info('Claude API response received', {
      sessionId: context.sessionId,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });

    return textContent.text;
  }

  // OpenAI API呼び出し
  private async generateOpenAIResponse(
    userMessage: string,
    context: AIContext
  ): Promise<string> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    // 会話履歴をOpenAI形式に変換
    const messages = this.buildOpenAIMessages(userMessage, context);

    logger.debug('Calling OpenAI API', {
      messageCount: messages.length,
      sessionId: context.sessionId,
    });

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: messages,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }

    logger.info('OpenAI API response received', {
      sessionId: context.sessionId,
      usage: response.usage,
    });

    return content;
  }

  // Claude用メッセージ配列構築
  private buildClaudeMessages(
    userMessage: string,
    context: AIContext
  ): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // 会話履歴を追加
    if (context.conversationHistory) {
      for (const msg of context.conversationHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // ナレッジベース結果があればコンテキストとして追加
    let contextPrefix = '';
    if (context.knowledgeBaseResults && context.knowledgeBaseResults.length > 0) {
      contextPrefix = '【参考情報】\n' +
        context.knowledgeBaseResults
          .map(r => `- ${r.content} (出典: ${r.source})`)
          .join('\n') +
        '\n\n【お客様のご質問】\n';
    }

    // 現在のユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: contextPrefix + userMessage,
    });

    return messages;
  }

  // OpenAI用メッセージ配列構築
  private buildOpenAIMessages(
    userMessage: string,
    context: AIContext
  ): OpenAI.ChatCompletionMessageParam[] {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
    ];

    // 会話履歴を追加
    if (context.conversationHistory) {
      for (const msg of context.conversationHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant' | 'system',
          content: msg.content,
        });
      }
    }

    // ナレッジベース結果があればコンテキストとして追加
    let contextPrefix = '';
    if (context.knowledgeBaseResults && context.knowledgeBaseResults.length > 0) {
      contextPrefix = '【参考情報】\n' +
        context.knowledgeBaseResults
          .map(r => `- ${r.content} (出典: ${r.source})`)
          .join('\n') +
        '\n\n【お客様のご質問】\n';
    }

    // 現在のユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: contextPrefix + userMessage,
    });

    return messages;
  }

  // プレースホルダー応答（APIキー未設定時）
  private generatePlaceholderResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('返品') || lowerMessage.includes('返金')) {
      return 'ご返品・返金についてのお問い合わせですね。' +
        '商品到着後14日以内であれば返品を承っております。' +
        '詳しい手順は、マイページの「注文履歴」からご確認いただけます。';
    }

    if (lowerMessage.includes('配送') || lowerMessage.includes('届')) {
      return '配送についてのお問い合わせですね。' +
        '通常、ご注文から2-3営業日でお届けします。' +
        '配送状況は、注文確認メールに記載の追跡番号でご確認いただけます。';
    }

    if (lowerMessage.includes('問い合わせ') || lowerMessage.includes('人間') || lowerMessage.includes('オペレーター')) {
      return '人間のオペレーターへのお繋ぎをご希望ですね。' +
        '「エスカレーション」ボタンを押していただくか、このチャットでその旨をお伝えください。';
    }

    return `お問い合わせありがとうございます。\n\n` +
      `「${userMessage}」についてお調べします。\n\n` +
      `※現在、AIサービスは開発中のため、プレースホルダー応答を返しています。` +
      `本番環境では、お客様のFAQ・ドキュメントに基づいた回答を提供します。`;
  }

  // エラー時の応答
  private generateErrorResponse(error: unknown): string {
    logger.error('Generating error response', { error });
    return '申し訳ございません。一時的な問題が発生しております。' +
      'しばらく時間をおいて再度お試しいただくか、' +
      '人間のオペレーターへのエスカレーションをご依頼ください。';
  }

  // 信頼度計算
  calculateConfidence(_response: string, sources: string[]): number {
    // ナレッジベースからの情報が多いほど信頼度が高い
    const baseConfidence = 0.6;
    const sourceBonus = Math.min(sources.length * 0.1, 0.3);
    return Math.min(baseConfidence + sourceBonus, 1.0);
  }

  // エスカレーション判定
  shouldEscalate(userMessage: string, _response: string, confidence: number): boolean {
    const lowerMessage = userMessage.toLowerCase();

    // 明示的なエスカレーション要求
    if (
      lowerMessage.includes('人間') ||
      lowerMessage.includes('オペレーター') ||
      lowerMessage.includes('担当者') ||
      lowerMessage.includes('責任者')
    ) {
      return true;
    }

    // 信頼度が閾値未満
    const threshold = 0.5;
    return confidence < threshold;
  }

  // プロバイダー情報取得
  getProviderInfo(): { provider: string; available: boolean } {
    return {
      provider: this.preferredProvider,
      available: this.preferredProvider !== 'none',
    };
  }
}
