// src/core/client.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider, JsonRpcSigner } from "@ethersproject/providers";
import { constants, ethers } from "ethers";
import { Chain, ClobClient, getContractConfig, OpenOrder, OrderType, Side,UserOrder } from '@polymarket/clob-client';
import {SignedOrder} from "@polymarket/order-utils";
import { PolynanceApiError, PolynanceErrorCode } from './panic'; // Import from new error file
import {
    PredictionProvider,
    Market,
    MarketDiscussion,
    OrderBookSummary,
    TradeRecord,
    Exchange,
    SearchFilter,
    Trader,
    TraderPosition,
    ExecuteOrderParams,
    TradeUpdateHandlers,
    TradeSubscription,
    MarketMatchResult,
    PolynanceClientOptions,
    Candle,
    PolyOrder
} from './types';

const minimunAbi = {
    "usdc": [
      "function approve(address, uint256) returns (bool)",
      "function allowance(address, address) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)"
    ],
    "ctf": [
      "function setApprovalForAll(address, bool) returns (bool)",
      "function isApprovedForAll(address, address) view returns (bool)",
      "function balanceOf(address, uint256) view returns (uint256)"
    ]
}

// --- Polynance Client Class ---

/**
 * The main client class for interacting with the Polynance API.
 * Provides methods to fetch prediction market data and subscribe to real-time events.
 */
export class PolynanceSDK {
    private apiClient: AxiosInstance;
    private sseBaseUrl: string;
    public polymarketClob: ClobClient;
    private wallet?: Wallet | JsonRpcSigner;
    private walletAddress?: string;
    private pendingOrderIds: string[] = [];

