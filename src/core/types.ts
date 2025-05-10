import { PolynanceApiError } from "./panic";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcSigner } from "@ethersproject/providers";
/**
 * Represents the supported prediction market protocols.
 */
export type PredictionProvider = 'polymarket' | 'limitless' | 'truemarket';
export type BinaryOption = 'YES' | 'NO';
/**
 * Represents detailed information about a specific prediction market.
 */
export interface Market {
    /** Unique identifier for the market. */
    id: string;
    /** The prediction provider this market belongs to. */
    protocol: PredictionProvider;
    /** Geographic or thematic region of the market. */
    region: string;
    /** URL-friendly identifier (slug) for the market. */
    slug: string;
    /** The main title or question of the market. */
    title: string;
    /** A detailed description of the market. */
    description: string;
    /** ISO 8601 timestamp for when the market is scheduled to start. */
    startDate: string;
    /** ISO 8601 timestamp for when the market was created. */
    creationDate: string;
    /** ISO 8601 timestamp for when the market is scheduled to end or resolve. */
    endDate: string;
    /** URL for the main image associated with the market. */
    image: string;
    /** URL for an icon associated with the market. */
    icon: string;
    /** Indicates if the market is currently active. */
    active: boolean;
    /** Total liquidity provided to the exchanges within this market (optional). */
    liquidity?: number;
    /** Total trading volume across the exchanges within this market (optional). */
    volume?: number;
    /** Array of individual exchanges associated with this market. */
    markets: Exchange[];
}

/**
 * Defines filter options for market search operations.
 */
export interface SearchFilter {
    /** Array of prediction providers to filter by. If omitted, searches across all supported prediction providers. */
    protocols?: PredictionProvider[];
    /** Whether to include discussions in the search context (can affect relevance). Defaults to false if omitted. */
    isIncludeComment?: boolean;
    /** The maximum number of results to return. Defaults to a server-side limit if omitted. */
    topK?: number;
    /** A similarity threshold (e.g., 0.0 to 1.0) to filter results. Only results meeting or exceeding this threshold are returned. */
    threshold?: number;
}

/**
 * Represents a specific exchange within a prediction market.
 * Often corresponds to a specific outcome or question.
 */
export interface Exchange {
    /** Unique identifier for the exchange. */
    id: string;
    /** The name or title of the exchange outcome (e.g., "Yes", "Candidate A"). */
    name: string;
    /** The specific question this exchange addresses (if different from the market title). */
    question: string;
    /** ISO 8601 timestamp for when the exchange resolves or trading ends. */
    end: string;
    /** Description specific to this exchange outcome. */
    description: string;
    /** URL for an image associated with this specific exchange. */
    image: string;
    /** URL-friendly identifier (slug) specific to this exchange (optional). */
    slug?: string;
    /** URL for an icon associated with this specific exchange. */
    icon: string;
    /** Indicates if this exchange is currently active for trading. */
    active: boolean;
    /** Indicates if the exchange has been funded (e.g., liquidity provided). */
    funded: boolean;
    /** Minimum reward size (relevant for some prediction providers/incentives, optional). */
    rewardsMinSize?: number;
    /** Maximum spread allowed for rewards (relevant for some prediction providers/incentives, optional). */
    rewardsMaxSpread?: number;
    /** Current bid-ask spread for the exchange (optional). */
    spread?: number;
    /** Array of tokens representing positions in this exchange (e.g., Yes/No tokens). */
    position_tokens: PositionToken[];
    /** Title used for grouping related exchanges (if applicable). */
    groupItemTitle: string;
}

/**
 * Represents a token associated with a specific position within an exchange.
 */
export interface PositionToken {
    /** Unique identifier for the stake token. */
    token_id: string;
    /** Name of the position (e.g., "Yes", "No"). */
    name: string;
    /** Current price of the stake token (often as a string representation of a decimal). */
    price: string;
}

/**
 * Represents a user discussion associated with a prediction market.
 */
export interface MarketDiscussion {
    /** Unique identifier for the discussion. */
    id: string;
    /** ID of the parent discussion if this is a reply, otherwise null or empty. */
    parent_comment_id: string;
    /** User's chosen display name. */
    name: string;
    /** User's pseudonym (if applicable). */
    pseudonym: string;
    /** Whether the user's display name is public. */
    displayUsernamePublic: boolean;
    /** User's biography or profile description. */
    bio: string;
    /** User's base wallet address. */
    baseAddress: string;
    /** URL for the user's profile image. */
    profileImage: string;
    /** User's positions relevant to the discussion context. */
    positions: { position: string; positionSize: string; marketId: string }[];
    /** ISO 8601 timestamp when the discussion was created. */
    createdAt: string;
    /** Number of times the discussion has been reported. */
    reportCount: number;
    /** Number of reactions (e.g., likes) the discussion has received. */
    reactionCount: number;
    /** The actual text content of the discussion. */
    content: string;
}

/**
 * Represents a snapshot summary of the order book for a specific asset within an exchange.
 */
export interface OrderBookSummary {
    /** Identifier of the exchange this order book belongs to. */
    market: string;
    /** Identifier of the specific asset (e.g., stake token) within the exchange. */
    asset_id: string;
    /** Timestamp of the order book snapshot (can be ISO string or Unix timestamp number). */
    timestamp: string | number;
    /** Array of bid levels (price and size). */
    bids: OrderBookLevel[];
    /** Array of ask levels (price and size). */
    asks: OrderBookLevel[];
    /** A hash representing the state of the order book (optional, for caching/validation). */
    hash: string;
}

