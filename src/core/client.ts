import axios, { AxiosInstance } from 'axios';
import { Protocol, PredictionMarketEvent, PredictionMarketComment, OrderBookSummary, FillEventData, PredictionMarket } from './types';


export interface PolynanceClientOptions {
  apiBaseUrl?: string;
  redisUrl?: string;
  sseBaseUrl?: string;
}

/**
 * SSE購読時に指定可能なハンドラーの型
 */
export interface FillEventSSEHandlers {
  /**
   * SSE接続確立時のコールバック
   */
  onOpen?: (ev: Event) => void;

  /**
   * SSEメッセージ受信時のコールバック（parse済み FillEventData が渡る）
   */
  onMessage?: (data: FillEventData) => void;

  /**
   * SSE接続エラー時のコールバック
   */
  onError?: (ev: Event) => void;
}

/**
 * SSE購読が返す購読インスタンスの型
 */
export interface FillEventSubscription {
  /**
   * EventSource のインスタンス
   */
  eventSource: EventSource;

  /**
   * SSE購読を終了（接続をClose）するためのメソッド
   */
  close: () => void;

  /**
   * 直近の SSE メッセージ内容を取得するためのメソッド
   */
  getLatestData: () => FillEventData | null;
}

/**
 * 予測市場のアグリゲータクライアント
 */
export class PolynanceClient {
  private apiClient: AxiosInstance;
  private sseBaseUrl: string;

