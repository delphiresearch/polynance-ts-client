# Polynance TypeScript Client

予測市場のアグリゲータSDK。polymarket、limitless、truemarketの3つのプロトコルをサポートする強力なTypeScriptレイヤーです。

## 特徴

- TypeScriptで書かれた型安全なAPI
- 複数の予測市場プロトコル（polymarket、limitless、truemarket）をサポート
- RESTful APIとServer-Sent Events（SSE）の両方をサポート
- ブラウザとNode.js環境の両方で動作

## インストール

```bash
npm install polynance-ts-client
```

## 使用方法

### クライアントの初期化

```typescript
import { PolynanceClient } from 'polynance-ts-client';

// デフォルト設定でクライアントを初期化
const client = new PolynanceClient();

// カスタム設定でクライアントを初期化
const customClient = new PolynanceClient({
  apiBaseUrl: 'https://api.example.com',
  sseBaseUrl: 'https://sse.example.com',
  redisUrl: 'redis://username:password@host:port' // サーバーサイドのみ
});
```

### イベント情報の取得

```typescript
// 特定のイベント情報を取得
async function getEventInfo() {
  try {
    const event = await client.getEvent('polymarket', '12345');
    console.log('Event:', event);
  } catch (error) {
    console.error('Error fetching event:', error);
  }
}

// 進行中のイベント一覧を取得
async function getOngoingEvents() {
  try {
    const events = await client.getOngoingEvents('polymarket', 1, 50);
    console.log('Events:', events);
  } catch (error) {
    console.error('Error fetching events:', error);
  }
}
```

### マーケット情報の取得

```typescript
// 特定のマーケット情報を取得
async function getMarketInfo() {
  try {
    const market = await client.getMarket('polymarket', '67890');
    console.log('Market:', market);
  } catch (error) {
    console.error('Error fetching market:', error);
  }
}

// オーダーブック情報を取得
async function getOrderbookInfo() {
  try {
    const orderbook = await client.getOrderbook('polymarket', '67890');
    console.log('Orderbook:', orderbook);
  } catch (error) {
    console.error('Error fetching orderbook:', error);
  }
}
```

### コメント情報の取得

```typescript
// イベントのコメント一覧を取得
async function getEventComments() {
  try {
    const comments = await client.getEventComments('polymarket', '12345');
    console.log('Comments:', comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
  }
}
```

### 取引イベントの購読（ブラウザ環境）

```typescript
// 取引イベントの購読
function subscribeTrades() {
  const eventSource = client.subscribeFillEvents('polymarket', '67890', (data) => {
    console.log('New trade:', data);
    // 取引データを処理
  });
  
  // 購読の停止
  setTimeout(() => {
    eventSource.close();
  }, 60000); // 60秒後に停止
}
```

### 取引イベントの発行（サーバーサイド環境）

```typescript
// 取引イベントの発行
async function publishTradeEvent() {
  try {
    await client.publishFillEvent('polymarket', '67890', {
      price: 0.75,
      volumeBase: 100,
      timestamp: Date.now()
    });
    console.log('Trade event published');
  } catch (error) {
    console.error('Error publishing trade event:', error);
  }
}
```

### クライアントの終了

```typescript
// クライアントの終了処理（サーバーサイド環境）
async function cleanup() {
  await client.close();
  console.log('Client closed');
}
```

## 環境変数

以下の環境変数を設定することで、クライアントの動作をカスタマイズできます：

- `POLYNANCE_API_URL`: APIのベースURL（デフォルト: http://localhost:8090）
- `POLYNANCE_SSE_URL`: SSEサーバーのベースURL（デフォルト: http://localhost:3030）
- `UPSTASH_REDIS_URL`: Redisの接続URL（サーバーサイド環境のみ）

## ライセンス

ISC