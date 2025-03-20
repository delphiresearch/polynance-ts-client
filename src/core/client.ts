
import axios, { AxiosInstance } from 'axios';
import Redis from 'ioredis';
import { Protocol, PredictionMarketEvent, SimpleMarket, PredictionMarketComment, OrderBookSummary, FillEventData } from '../types/common';
import dotenv from 'dotenv';

dotenv.config();

/**
 * PolynanceClient設定オプション
 */
export interface PolynanceClientOptions {

    /**
   * APIのベースURL
   */
  apiBaseUrl?: string;

  /**
   * Redisの接続URL
   */
  redisUrl?: string;
  
  /**
   * SSEサーバーのベースURL
   */
  sseBaseUrl?: string;
}

/**
 * 予測市場のアグリゲータクライアント
 * polymarket、limitless、truemarketの3つのプロトコルをサポート
 */
export class PolynanceClient {
  private apiClient: AxiosInstance;
  private redisClient: Redis | null = null;
  private sseBaseUrl: string;

  /**
   * PolynanceClientのコンストラクタ
   * @param options クライアント設定オプション
   */
  constructor() {
    // デフォルト値の設定
    const apiBaseUrl = process.env.POLYNANCE_API_URL || 'http://localhost:8091/';
    this.sseBaseUrl = process.env.POLYNANCE_SSE_URL || 'http://localhost:3030/';
    
    // APIクライアントの初期化
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
   * @param protocol プロトコル名
   * @param eventId イベントID
   * @returns イベント情報
   */
  async getEvent(protocol: Protocol, eventId: string | number): Promise<PredictionMarketEvent> {
    try {
      const response = await this.apiClient.get(`/protocols/${protocol}/events/${eventId}`);
      return response.data;
    } catch (error) {
      this.handleError('getEvent', error);
      throw error;
    }
  }
  
  /**
   * 指定されたプロトコルとマーケットIDに対応するマーケット情報を取得
   * @param protocol プロトコル名
   * @param marketId マーケットID
   * @returns マーケット情報
   */
  async getMarket(protocol: Protocol, marketId: string | number): Promise<SimpleMarket> {
    try {
      const response = await this.apiClient.get(`/protocols/${protocol}/markets/${marketId}`);
      return response.data;
    } catch (error) {
      this.handleError('getMarket', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルの進行中のイベント一覧を取得
   * @param protocol プロトコル名
   * @param page ページ番号（デフォルト: 1）
   * @param limit 1ページあたりの件数（デフォルト: 50）
   * @returns イベント一覧
   */
  async getOngoingEvents(protocol: Protocol, page: number = 1, limit: number = 50): Promise<PredictionMarketEvent[]> {
    try {
      const response = await this.apiClient.get(`/protocols/${protocol}/ongoing-events`, {
        params: { page, limit },
      });
      return response.data;
    } catch (error) {
      this.handleError('getOngoingEvents', error);
      throw error;
    }
  }

  /**
   * 指定されたプロトコルとイベントIDに対応するコメント一覧を取得
   * @param protocol プロトコル名
   * @param eventId イベントID
   * @returns コメント一覧
   */
  async getEventComments(protocol: Protocol, eventId: string | number): Promise<PredictionMarketComment[]> {
    try {
      const response = await this.apiClient.get(`/protocols/${protocol}/events/${eventId}/comments`);
      return response.data;
    } catch (error) {
      this.handleError('getEventComments', error);
      throw error;
    }
  }
  
  /**
   * 指定されたプロトコルとマーケットIDに対応するオーダーブック情報を取得
   * @param protocol プロトコル名
   * @param marketId マーケットID
   * @returns オーダーブック情報
   */
  async getOrderbook(protocol: Protocol, marketId: string | number): Promise<Record<string, OrderBookSummary>> {
    try {
      // APIバリデーションエラーが発生するため、モックデータを返す
      
      const response = await this.apiClient.get(`/protocols/${protocol}/markets/${marketId}/orderbook`);
      return response.data;
    } catch (error) {
      this.handleError('getOrderbook', error);
      throw error;
    }
  }
  
  /**
   * 指定されたプロトコルとIDに対応する取引イベントをSSEで購読
   * @param protocol プロトコル名
   * @param id イベントIDまたはマーケットID
   * @returns EventSource インスタンスと最新の取引データを含むオブジェクト
   */
  subscribeFillEvents(
    protocol: Protocol,
    id: string | number
  ): { eventSource: EventSource, latestData: { current: FillEventData | null } } {
    
    const url = `${this.sseBaseUrl}sse/fillevent?protocol=${protocol}&id=${id}`;
    const eventSource = new EventSource(url);
    
    // 最新データを保持するオブジェクト
    const latestData = { current: null as FillEventData | null };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as FillEventData;
        // 最新データを更新
        latestData.current = data;
        
        // ここでデータを受信したことをログに出力（デバッグ用）
        console.log(`Received fill event data for ${protocol}/${id}:`, data);
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };
    
    return { eventSource, latestData };
  }
  

  /**
   * クライアントの終了処理
   */
  async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
    }
  }
  
  /**
   * エラーハンドリング
   * @param method エラーが発生したメソッド名
   * @param error エラーオブジェクト
   */
  private handleError(method: string, error: any): void {
    if (axios.isAxiosError(error)) {
      console.error(`PolynanceClient.${method} error:`, error.response?.data || error.message);
    } else {
      console.error(`PolynanceClient.${method} error:`, error);
    }
  }
}