  constructor(options?: PolynanceClientOptions) {
    const apiBaseUrl = options?.apiBaseUrl || 'http://57.180.216.102:9000';
    this.sseBaseUrl = options?.sseBaseUrl ||  'http://57.180.216.102:9000';

    this.apiClient = axios.create({
      baseURL: apiBaseUrl,
      timeout: 100000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * 指定されたプロトコルとイベントIDに対応するイベント情報を取得
   */
  async getEvent(protocol: Protocol, eventId: string): Promise<PredictionMarketEvent> {
    try {
      const response = await this.apiClient.get(`/v1/events/${eventId}`, {
        params: { protocol },
      });
      return response.data;
    } catch (error) {
      this.handleError('getEvent', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルとマーケットIDに対応するマーケット情報を取得
   */
  async getMarket(protocol: Protocol, marketId: string): Promise<PredictionMarket> {
    try {
      const response = await this.apiClient.get(`/v1/markets/${marketId}`, {
        params: { protocol },
      });
      return response.data;
    } catch (error) {
      this.handleError('getMarket', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルの進行中のイベント一覧を取得
   */
  async getOngoingEvents(protocol: Protocol, page: number = 1, limit: number = 50): Promise<PredictionMarketEvent[]> {
    try {
      const response = await this.apiClient.get('/v1/ongoing-events', {
        params: { protocol, page, limit },
      });
      return response.data;
    } catch (error) {
      this.handleError('getOngoingEvents', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルとイベントIDに対応するコメント一覧を取得
   */
  async getEventComments(protocol: Protocol, eventId: string): Promise<PredictionMarketComment[]> {
    try {
      const response = await this.apiClient.get(`/v1/events/${eventId}/comments`, {
        params: { protocol },
      });
      return response.data;
    } catch (error) {
      this.handleError('getEventComments', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルとマーケットIDに対応するオーダーブック情報を取得
   */
  async getOrderbook(protocol: Protocol, marketId: string): Promise<Record<string, OrderBookSummary>> {
    try {
      const response = await this.apiClient.get(`/v1/markets/${marketId}/orderbook`, {
        params: { protocol },
      });
      return response.data;
    } catch (error) {
      this.handleError('getOrderbook', error);
      throw error;
    }
  }

/**
 * Retrieves the filled order events for position tokens in a market for the last month.
 * Returns price and timestamp data for each execution in the orderbook.
 * 
 * The response is a 2D array where the index corresponds to the position tokens
 * in the same order as they appear in the market response's position_tokens array.
 * For binary options, index 0 corresponds to "Yes" tokens.
 * 
 * @param protocol - The protocol identifier
 * @param marketId - The market identifier
 * @returns A 2D array of fill event data, organized by position token index
 */
  async getOrderBookFilledEvents(protocol: Protocol, marketId: string): Promise<FillEventData[][]> {
    try {
      const response = await this.apiClient.get(`/v1/markets/${marketId}/orderbook/filledevents`, {
        params: { protocol },
      });
      return response.data;
    } catch (error) {
      this.handleError('getOrderBookFilledEvents', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルと ID(マーケットID等) に対応する Fill イベントを SSE で購読
   *
   * @param protocol プロトコル名
   * @param id マーケットID等
   * @param handlers SSE購読時の各種コールバック (onOpen, onMessage, onError)
   * @returns SSE購読インスタンス (eventSource, close, getLatestData)
   */
  subscribeFillEvents(
    protocol: Protocol,
    id: string,
    handlers?: FillEventSSEHandlers
  ): FillEventSubscription {
    const url = `${this.sseBaseUrl}/sse/fillevent?protocol=${protocol}&id=${id}`;
    const eventSource = new EventSource(url);

    let latestData: FillEventData | null = null;

    // SSE接続が開いたとき
    eventSource.onopen = (ev) => {
      if (handlers?.onOpen) {
        handlers.onOpen(ev);
      }
    };

    // メッセージを受信したとき
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as FillEventData;
        latestData = data; // 最新データを更新

        if (handlers?.onMessage) {
          handlers.onMessage(data);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    // エラーが発生したとき
    eventSource.onerror = (ev) => {
      if (handlers?.onError) {
        handlers.onError(ev);
      } else {
        console.error('SSE connection error:', ev);
      }
    };

    const close = () => {
      eventSource.close();
    };

    return {
      eventSource,
      close,
      getLatestData: () => latestData,
    };
  }



  /**
   * エラーハンドリング
   */
  private handleError(method: string, error: any): void {
    if (axios.isAxiosError(error)) {
      console.error(`PolynanceClient.${method} error:`, error.response?.data || error.message);
    } else {
      console.error(`PolynanceClient.${method} error:`, error);
    }
  }
}

export interface Candle {
  time: number       // UNIX
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export function generateCandlestickData(
  fillEvents: FillEventData[],
  intervalMillis: number,
  fromTime: number,
  toTime: number
): Candle[] {
  // タイムスタンプを秒からミリ秒に変換する
  const convertedEvents = fillEvents.map(event => ({
    ...event,
    timestamp: event.timestamp * 1000 // 秒からミリ秒へ変換
  }));
  
  // 指定期間内の FillEventData のみに絞る
  const filteredEvents = convertedEvents.filter(
    (event) => event.timestamp >= fromTime && event.timestamp < toTime
  );

  // タイムスタンプの昇順にソート
  filteredEvents.sort((a, b) => a.timestamp - b.timestamp);

  // timeBucket(ローソク足の開始時刻)毎のローソク足データを保持するマップ
  const candleMap = new Map<number, Candle>();

  for (const event of filteredEvents) {
    // どのローソク足に属するか (interval の開始時刻) を計算
    const bucketTimeMillis = Math.floor(event.timestamp / intervalMillis) * intervalMillis;

    // すでにローソク足データがあるかチェック
    const existingCandle = candleMap.get(bucketTimeMillis);
    if (!existingCandle) {
      // 新しくローソク足を作成
      candleMap.set(bucketTimeMillis, {
        // TradingView が秒単位を想定している場合、ミリ秒→秒に変換しておく
        time: Math.floor(bucketTimeMillis / 1000),
        open: event.price,
        high: event.price,
        low: event.price,
        close: event.price,
        volume: event.volumeBase,
      });
    } else {
      // 既存のローソク足を更新
      existingCandle.high = Math.max(existingCandle.high, event.price);
      existingCandle.low = Math.min(existingCandle.low, event.price);
      existingCandle.close = event.price;
      existingCandle.volume += event.volumeBase;
    }
  }

  // Map を配列に変換し、time (秒) 昇順にソートして返却
  const candles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

  return candles;
}
