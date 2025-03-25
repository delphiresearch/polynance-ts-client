import { PolynanceClient, Protocol } from './src';
import dotenv from 'dotenv';

// 環境変数の読み込み
dotenv.config();

// EventSourceのモック（Node.js環境用）
if (typeof window === 'undefined') {
  // @ts-ignore
  global.EventSource = class EventSource {
    constructor(url: string) {
      console.log(`EventSource created with URL: ${url}`);
    }
    onmessage: ((event: any) => void) | null = null;
    onerror: ((event: any) => void) | null = null;
    close() {
      console.log('EventSource closed');
    }
  };
}

/**
 * 結果を整形して表示する関数
 */
function displayResult(methodName: string, result: any): void {
  console.log('\n' + '='.repeat(50));
  console.log(`【${methodName}の結果】`);
  console.log('='.repeat(50));
  
  if (result instanceof Error) {
    console.log('エラーが発生しました:');
    console.log(`  メッセージ: ${result.message}`);
    console.log(`  スタック: ${result.stack}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

/**
 * すべてのメソッドをテストする関数
 */
async function testAllMethods() {
  console.log('【Polynance TypeScript Client テスト】');
  console.log('開始時刻:', new Date().toLocaleString());
  console.log('-'.repeat(50));

  // クライアントの初期化
  const client = new PolynanceClient({
    apiBaseUrl: process.env.POLYNANCE_API_URL || 'http://localhost:8090',
    sseBaseUrl: process.env.POLYNANCE_SSE_URL || 'http://localhost:3030'
  });

  console.log('クライアントを初期化しました');
  console.log(`APIベースURL: ${process.env.POLYNANCE_API_URL || 'http://localhost:8090'}`);
  console.log(`SSEベースURL: ${process.env.POLYNANCE_SSE_URL || 'http://localhost:3030'}`);
  console.log('-'.repeat(50));

  // テストするプロトコルとID
  const protocols: Protocol[] = ['polymarket'];
  const testEventId = '12483';
  const testMarketId = '506729';

  // 各プロトコルでテスト
  for (const protocol of protocols) {
    console.log(`\n【${protocol}プロトコルのテスト】`);
    
    // // 1. getOngoingEvents
    // try {
    //   const events = await client.getOngoingEvents(protocol);
    //   displayResult('getOngoingEvents', events);
    // } catch (error) {
    //   displayResult('getOngoingEvents', error);
    // }

    // // 2. getEvent
    // try {
    //   const event = await client.getEvent(protocol, testEventId);
    //   displayResult('getEvent', event);
    // } catch (error) {
    //   displayResult('getEvent', error);
    // }

    // 3. getMarket
    try {
      const market = await client.getMarket(protocol, testMarketId);
      displayResult('getMarket', market);
    } catch (error) {
      displayResult('getMarket', error);
    }

    // // 4. getEventComments
    // try {
    //   const comments = await client.getEventComments(protocol, testEventId);
    //   displayResult('getEventComments', comments);
    // } catch (error) {
    //   displayResult('getEventComments', error);
    // }

    // // 5. getOrderbook
    // try {
    //   const orderbook = await client.getOrderbook(protocol, testMarketId);
    //   displayResult('getOrderbook', orderbook);
    // } catch (error) {
    //   displayResult('getOrderbook', error);
    // }

    try {
      const data = await client.getOrderBookFilledEvents(protocol, testMarketId)
      displayResult("filled", data)
    }catch(error) {
      displayResult('getOrderbook', error);
    }

    // 6. subscribeFillEvents
    console.log('\n' + '='.repeat(50));
    console.log(`【subscribeFillEventsのテスト (${protocol})】`);
    console.log('='.repeat(50));
    
    try {
      const { eventSource, latestData } = client.subscribeFillEvents(protocol, testMarketId);
      console.log('EventSourceが正常に作成されました');
      console.log('latestData:', latestData);
      
      // 5秒後にEventSourceをクローズ
      setTimeout(() => {
        eventSource.close();
        console.log('EventSourceをクローズしました');
      }, 5000);
    } catch (error) {
      console.log('subscribeFillEventsでエラーが発生しました:', error);
    }
  }

  // 7. close
  try {
    await client.close();
    console.log('\n' + '='.repeat(50));
    console.log('【closeの結果】');
    console.log('='.repeat(50));
    console.log('クライアントが正常にクローズされました');
  } catch (error) {
    displayResult('close', error);
  }

  console.log('\n' + '-'.repeat(50));
  console.log('テスト完了時刻:', new Date().toLocaleString());
}

// テストの実行
testAllMethods().catch(error => {
  console.error('テスト実行中にエラーが発生しました:', error);
});