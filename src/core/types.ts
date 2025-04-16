/**
 * Represents the supported prediction market protocols.
 */
export type PredictionProvider = 'polymarket' | 'limitless' | 'truemarket';

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