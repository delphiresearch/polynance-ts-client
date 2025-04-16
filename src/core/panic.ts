// src/core/errors.ts
import { AxiosError } from 'axios';

/**
 * Polynance SDKで発生する可能性のあるエラーコードを定義します。
 * AIがエラーの種類を特定しやすくするために使用されます。
 */
export enum PolynanceErrorCode {
    // --- 通信・リクエストエラー ---
    NETWORK_ERROR = 'ERR_NETWORK',          // DNS解決失敗、TCP接続拒否などの一般的なネットワーク問題
    TIMEOUT_ERROR = 'ERR_TIMEOUT',          // APIリクエストのタイムアウト
    API_REQUEST_FAILED = 'ERR_API_REQUEST', // APIリクエスト失敗（HTTPステータスコードが2xx以外）
    SSE_CONNECTION_FAILED = 'ERR_SSE_CONNECT', // SSE接続の確立失敗
    SSE_MESSAGE_ERROR = 'ERR_SSE_MESSAGE',  // SSEメッセージの受信または解析中のエラー
    SSE_CLOSED = 'ERR_SSE_CLOSED',          // SSE接続が予期せずクローズされた

    // --- 入力・バリデーションエラー ---
    INVALID_PARAMETER = 'ERR_INVALID_PARAM', // 必須パラメータの欠落や不正な値
    VALIDATION_ERROR = 'ERR_VALIDATION',    // レスポンスデータの形式不正など

    // --- APIサーバー起因のエラー ---
    SERVER_ERROR = 'ERR_SERVER',          // 5xx系のサーバーエラー
    NOT_FOUND = 'ERR_NOT_FOUND',          // 404 Not Found
    UNAUTHORIZED = 'ERR_UNAUTHORIZED',    // 401 Unauthorized
    FORBIDDEN = 'ERR_FORBIDDEN',        // 403 Forbidden
    RATE_LIMIT_EXCEEDED = 'ERR_RATE_LIMIT', // 429 Rate limit exceeded

    // --- SDK内部エラー ---
    INTERNAL_SDK_ERROR = 'ERR_SDK_INTERNAL', // SDK内部の予期せぬロジックエラー
    ENVIRONMENT_ERROR = 'ERR_ENVIRONMENT',   // EventSourceが存在しないなど、実行環境の問題
}

/**
 * PolynanceClientから発生するAPI関連エラーのためのカスタムエラークラス。
 * デバッグやAIとの連携を容易にするための構造化されたコンテキストを提供します。
 */
export class PolynanceApiError extends Error {
    /** エラーの種類を識別するSDK固有のコード。 */
    public readonly code: PolynanceErrorCode;
    /** 可能であれば、元のエラーオブジェクト（例: AxiosError）。 */
    public readonly originalError?: Error | AxiosError;
    /** APIレスポンスの結果である場合、HTTPステータスコード。 */
    public readonly statusCode?: number;
    /** エラーが発生したSDKメソッドの名前。 */
    public readonly methodName?: string;
    /** エラーレスポンスボディのデータ（もしあれば）。 */
    public readonly responseData?: any;
    /** エラー発生時のコンテキスト情報（例: パラメータ、URL）。機密情報は含めないこと。 */
    public readonly context?: Record<string, any>;
    /** このエラーインスタンス固有のID（ログ追跡用）。 */
    public readonly errorId: string;

    constructor(
        message: string,
        code: PolynanceErrorCode,
        options?: {
            cause?: Error | AxiosError;
            methodName?: string;
            statusCode?: number;
            responseData?: any;
            context?: Record<string, any>;
        }
    ) {
        // エラーオブジェクト自体のメッセージを詳細化
        let detailedMessage = `[${code}] ${message}`;
        if (options?.methodName) detailedMessage += ` (Method: ${options.methodName})`;
        if (options?.statusCode) detailedMessage += ` (Status: ${options.statusCode})`;

        super(detailedMessage); // 整形したメッセージを Error クラスに渡す
        this.name = 'PolynanceApiError';
        this.code = code;
        this.originalError = options?.cause;
        this.methodName = options?.methodName;
        this.statusCode = options?.statusCode;
        this.responseData = options?.responseData;
        this.context = options?.context;
        // ユニークなエラーIDを生成
        this.errorId = `pn-err-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

        // スタックトレースを正しくキャプチャ
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, PolynanceApiError);
        }

        // ログ出力時に冗長にならないよう、一部プロパティは列挙不可に設定（任意）
        Object.defineProperty(this, 'originalError', { enumerable: false });
        Object.defineProperty(this, 'stack', { enumerable: false });
    }

    /**
     * ログ出力やAIへのコンテキスト共有に適した、人間が読みやすい文字列を生成します。
     * コピー＆ペーストでの利用を想定しています。
     */
    public toString(): string {
        let str = `--- Polynance SDK Error ---\n`;
        str += `Error ID: ${this.errorId}\n`;
        str += `Code: ${this.code}\n`;
        str += `Message: ${this.message}\n`; // super() に渡した整形済みメッセージを利用
        if (this.methodName) str += `Method: ${this.methodName}\n`;
        if (this.statusCode) str += `Status Code: ${this.statusCode}\n`;
        if (this.context && Object.keys(this.context).length > 0) {
            try {
                // コンテキストを安全に文字列化（例: 大きすぎるオブジェクトは省略）
                const contextStr = JSON.stringify(this.context, (key, value) =>
                    typeof value === 'object' && value !== null && JSON.stringify(value).length > 500
                        ? '[Object too large]'
                        : value
                , 2); // インデント付きで見やすく
                str += `Context: ${contextStr}\n`;
            } catch {
                 str += `Context: [Could not stringify context]\n`;
            }
        }
        if (this.responseData) {
            try {
                // レスポンスデータを安全に文字列化
                const responseDataStr = JSON.stringify(this.responseData, null, 2);
                str += `Response Data: ${responseDataStr.length > 1000 ? responseDataStr.substring(0, 1000) + '... [Truncated]' : responseDataStr}\n`;
            } catch {
                str += `Response Data: [Could not stringify response data]\n`;
            }
        }
        // 元のエラー情報も簡潔に含める (オプション)
        if (this.originalError) {
            str += `Original Error: ${this.originalError.name}: ${this.originalError.message}\n`;
        }
        // toString() にはスタックトレース全体を含めず、必要なら .stack プロパティを参照
        str += `---------------------------\n`;
        return str;
    }

    /**
     * より簡潔なエラー概要を提供します。ログのサマリーなどに利用できます。
     */
    public get summary(): string {
        return `[${this.code}] ${this.message.split(' (Method:')[0].trim()} ${this.statusCode ? `(HTTP ${this.statusCode})` : ''} (ID: ${this.errorId})`;
    }
}