/**
 * Represents a single price level within an order book (either bid or ask).
 */
export interface OrderBookLevel {
    /** The price at this level. */
    price: number;
    /** The total size (quantity) available at this price level. */
    size: number;
}

/**
 * Represents data for a single trade execution.
 */
export interface TradeRecord {
    /** The price at which the trade was executed. */
    price: number;
    /** The volume (amount) of the base asset traded. */
    volumeBase: number;
    /** Unix timestamp (in seconds) when the trade occurred. */
    timestamp: number;
}


export interface TraderPosition {
    conditionId?: string;
    marketSlug?: string;
    outcome: string;
    outcomeIndex?: number;
    size: number;
    averagePrice?: number;
    currentPrice: number;
    currentValue: number;
    initialValue: number;
    cashPnl?: number;
    percentPnl?: number;
    icon: string;
    endsOn: string; // ISO‑8601
  }
  
  export interface TraderActivity {
    txHash?: string;
    timestamp: number; // epoch seconds
    marketSlug?: string;
    side?: "BUY" | "SELL";
    outcome: string;
    price: number;
    size: number;
    usdcSize: number;
    type?: string;
  }
  
  export interface TraderStats {
    portfolioValue: number | null;
    cumulativeVolume: number | null;
    cumulativeProfit: number | null;
    totalTrades: number | null;
    balanceInProtocol?: number;
  }


export interface TraderBasic {
    tradingWallet: string;
    proxyOwner: string | null;
    name: string;
    pseudonym: string;
    bio: string;
    avatar: string;
    createdAt: string; // ISO‑8601
  }
  
  
  export interface Trader {
    user: TraderBasic;
    stats: TraderStats;
  }
  
  export interface LedgerEntry {
    blockNumber:   number;
    logIndex:      number;
    txHash:        string;
    eventType:     "PositionSplit" | "PositionsMerge" | "PayoutRedemption";
    trader:        string;
    conditionId:   string;
    indexSet:      number[];
    amount:        string;   // raw per-outcome token qty or payout for redemption
    tokenQty:      string;   // same as `amount` or indexSet.length for redemption
    collateralFlow:string;   // signed USDC flow
  }
  
//----
  export interface ExecuteOrderParams {
    marketIdOrSlug: string,
    positionIdOrName: BinaryOption, //
    buyOrSell: "BUY" | "SELL",
    usdcFlowAbs: number,
    positionQty?: number,
    size?: number,
    price?: number,
    feeRateBps?: number,
    nonce?: number,
    expiration?: number,
    taker?: string,
    provider: PredictionProvider
}

/**
 * Configuration options for the PolynanceClient.
 */
export interface PolynanceClientOptions {
  wallet?: Wallet | JsonRpcSigner;
  walletAddress?: string;
  /**
   * The base URL for the Polynance REST API.
   * @default 'http://57.180.216.102:9000'
   */
  apiBaseUrl?: string;
  /**
   * (Optional) Redis URL - potentially for future caching features. Currently unused in client logic.
   */
  redisUrl?: string;
  /**
   * The base URL for the Polynance Server-Sent Events (SSE) endpoint.
   * @default 'http://57.180.216.102:9000'
   */
  sseBaseUrl?: string;
  /**
   * Timeout for API requests in milliseconds.
   * @default 100000 (100 seconds)
   */
  timeout?: number;
}

/**
* Defines the handlers for Server-Sent Events (SSE) related to trade updates.
* Note: onError now receives a PolynanceApiError.
*/
export interface TradeUpdateHandlers {
  /**
   * Callback function executed when the SSE connection is successfully established.
   * @param ev The native Event object.
   */
  onOpen?: (ev: Event) => void;

  /**
   * Callback function executed when a new message (a trade record) is received.
   * The message data is pre-parsed into a `TradeRecord` object.
   * @param data The parsed `TradeRecord` object for the received trade.
   */
  onMessage?: (data: TradeRecord) => void;

  /**
   * Callback function executed when an error occurs with the SSE connection or message processing.
   * @param error The `PolynanceApiError` representing the error.
   */
  onError?: (error: PolynanceApiError) => void; // Changed to PolynanceApiError
}

/**
* Represents an active SSE subscription for trade updates.
*/
export interface TradeSubscription {
  /**
   * The underlying `EventSource` instance managing the connection.
   * You might use this for advanced control or debugging.
   */
  eventSource: EventSource;

  /**
   * Closes the SSE connection and stops receiving further events.
   * It's important to call this when the subscription is no longer needed
   * to free up resources.
   */
  close: () => void;

  /**
   * Retrieves the most recently received `TradeRecord` object.
   * Returns `null` if no message has been received yet.
   * Useful for getting the latest state without waiting for the next message.
   */
  getLatestData: () => TradeRecord | null;
}

/**
* Represents a search result item when retrieving markets by query.
*/
export interface MarketMatchResult {
  /** The prediction market that matched the search query. */
  event: Market;
  /** The cosine similarity score (typically 0.0 to 1.0) indicating the relevance of the market to the query. Higher is more relevant. */
  cosineSimilarity: number;
}

/**
* Represents a single candlestick data point.
*/
export interface Candle {
  /** Unix timestamp (seconds) representing the start time of the candle interval. */
  time: number;
  /** The opening price during the candle interval. */
  open: number;
  /** The highest price reached during the candle interval. */
  high: number;
  /** The lowest price reached during the candle interval. */
  low: number;
  /** The closing price at the end of the candle interval. */
  close: number;
  /** The total volume traded during the candle interval. */
  volume: number;
}
