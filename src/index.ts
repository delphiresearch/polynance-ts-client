/**
 * Polynance TypeScript Client
 * 予測市場のアグリゲータSDK
 * polymarket、limitless、truemarketの3つのプロトコルをサポート
 */

// クライアントクラスのエクスポート
export { PolynanceClient, PolynanceClientOptions } from './core/client';

// 型定義のエクスポート
export {
  Protocol,
  PredictionMarketEvent,
  SimpleMarket,
  PredictionMarketComment,
  OrderBookSummary,
  OrderBookLevel,
  FillEventData
} from './types/common';

/**
 * SDKの使用例:
 * 
 * ```typescript
 * import { PolynanceClient, Protocol } from 'polynance-ts-client';
 * 
 * // クライアントの初期化
 * const client = new PolynanceClient();
 * 
 * // 進行中のイベント一覧を取得
 * async function getEvents() {
 *   try {
 *     const events = await client.getOngoingEvents('polymarket');
 *     console.log(events);
 *   } catch (error) {
 *     console.error('Error fetching events:', error);
 *   }
 * }
 * 
 * // 取引イベントの購読（ブラウザ環境のみ）
 * function subscribeTrades() {
 *   const eventSource = client.subscribeFillEvents('polymarket', `${yesToken}${noToken}`, (data) => {
 *     console.log('New trade:', data);
 *   });
 *   
 *   // 購読の停止
 *   setTimeout(() => {
 *     eventSource.close();
 *   }, 60000);
 * }
 * ```
 */




