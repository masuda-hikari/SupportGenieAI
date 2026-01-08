# SupportGenieAI

AIを活用したカスタマーサポートチャットボットプラットフォーム

## 概要

SupportGenieAIは、企業がカスタマーサポートを効率化するためのAIチャットボットSaaSです。FAQ・ドキュメントをインポートするだけで、顧客からの問い合わせに24時間365日自動対応します。

### 主な機能

- **インテリジェント応答**: Claude/GPTを活用した自然な会話
- **ナレッジベース統合**: 企業独自のFAQ・ドキュメントを学習
- **シームレスなエスカレーション**: AIが対応できない場合は人間エージェントへ自動転送
- **簡単導入**: 数行のコードでWebサイトに埋め込み可能
- **マルチテナント**: 複数企業を完全に分離して運用

## ビジネスモデル

SupportGenieAIは**月額サブスクリプション**で提供されます。

| プラン | 月間会話数 | 料金 |
|--------|-----------|------|
| Starter | 500まで | $49/月 |
| Business | 5,000まで | $199/月 |
| Enterprise | 無制限 | 要見積 |

**導入効果**: AIが問い合わせの60-80%を自動処理することで、サポートスタッフの負荷を大幅に削減→人件費削減効果がサブスクリプション費用を大きく上回ります。

## セットアップ

### 必要条件

- Node.js 18+
- npm または yarn
- LLM APIキー（Claude または OpenAI）
- PostgreSQL（本番環境用）

### インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-org/SupportGenieAI.git
cd SupportGenieAI

# 依存関係をインストール
cd server
npm install

# 環境変数を設定
cp .env.example .env
# .envファイルを編集してAPIキーを設定
```

### 環境変数

```env
PORT=3000
NODE_ENV=development
ANTHROPIC_API_KEY=your-claude-api-key
OPENAI_API_KEY=your-openai-api-key  # オプション
DATABASE_URL=postgresql://user:pass@localhost:5432/supportgenie
```

### 開発サーバー起動

```bash
npm run dev
```

サーバーは `http://localhost:3000` で起動します。

## 使い方（クライアント企業向け）

### 1. チャットウィジェットの埋め込み

Webサイトに以下のコードを追加するだけ:

```html
<script src="https://cdn.supportgenie.ai/widget.js"></script>
<script>
  SupportGenie.init({
    apiKey: 'your-api-key',
    theme: 'light'
  });
</script>
```

### 2. ナレッジベースの設定

管理画面からFAQやドキュメントをアップロード:

- PDF、Word、テキストファイル対応
- URLからのクロール機能
- 手動Q&A登録

### 3. カスタマイズ

- ブランドカラー・ロゴの設定
- 応答トーンの調整
- エスカレーションルールの設定

## API

### Chat API

```bash
POST /api/v1/chat
Content-Type: application/json
Authorization: Bearer <api-key>

{
  "message": "返品方法を教えてください",
  "sessionId": "user-session-123"
}
```

レスポンス:

```json
{
  "reply": "返品は商品到着後14日以内に承っております...",
  "confidence": 0.92,
  "sources": ["FAQ#12", "返品ポリシー.pdf"]
}
```

## 開発

### ディレクトリ構造

```
SupportGenieAI/
├── server/           # バックエンドAPI
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── services/
│   │   └── ai/
│   └── package.json
├── frontend/         # チャットウィジェット
├── scripts/          # データ処理スクリプト
├── tests/            # テスト
└── docs/             # ドキュメント
```

### テスト実行

```bash
npm test
```

### ビルド

```bash
npm run build
```

## ライセンス

Proprietary - All Rights Reserved

## サポート

- ドキュメント: https://docs.supportgenie.ai
- お問い合わせ: support@supportgenie.ai
