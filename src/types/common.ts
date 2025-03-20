/**
 * 予測市場の共通型定義
 */

/**
 * サポートされているプロトコル
 */
export type Protocol = 'polymarket' | 'limitless' | 'truemarket';

/**
 * 予測市場のイベント情報
 */
export interface PredictionMarketEvent {
  id: string;
  protocol: Protocol;
  slug?: string;
  title?: string;
  description?: string;
  startDate?: string;
  creationDate?: string;
  endDate?: string;
  image?: string;
  icon?: string;
  active?: boolean;
  liquidity?: number;
  volume?: number;
  markets?: SimpleMarket[];
}

/**
 * 予測市場のマーケット情報
 */
export interface SimpleMarket {
  id: number;
  question: string;
  end: string;
  description: string;
  active?: boolean;
  funded: boolean;
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  spread: number;
  outcomes: string[] | string;
  outcome_prices: string[] | string;
  clob_token_ids?: string[] | string;
  position_token_ids?: string[] | string;
}

/**
 * 予測市場のコメント情報
 */
export interface PredictionMarketComment {
  id: string;
  parent_comment_id?: string;
  name?: string;
  pseudonym?: string;
  displayUsernamePublic?: boolean;
  bio?: string;
  baseAddress?: string;
  profileImage?: string;
  positions?: Record<string, any>[];
  createdAt?: string;
  reportCount?: number;
  reactionCount?: number;
  content?: string;
}

/**
 * オーダーブックのサマリー情報
 */
export interface OrderBookSummary {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
}

/**
 * オーダーブックのレベル情報
 */
export interface OrderBookLevel {
  price: number;
  size: number;
}

/**
 * 取引情報
 */
export interface FillEventData {
  price: number;
  volumeBase: number;
  timestamp: number;
}