    /**
     * Creates an instance of the PolynanceClient.
     * @param options - Optional configuration for the client, such as API URLs and timeout.
     */
    constructor(options?: PolynanceClientOptions) {
        const apiBaseUrl = options?.apiBaseUrl || 'https://api.polynance.ag';
        this.sseBaseUrl = options?.sseBaseUrl || 'https://api.polynance.ag'; // Default SSE URL
        const timeout = options?.timeout || 100000; // Default timeout 100s

        this.apiClient = axios.create({
            baseURL: apiBaseUrl,
            timeout: timeout,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.wallet = options?.wallet;
        if(this.wallet && this.wallet instanceof JsonRpcSigner) {
            if(options?.walletAddress) {
                this.walletAddress = options.walletAddress;
            }else {
                throw new Error("walletAddress is required when wallet is JsonRpcSigner");
            }
        }
        this.polymarketClob = new ClobClient("https://clob.polymarket.com/", Chain.POLYGON)

        // Optional: Interceptors can also use handleError
        // this.apiClient.interceptors.response.use(response => response, error => {
        //     return Promise.reject(this.handleError(error, 'AxiosInterceptor', { url: error.config?.url }));
        // });
    }

    public async initCreds(wallet: JsonRpcSigner|Wallet) {
        try {
            const clobClient = new ClobClient(
                "https://clob.polymarket.com/", 
                Chain.POLYGON, 
                wallet
            )
            let creds = await clobClient.deriveApiKey();
            if(!creds.key) {
                console.log("[initCredsinitCreds] deriveApiKey failed, creating new api key");
                creds = await clobClient.createApiKey();
            }
            console.log("[initCredsinitCreds] initCreds", creds);
            this.polymarketClob = new ClobClient(
                "https://clob.polymarket.com/", 
                Chain.POLYGON, 
                wallet,
                creds
            )
        }catch(e) {
            throw this.handleError(e, 'initCreds', {});
        }
    }

    public async buildOrder(params: ExecuteOrderParams, wallet?: JsonRpcSigner|Wallet) {

        if(params.provider!=="polymarket") {
            throw new Error("Now Only Polymarket is supported");
        }

        if(!this.polymarketClob.creds) {
            const w = wallet||this.wallet;
            if(!w) {
                throw new Error("Wallet is required to execute order");
            }
            await this.initCreds(w)
        }

        const exchange =await(async () =>{
            try{
            const isSlug = params.marketIdOrSlug.includes("-");
            if(isSlug) {
                const exchange = await this.getExchangeBySlug(params.marketIdOrSlug)
                return exchange[0]
            } else {
                return await this.getExchange("polymarket", params.marketIdOrSlug)
            }}catch(e) {
                console.log(e)
                return null
            }
        })();

        if(!exchange) {
            throw this.handleError(new Error("Exchange not found"), 'buildOrder', { params });
        }

        const uo = await(async ()=>{
            try {
                const positionToken = exchange.position_tokens.find((pt)=>pt.name.toLowerCase()==params.positionIdOrName.toLowerCase());
                if(!positionToken) {
                    throw new Error("Position token not found");
                }
                const price = params.price ? params.price : Number(positionToken.price);
                const size = params.size ? params.size :  params.usdcFlowAbs / price;
                console.log("report of ctf tokenQty", params.buyOrSell=="BUY" ? size : -size);
                console.log("usdcFlow              ", params.usdcFlowAbs);
                console.log(`                      $${price};${price*size}==${params.usdcFlowAbs}`);
                const userOrder: UserOrder = {
                    ...params,
                    tokenID: positionToken.token_id,
                    side: params.buyOrSell=="BUY" ? Side.BUY : Side.SELL,
                    price: price,
                    size: size,
                }
                return userOrder;
            }catch(e) {
               return null;
            }
        })();

        if(!uo) {
            throw this.handleError(new Error("UserOrder not found"), 'buildOrder', { params });
        }

        try {
            const signedOrder = await this.polymarketClob.createOrder(uo);
            return signedOrder;
        }catch(e) {
            throw this.handleError(e, 'buildOrder', { userOrder: uo });
        }
    }

    public async executeOrder(order: SignedOrder,orderType: OrderType=OrderType.GTC,rpcProvider?: JsonRpcProvider,wallet?: JsonRpcSigner|Wallet): Promise<OpenOrder|any> {
        try {
            if(!wallet && !this.wallet) {
                throw new Error("Wallet is required to approve allowance");
            }
            if(!this.wallet?.provider&&!rpcProvider) {
                throw new Error("Wallet is required to execute order");
            }
            const provider = this.wallet?.provider ? this.wallet : rpcProvider;
            if(!provider) throw new Error("Provider is required to execute order");
            await this.approveAllowanceBalance(provider);
            const res = await this.polymarketClob.postOrder(order,orderType);
            if(res?.orderID) {
                const op = await this.polymarketClob.getOrder(res.orderID);
                if(op.status.toLowerCase() !== "matched") {
                    this.pendingOrderIds.push(res.orderID);
                }
                return op;
            }
            this.proposePrice(order);
            return res;
        }catch(e) {
            this.handleError(e, 'executeOrder', { order });
            return null;
        }
    }

    public getPendingOrdersIds(): string[] {
        return [...this.pendingOrderIds];
    }

    public async waitOrderMatched(orderId: string): Promise<boolean> {
        try {
            const op = await this.polymarketClob.getOrder(orderId);
            return op.status.toLowerCase() === "matched";
        }catch(e) {
            return false;
        }
    }

    private async approveAllowanceBalance(
        provider: JsonRpcProvider|Wallet|JsonRpcSigner,
    ) {
        try{

            const contractConfig = getContractConfig(Chain.POLYGON);
           
            //TODO
            const walletAddress = provider instanceof Wallet ? await provider.getAddress() : this.walletAddress;
            const usdc = new ethers.Contract(contractConfig.collateral, minimunAbi["usdc"], provider);
            const ctf = new ethers.Contract(contractConfig.conditionalTokens, minimunAbi["ctf"], provider);

            const usdcAllowanceNegRiskAdapterPromise = usdc.allowance(
                walletAddress,
                contractConfig.negRiskAdapter,
              );
              
              const usdcAllowanceNegRiskExchangePromise = usdc.allowance(
                  walletAddress,
                  contractConfig.negRiskExchange,
              );
              
              const conditionalTokensAllowanceNegRiskExchangePromise = ctf.isApprovedForAll(
                  walletAddress,
                  contractConfig.negRiskExchange,
              );
              
              const conditionalTokensAllowanceNegRiskAdapterPromise = ctf.isApprovedForAll(
                  walletAddress,
                  contractConfig.negRiskAdapter,
              );

              const usdcBalancePromise = usdc.balanceOf(walletAddress);

              

              const [
                usdcAllowanceNegRiskAdapter,
                usdcAllowanceNegRiskExchange,
                conditionalTokensAllowanceNegRiskExchange,
                conditionalTokensAllowanceNegRiskAdapter,
                usdcBalance,
              ] = await Promise.all([
                usdcAllowanceNegRiskAdapterPromise,
                usdcAllowanceNegRiskExchangePromise,
                conditionalTokensAllowanceNegRiskExchangePromise,
                conditionalTokensAllowanceNegRiskAdapterPromise,
                usdcBalancePromise,
              ]);
              
              let txn;
              if (!usdcAllowanceNegRiskAdapter.gt(constants.Zero)) {
                txn = await usdc.approve(contractConfig.negRiskAdapter, constants.MaxUint256, {
                    gasPrice: 100_000_000_000,
                    gasLimit: 200_000,
                });
                console.log(`[USDC->NegRiskAdapter]: ${txn.hash}`);
              }
              if (!usdcAllowanceNegRiskExchange.gt(constants.Zero)) {
                  txn = await usdc.approve(contractConfig.negRiskExchange, constants.MaxUint256, {
                      gasPrice: 100_000_000_000,
                      gasLimit: 200_000,
                  });
                  console.log(`[USDC->NegRiskExchange]: ${txn.hash}`);
              }
              if (!conditionalTokensAllowanceNegRiskExchange) {
                  txn = await ctf.setApprovalForAll(contractConfig.negRiskExchange, true, {
                      gasPrice: 100_000_000_000,
                      gasLimit: 200_000,
                  });
                  console.log(`[CTF->NegRiskExchange]: ${txn.hash}`);
              }
              if (!conditionalTokensAllowanceNegRiskAdapter) {
                  txn = await ctf.setApprovalForAll(contractConfig.negRiskAdapter, true, {
                      gasPrice: 100_000_000_000,
                      gasLimit: 200_000,
                  });
                  console.log(`[CTF->NegRiskAdapter]: ${txn.hash}`);
              }
              console.log(txn ? txn.hash : "allowance already set")
              
              return Number(usdcBalance.toString());
        }catch(e) {
            throw this.handleError(e, 'approveAllowance', {});
        }
    }

    public async getConditionalTokensBalance(tokenId: string,walletAddress?: string) {
        const contractConfig = getContractConfig(Chain.POLYGON);
        if(!this.wallet) {
            throw new Error("Wallet is required to get balance");
        }
        const adder = walletAddress||this.walletAddress||this.wallet.getAddress();
        const ctf = new ethers.Contract(contractConfig.conditionalTokens, minimunAbi["ctf"], this.wallet);
        const balance = await ctf.balanceOf(adder, tokenId);
        return Number(balance.toString());
    }

    public async getUSDCBalance(walletAddress?: string) {
        const contractConfig = getContractConfig(Chain.POLYGON);
        if(!this.wallet) {
            throw new Error("Wallet is required to get balance");
        }
        const adder = walletAddress||this.walletAddress||this.wallet.getAddress();
        const usdc = new ethers.Contract(contractConfig.collateral, minimunAbi["usdc"], this.wallet);
        const balance = await usdc.balanceOf(adder);
        return Number(balance.toString());
    }

    public async proposePrice(order: SignedOrder) {
        try {
            const polyOrder = this.toPolyOrder(order);
            const res = await this.apiClient.post("/v1/proposePrice", {order: polyOrder});
            return res;
        }catch(e) {
            return null;
        }
    }

    public async verifyPrice() {
        try {
            await this.apiClient.post("/v1/verifyPrice");
        }catch(e) {
            return null;
        }
    }

    public async scanPendingPriceData() {
        try {
            const res = await this.apiClient.get<{result: boolean}>("/v1/scanPendingPriceData");
            return res.data.result;
        }catch(e) {
            this.handleError(e, 'scanPendingPriceData');
            return false;
        }
    }



    private toPolyOrder(o: SignedOrder): PolyOrder {
        return {
          salt:          o.salt,
          maker:         o.maker,
          signer:        o.signer,
          taker:         o.taker,
          tokenId:       o.tokenId,
          makerAmount:   o.makerAmount,
          takerAmount:   o.takerAmount,
          expiration:    o.expiration,
          nonce:         o.nonce,
          feeRateBps:    o.feeRateBps.toString(),
          side:          o.side.toString(),
          signatureType: o.signatureType.toString(),
          signature:     o.signature,
        };
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

    public asContext<T>(
        data: T,
        prompt?: string
      ): string {
        const indentSize = 2;
        const prefix = prompt ? `\n${prompt}\n------\n` : "";
        const pad = (lvl: number) => " ".repeat(lvl * indentSize);
        const defaultFormatter = (path: string, value: unknown, level: number) =>
          `${pad(level)}${path} : ${String(value)}`;
    
        const fmt = defaultFormatter;
        const skipUndefined = true
      
        const walk = (value: unknown, path: string[], level: number, out: string[]) => {
          if (value === null || typeof value !== "object") {
            const line = fmt(path.join("."), value, level);
            if (line !== null) out.push(line);
            return;
          }
      
          if (Array.isArray(value)) {
            value.forEach((v, i) => walk(v, [...path, `[${i}]`], level, out));
            return;
          }
          const keys = Object.keys(value as Record<string, unknown>);
          keys.sort();
      
          for (const k of keys) {
            const v = (value as Record<string, unknown>)[k];
            if (v === undefined && skipUndefined) continue;
            walk(v, [...path, k], level + 1, out);
          }
        };
      
        const lines: string[] = [];
        walk(data, [], 0, lines);
        return prefix + lines.join("\n");
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

    public async getTrader(protocol: PredictionProvider,traderAddress: string): Promise<Trader> {
        const methodName = 'getTrader';
        const context = { protocol, traderAddress: traderAddress ? '***' : traderAddress }; // Mask potentially long address
        if (!traderAddress) {
            throw new PolynanceApiError("Missing required parameter 'traderAddress'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!protocol) {
            throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<Trader>(`/v1/trader/${traderAddress}`,{
                params: { protocol },
            });
            return response.data;
        } catch (error) {
            throw this.handleError(error, methodName, context);
        }
    }

    public async traderPositions(protocol: PredictionProvider,traderAddress: string): Promise<TraderPosition[]> {
        const methodName = 'traderPositions';
        const context = { protocol, traderAddress: traderAddress ? '***' : traderAddress }; // Mask potentially long address
        if (!traderAddress) {
            throw new PolynanceApiError("Missing required parameter 'traderAddress'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        if (!protocol) {
            throw new PolynanceApiError("Missing required parameter 'protocol'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<TraderPosition[]>(`/v1/trader/${traderAddress}/positions`,{
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
           if (response.status === 404 || response.data.length === 0) {
              throw new PolynanceApiError(`Market with slug '${slug}' not found.`, PolynanceErrorCode.NOT_FOUND, {methodName, context, statusCode: 404});
           }
           return response.data;
       } catch (error) {
           // If it was an Axios 404, handleError will set NOT_FOUND code
           throw this.handleError(error, methodName, context);
       }
   }

   async getExchangeBySlug(slug: string): Promise<Exchange[]> {
       const methodName = 'getExchangeBySlug';
       const context = { slug: slug ? '***' : slug }; // Mask potentially long slug
        if (!slug) {
             throw new PolynanceApiError("Missing required parameter 'slug'.", PolynanceErrorCode.INVALID_PARAMETER, { methodName, context });
        }
        try {
            const response = await this.apiClient.get<Exchange[]>('/v1/agg/market', {
                params: { slug }
            });
            // Optionally, check for 404 specifically if desired
            if (response.status === 404 || response.data.length === 0) {
               throw new PolynanceApiError(`Exchange with slug '${slug}' not found.`, PolynanceErrorCode.NOT_FOUND, {methodName, context, statusCode: 404});
            }
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

        function asContext<T>(
    data: T
  ): string {
    const indentSize = 2;
    const pad = (lvl: number) => " ".repeat(lvl * indentSize);
    const defaultFormatter = (path: string, value: unknown, level: number) =>
      `${pad(level)}${path} : ${String(value)}`;

    const fmt = defaultFormatter;
    const skipUndefined = true
  
    const walk = (value: unknown, path: string[], level: number, out: string[]) => {
      if (value === null || typeof value !== "object") {
        const line = fmt(path.join("."), value, level);
        if (line !== null) out.push(line);
        return;
      }
  
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, [...path, `[${i}]`], level, out));
        return;
      }
      const keys = Object.keys(value as Record<string, unknown>);
      keys.sort();
  
      for (const k of keys) {
        const v = (value as Record<string, unknown>)[k];
        if (v === undefined && skipUndefined) continue;
        walk(v, [...path, k], level + 1, out);
      }
    };
  
    const lines: string[] = [];
    walk(data, [], 0, lines);
    return lines.join("\n");
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