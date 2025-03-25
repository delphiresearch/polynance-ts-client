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
  region?: string
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
  markets?: PredictionMarket[];
}



/**
 * 予測市場のマーケット情報
 */
export interface PredictionMarket {
  id: number;
  image: string;
  question: string;
  slug: string;
  end: string;
  icon: string;
  name: string;
  description: string;
  active?: boolean;
  funded: boolean;
  rewardsMinSize?: number;
  rewardsMaxSpread?: number;
  spread: number;
  position_tokens: PositionToken[]
}

export interface PositionToken {
  token_id: string,
  name: string,
  price: string
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
  positions?: {position: string, positionSize: string, marketId: string}[];
  createdAt?: string;
  reportCount?: number;
  reactionCount?: number;
  content?: string;
}

/**
 * オーダーブックのサマリー情報
 */
export interface OrderBookSummary {
  market?: string;
  asset_id?: string;
  timestamp: string | number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  hash?: string;
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


