// src/core/client.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcSigner } from "@ethersproject/providers";
import { ApiKeyCreds, Chain, ClobClient, getContractConfig } from '@polymarket/clob-client';
import { PolynanceApiError, PolynanceErrorCode } from './panic'; // Import from new error file
import {
    PredictionProvider,
    Market,
    MarketDiscussion,
    OrderBookSummary,
    TradeRecord,
    Exchange,
    SearchFilter
} from './types';

/**
 * Configuration options for the PolynanceClient.
 */
export interface PolynanceClientOptions {
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


// --- Polynance Client Class ---

/**
 * The main client class for interacting with the Polynance API.
 * Provides methods to fetch prediction market data and subscribe to real-time events.
 */
export class PolynanceClient {
    private apiClient: AxiosInstance;
    private sseBaseUrl: string;
    public clobClient?: ClobClient;

    /**
     * Creates an instance of the PolynanceClient.
     * @param options - Optional configuration for the client, such as API URLs and timeout.
     */
    constructor(options?: PolynanceClientOptions) {
        const apiBaseUrl = options?.apiBaseUrl || 'http://57.180.216.102:9000';
        this.sseBaseUrl = options?.sseBaseUrl || 'http://57.180.216.102:9000'; // Default SSE URL
        const timeout = options?.timeout || 100000; // Default timeout 100s

        this.apiClient = axios.create({
            baseURL: apiBaseUrl,
            timeout: timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Optional: Interceptors can also use handleError
        // this.apiClient.interceptors.response.use(response => response, error => {
        //     return Promise.reject(this.handleError(error, 'AxiosInterceptor', { url: error.config?.url }));
        // });
    }

    public async initPolymarketClobClient(wallet: JsonRpcSigner|Wallet) {
        const tmp = new ClobClient("https://clob.polymarket.com/", Chain.POLYGON, wallet)
        const cred = await tmp.createOrDeriveApiKey()
        this.clobClient = new ClobClient(
            "https://clob.polymarket.com/", 
            Chain.POLYGON, 
            wallet,
            cred
        )
        return this.clobClient;
    }

    /**
     * Handles errors, logs them, and wraps them in a PolynanceApiError.
     * @param error - The error object caught.
     * @param methodName - The name of the method where the error originated.
     * @param context - Additional context about the operation (e.g., parameters).
     * @returns A PolynanceApiError instance.
     * @private
     */
    private handleError(error: any, methodName: string, context?: Record<string, any>): PolynanceApiError {
        if (error instanceof PolynanceApiError) {
            // If it's already our custom error, just log and return it.
            console.error(`Polynance SDK Error (already wrapped): ${error.summary}`, error); // Log summary
            return error;
        }

        let code: PolynanceErrorCode;
        let message: string;
        let statusCode: number | undefined;
        let responseData: any;
        let originalError: Error | AxiosError | undefined = error instanceof Error ? error : undefined;

        if (axios.isAxiosError(error)) {
            statusCode = error.response?.status;
            responseData = error.response?.data;
            originalError = error; // Ensure originalError is set

            // Add request URL to context if available
            const errorContext = { ...context, url: error.config?.url, requestMethod: error.config?.method?.toUpperCase() };

            if (error.code === 'ECONNABORTED' || error.message.toLowerCase().includes('timeout')) {
                code = PolynanceErrorCode.TIMEOUT_ERROR;
                message = `API request timed out.`;
            } else if (error.response) {
                // Error with a response status code
                message = `API request failed with status ${statusCode}.`;
                switch (statusCode) {
                    case 400: code = PolynanceErrorCode.INVALID_PARAMETER; break; // Or more specific based on responseData
                    case 401: code = PolynanceErrorCode.UNAUTHORIZED; break;
                    case 403: code = PolynanceErrorCode.FORBIDDEN; break;
                    case 404: code = PolynanceErrorCode.NOT_FOUND; break;
                    case 429: code = PolynanceErrorCode.RATE_LIMIT_EXCEEDED; break;
                    case 500: case 501: case 502: case 503: case 504:
                        code = PolynanceErrorCode.SERVER_ERROR; break;
                    default: code = PolynanceErrorCode.API_REQUEST_FAILED; break;
                }
                // Include server message if available
                 if (responseData?.message) {
                    message += ` Server message: ${responseData.message}`;
                 } else if (responseData?.error) {
                     message += ` Server error: ${responseData.error}`;
                 }

            } else if (error.request) {
                // Request was made but no response received
                code = PolynanceErrorCode.NETWORK_ERROR;
                message = `Network error: No response received from the API server.`;
            } else {
                // Error setting up the request
                code = PolynanceErrorCode.API_REQUEST_FAILED;
                message = `Failed to setup the API request: ${error.message}`;
            }

            const apiError = new PolynanceApiError(message, code, {
                cause: originalError,
                methodName,
                statusCode,
                responseData,
                context: errorContext
            });
            console.error(`Polynance SDK Error: ${apiError.summary}`, apiError); // Log summary and full error object
            return apiError;

        } else {
            // Unexpected non-Axios error
            code = PolynanceErrorCode.INTERNAL_SDK_ERROR;
            message = `An unexpected internal SDK error occurred.`;
            originalError = error instanceof Error ? error : new Error(String(error));
            message += ` Details: ${originalError.message}`;

            const apiError = new PolynanceApiError(message, code, {
                cause: originalError,
                methodName,
                context
            });
            console.error(`Polynance SDK Error: ${apiError.summary}`, apiError); // Log summary and full error object
            return apiError;
        }
    }


    /**
     * Retrieves detailed information for a specific market by its ID and prediction provider.
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param marketId - The unique identifier of the market.
     * @returns A Promise resolving to the `Market` object.
     * @throws {PolynanceApiError} If parameters are invalid or the API request fails.
     */
    async getMarket(protocol: PredictionProvider, marketId: string): Promise<Market> {
        const methodName = 'getMarket';
        const context = { protocol, marketId: marketId ? '***' : marketId }; // Mask potentially long ID
        if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!marketId) {
            throw new PolynanceApiError("Missing required parameter 'marketId'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<Market>(`/v1/events/${marketId}`, {
                params: { protocol },
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }

    /**
     * Retrieves detailed information for a specific exchange by its ID and prediction provider.
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param exchangeId - The unique identifier of the exchange.
     * @returns A Promise resolving to the `Exchange` object.
     * @throws {PolynanceApiError} If parameters are invalid or the API request fails.
     */
    async getExchange(protocol: PredictionProvider, exchangeId: string): Promise<Exchange> {
        const methodName = 'getExchange';
        const context = { protocol, exchangeId: exchangeId ? '***' : exchangeId }; // Mask potentially long ID
        if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!exchangeId) {
            throw new PolynanceApiError("Missing required parameter 'exchangeId'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<Exchange>(`/v1/markets/${exchangeId}`, {
                params: { protocol },
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }

    /**
     * Retrieves a list of currently active markets for a specific prediction provider.
     * Supports pagination.
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param page - The page number to retrieve (1-based). Defaults to 1.
     * @param limit - The maximum number of markets per page. Defaults to 50.
     * @returns A Promise resolving to an array of `Market` objects.
     * @throws {PolynanceApiError} If parameters are invalid or the API request fails.
     */
    async getActiveMarkets(protocol: PredictionProvider, page: number = 1, limit: number = 50): Promise<Market[]> {
        const methodName = 'getActiveMarkets';
        const context = { protocol, page, limit };
         if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (page < 1) {
            throw new PolynanceApiError("Parameter 'page' must be 1 or greater.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
         if (limit < 1) {
            throw new PolynanceApiError("Parameter 'limit' must be 1 or greater.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<Market[]>('/v1/ongoing-events', {
                params: { protocol, page, limit },
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }

    /**
     * Retrieves a list of discussions associated with a specific market.
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param marketId - The unique identifier of the market.
     * @returns A Promise resolving to an array of `MarketDiscussion` objects.
     * @throws {PolynanceApiError} If parameters are invalid or the API request fails.
     */
    async getMarketDiscussions(protocol: PredictionProvider, marketId: string): Promise<MarketDiscussion[]> {
        const methodName = 'getMarketDiscussions';
        const context = { protocol, marketId: marketId ? '***' : marketId };
         if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!marketId) {
            throw new PolynanceApiError("Missing required parameter 'marketId'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<MarketDiscussion[]>(`/v1/events/${marketId}/comments`, {
                params: { protocol },
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }

    /**
     * Retrieves the current order book summary for a specific exchange.
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param exchangeId - The unique identifier of the exchange.
     * @returns A Promise resolving to a Record mapping asset IDs to `OrderBookSummary` objects.
     * @throws {PolynanceApiError} If parameters are invalid or the API request fails.
     */
    async getOrderbook(protocol: PredictionProvider, exchangeId: string): Promise<Record<string, OrderBookSummary>> {
        const methodName = 'getOrderbook';
        const context = { protocol, exchangeId: exchangeId ? '***' : exchangeId };
        if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!exchangeId) {
            throw new PolynanceApiError("Missing required parameter 'exchangeId'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<Record<string, OrderBookSummary>>(`/v1/markets/${exchangeId}/orderbook`, {
                params: { protocol },
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }

    /**
     * Retrieves the historical price history for all position tokens in a specific exchange.
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param exchangeId - The unique identifier of the exchange.
     * @returns A Promise resolving to a 2D array of `TradeRecord`, organized by position token index.
     * @throws {PolynanceApiError} If parameters are invalid or the API request fails.
     */
    async getPriceHistory(protocol: PredictionProvider, exchangeId: string): Promise<TradeRecord[][]> {
         const methodName = 'getPriceHistory';
         const context = { protocol, exchangeId: exchangeId ? '***' : exchangeId };
         if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!exchangeId) {
            throw new PolynanceApiError("Missing required parameter 'exchangeId'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<TradeRecord[][]>(`/v1/markets/${exchangeId}/orderbook/filledevents`, {
                params: { protocol },
            });
            return response.data;
        } catch (error) {
             throw this.handleError(error, methodName, context);
        }
    }

   /**
    * Retrieves a list of all available market slugs across all prediction providers.
    * Supports pagination. Slugs are URL-friendly identifiers for markets.
    * @param page - The page number to retrieve (1-based). Defaults to 1.
    * @param limit - The maximum number of slugs per page. Defaults to 100.
    * @returns A Promise resolving to an array of market slug strings.
    * @throws {PolynanceApiError} If the API request fails.
    */
   async getSlugs(page: number = 1, limit: number = 100): Promise<string[]> {
       const methodName = 'getSlugs';
       const context = { page, limit };
       if (page < 1) {
           throw new PolynanceApiError("Parameter 'page' must be 1 or greater.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
       }
       if (limit < 1) {
           throw new PolynanceApiError("Parameter 'limit' must be 1 or greater.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
       }
       try {
           const response = await this.apiClient.get<string[]>('/v1/agg/sluglist', {
               params: { page, limit }
           });
           return response.data;
       } catch (error) {
           throw this.handleError(error, methodName, context);
       }
   }

   /**
    * Retrieves market information using its unique slug.
    * A single slug might resolve to multiple markets if the same market exists on different prediction providers.
    * @param slug - The URL-friendly identifier of the market.
    * @returns A Promise resolving to an array of `Market` objects matching the slug.
    * @throws {PolynanceApiError} If the slug is missing or the API request fails.
    */
   async getMarketBySlug(slug: string): Promise<Market[]> {
       const methodName = 'getMarketBySlug';
       const context = { slug: slug ? '***' : slug }; // Mask potentially long slug
        if (!slug) {
             throw new PolynanceApiError("Missing required parameter 'slug'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
       try {
           const response = await this.apiClient.get<Market[]>('/v1/agg', {
               params: { slug }
           });
           // Optionally, check for 404 specifically if desired
           // if (response.status === 404 || response.data.length === 0) {
           //    throw new PolynanceApiError(`Market with slug '${slug}' not found.`, PolynanceErrorCode.NOT_FOUND, {methodName, context, statusCode: 404});
           // }
           return response.data;
       } catch (error) {
           // If it was an Axios 404, handleError will set NOT_FOUND code
           throw this.handleError(error, methodName, context);
       }
   }

   /**
    * Searches for prediction markets using a natural language query.
    * Allows filtering by prediction provider, comment inclusion, result count, and similarity threshold.
    * @param query - The search query string (e.g., "Who will win the next US election?").
    * @param filter - Optional filtering parameters (`SearchFilter`).
    * @returns A Promise resolving to an array of `MarketMatchResult` objects, sorted by relevance.
    * @throws {PolynanceApiError} If the query is missing or the API request fails.
    */
    async search(query: string, filter?: Partial<SearchFilter>): Promise<MarketMatchResult[]> {
        const methodName = 'search';
        const context = { query: query ? `"${query.substring(0, 50)}${query.length > 50 ? '...' : ''}"` : query, filter }; // Log truncated query
        if (!query) {
             throw new PolynanceApiError("Missing required parameter 'query'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const params: any = { query };
            if (filter) {
                if (filter.topK !== undefined) params.topK = filter.topK;
                if (filter.protocols !== undefined && filter.protocols.length > 0) params.protocols = filter.protocols.join(',');
                if (filter.isIncludeComment !== undefined) params.isIncludeComment = filter.isIncludeComment;
                if (filter.threshold !== undefined) params.threshold = filter.threshold;
            }

            const response = await this.apiClient.get<MarketMatchResult[]>('/v1/agg/retrieve', { params });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }


    /**
     * Subscribes to real-time trade updates for a specific exchange or identifier via Server-Sent Events (SSE).
     *
     * **Note:** This requires a browser environment or a Node.js environment with an `EventSource` polyfill.
     *
     * @param protocol - The prediction provider identifier (e.g., 'polymarket').
     * @param id - The identifier for the event stream, typically the exchange ID.
     * @param handlers - Optional callback functions for handling SSE lifecycle events (`onOpen`, `onMessage`, `onError`).
     * @returns A `TradeSubscription` object containing the `EventSource` instance and methods to control the subscription.
     * @throws {PolynanceApiError} If `EventSource` is unavailable or parameters are invalid.
     */
    subscribeToTrades(
        protocol: PredictionProvider,
        id: string,
        handlers?: TradeUpdateHandlers
    ): TradeSubscription {
        const methodName = 'subscribeToTrades';
        const context = { protocol, id: id ? '***' : id };

        // Check for EventSource availability
        if (typeof EventSource === 'undefined') {
             throw new PolynanceApiError(
                 "EventSource is not available in this environment. Ensure you are in a browser or have a suitable polyfill.",
                 PolynanceErrorCode.ENVIRONMENT_ERROR,
                 { methodName, context }
             );
        }
        // Validate parameters
         if (!protocol) {
             throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!id) {
            throw new PolynanceApiError("Missing required parameter 'id'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }

        const url = `${this.sseBaseUrl}/sse/fillevent?protocol=${protocol}&id=${id}`;
        let eventSource: EventSource;
         try {
             eventSource = new EventSource(url);
         } catch (error) {
             // Catch potential synchronous errors during EventSource creation
              const initError = this.handleError(error, methodName, {...context, url});
              // Ensure it has a relevant code if generic
              if (initError.code === PolynanceErrorCode.INTERNAL_SDK_ERROR) {
                console.error("EventSource failed:", initError);
              }
             throw initError;
         }

        let latestData: TradeRecord | null = null;

        // --- SSE Event Listeners ---

        eventSource.onopen = (ev) => {
            console.log(`SSE connection opened: ${protocol}/${id}`);
            if (handlers?.onOpen) {
                try {
                    handlers.onOpen(ev);
                } catch (handlerError) {
                    console.error("Error in SSE 'onOpen' handler:", this.handleError(handlerError, `${methodName}.onOpen`, context));
                }
            }
        };

        eventSource.onmessage = (event) => {
            try {
                if (typeof event.data !== 'string') {
                     throw new Error('Received non-string SSE message data.'); // Convert to error for unified handling
                }
                const data = JSON.parse(event.data) as TradeRecord;

                if (typeof data.price !== 'number' || typeof data.volumeBase !== 'number' || typeof data.timestamp !== 'number') {
                     throw new Error('Received SSE message with unexpected data structure.'); // Validation error
                }

                latestData = data;

                if (handlers?.onMessage) {
                    try {
                       handlers.onMessage(data);
                    } catch (handlerError) {
                       console.error("Error in SSE 'onMessage' handler:", this.handleError(handlerError, `${methodName}.onMessage`, context));
                       // Optionally, trigger onError as well if a handler error is critical
                       // if (handlers.onError) { ... }
                    }
                }
            } catch (error) {
                const parseError = new PolynanceApiError(
                    `Failed to process SSE message: ${error instanceof Error ? error.message : String(error)}`,
                    PolynanceErrorCode.SSE_MESSAGE_ERROR,
                    {
                        methodName: `${methodName}.onMessage`,
                        cause: error instanceof Error ? error : undefined,
                        context: { ...context, rawData: event.data?.substring(0, 100) } // Include snippet of raw data
                    }
                );
                console.error(parseError.summary, parseError); // Log the parsing error

                if (handlers?.onError) {
                     try {
                         handlers.onError(parseError);
                     } catch (handlerError) {
                         console.error("Error calling SSE 'onError' handler after message error:", this.handleError(handlerError, `${methodName}.onError`, context));
                     }
                 }
            }
        };

        eventSource.onerror = (ev) => {
            // Create a PolynanceApiError to pass to the handler
            const isClosed = eventSource.readyState === EventSource.CLOSED;
            const errorCode = isClosed ? PolynanceErrorCode.SSE_CLOSED : PolynanceErrorCode.SSE_CONNECTION_FAILED;
            const errorMessage = isClosed ? `SSE connection closed unexpectedly for ${protocol}/${id}.` : `SSE connection error occurred for ${protocol}/${id}.`;

             const sseError = new PolynanceApiError(errorMessage, errorCode, {
                 methodName: `${methodName}.onError`,
                 cause: new Error(`SSE Error Event: ${JSON.stringify(ev)}`), // Wrap original event info
                 context
             });
             console.error(sseError.summary, sseError); // Log the error

            if (handlers?.onError) {
                 try {
                    handlers.onError(sseError);
                 } catch (handlerError) {
                    console.error("Error calling SSE 'onError' handler:", this.handleError(handlerError, `${methodName}.onError`, context));
                 }
            }

             if (isClosed) {
                 // Optionally implement automatic reconnection logic here if desired
                 console.warn(`SSE connection for ${protocol}/${id} is closed. Automatic reconnection not implemented.`);
             }
        };

        // --- Subscription Control Methods ---

        const close = () => {
            if (eventSource && eventSource.readyState !== EventSource.CLOSED) {
                console.log(`Closing SSE connection: ${protocol}/${id}...`);
                eventSource.close();
            }
        };

        return {
            eventSource,
            close,
            getLatestData: () => latestData,
        };
    }

} // End of PolynanceClient class


// --- Utility Functions ---

/**
 * Generates price chart data (OHLCV) from a list of trade records.
 *
 * @param tradeRecords - An array of `TradeRecord` objects representing trades. Assumes timestamps are in **seconds**.
 * @param intervalMillis - The desired candlestick interval duration in **milliseconds**.
 * @param fromTimeMillis - The start timestamp (Unix milliseconds) for the desired data range (inclusive).
 * @param toTimeMillis - The end timestamp (Unix milliseconds) for the desired data range (exclusive).
 * @returns An array of `Candle` objects, sorted by time. Returns an empty array if no valid events fall within the range.
 * @throws {PolynanceApiError} if intervalMillis is not positive.
 */
export function generatePriceChart(
    tradeRecords: TradeRecord[],
    intervalMillis: number,
    fromTimeMillis: number,
    toTimeMillis: number
): Candle[] {
    const methodName = 'generatePriceChart';
    if (intervalMillis <= 0) {
        throw new PolynanceApiError("Candlestick intervalMillis must be positive.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context: { intervalMillis } });
    }
     if (!tradeRecords || tradeRecords.length === 0) {
         return [];
     }

    // Filter and sort events (ensure timestamps are handled correctly)
    const filteredRecords = tradeRecords
        .filter(record =>
            typeof record.timestamp === 'number' &&
            typeof record.price === 'number' &&
            typeof record.volumeBase === 'number' &&
            record.timestamp * 1000 >= fromTimeMillis &&
            record.timestamp * 1000 < toTimeMillis
        )
        .map(record => ({
            timestampMillis: record.timestamp * 1000,
            price: record.price,
            volumeBase: record.volumeBase
        }))
        .sort((a, b) => a.timestampMillis - b.timestampMillis);


    if (filteredRecords.length === 0) {
        return [];
    }

    const candleMap = new Map<number, Candle>();

    for (const record of filteredRecords) {
        const bucketStartTimeMillis = Math.floor(record.timestampMillis / intervalMillis) * intervalMillis;
        const bucketStartTimeSeconds = Math.floor(bucketStartTimeMillis / 1000);

        const existingCandle = candleMap.get(bucketStartTimeSeconds);

        if (!existingCandle) {
            candleMap.set(bucketStartTimeSeconds, {
                time: bucketStartTimeSeconds,
                open: record.price,
                high: record.price,
                low: record.price,
                close: record.price,
                volume: record.volumeBase,
            });
        } else {
            existingCandle.high = Math.max(existingCandle.high, record.price);
            existingCandle.low = Math.min(existingCandle.low, record.price);
            existingCandle.close = record.price; // Last price updates close
            existingCandle.volume += record.volumeBase;
        }
    }

    // Convert map values to array and sort
    const candles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

    return candles;
}