import * as https          from 'https';
import * as http           from 'http';
import { randomUUID }      from 'crypto';
import { VeyaConfig }      from './types';
import {
  VeyaError,
  VeyaAuthenticationError,
  VeyaRateLimitError,
  VeyaConflictError,
  VeyaValidationError,
  VeyaNotFoundError,
  VeyaTimeoutError,
} from './errors';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const SDK_VERSION         = '1.0.0';
const DEFAULT_BASE_URL    = 'https://veyaos.xyz/api/v1';
const DEFAULT_TIMEOUT     = 30_000;
const DEFAULT_MAX_RETRIES = 3;

// HTTP status codes we will automatically retry
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

// Node.js network error codes we will automatically retry
const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'EPIPE',
]);

// ─────────────────────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────────────────────

export class VeyaClient {
  private readonly apiKey:     string;
  private readonly baseUrl:    string;
  private readonly timeout:    number;
  private readonly maxRetries: number;

  constructor(config: VeyaConfig) {
    this.apiKey     = config.apiKey;
    this.baseUrl    = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.timeout    = config.timeout    ?? DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  }

  // ─────────────────────────────────────────────────────────────
  // SECURITY: Prevent API key from leaking into logs
  //
  // When a developer does console.log(veyaClient) or an error
  // tracking tool (Sentry, Datadog) serializes this object,
  // they will see [REDACTED] instead of the live API key.
  // ─────────────────────────────────────────────────────────────

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return {
      _class:     'VeyaClient',
      apiKey:     this.apiKey
                    ? `${this.apiKey.slice(0, 7)}...[REDACTED]`
                    : '[NOT SET]',
      baseUrl:    this.baseUrl,
      timeout:    this.timeout,
      maxRetries: this.maxRetries,
    };
  }

  toJSON() {
    return {
      _class:  'VeyaClient',
      apiKey:  '[REDACTED]',
      baseUrl: this.baseUrl,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Public HTTP Methods
  // ─────────────────────────────────────────────────────────────

  async get<T>(path: string): Promise<T> {
    return this.requestWithRetry<T>('GET', path);
  }

  async post<T>(
    path:            string,
    body:            object,
    idempotencyKey?: string
  ): Promise<T> {
    // Always attach an idempotency key to POST requests.
    // If the merchant provides one (e.g. tied to their order ID),
    // we use it. Otherwise we auto-generate a UUID.
    // This guarantees safe retries without duplicate resource creation.
    return this.requestWithRetry<T>(
      'POST',
      path,
      body,
      idempotencyKey ?? randomUUID()
    );
  }

  async delete<T>(path: string): Promise<T> {
    return this.requestWithRetry<T>('DELETE', path);
  }

  // ─────────────────────────────────────────────────────────────
  // Retry Logic with Exponential Backoff + Jitter
  // ─────────────────────────────────────────────────────────────

  private async requestWithRetry<T>(
    method:           string,
    path:             string,
    body?:            object,
    idempotencyKey?:  string,
    attempt:          number = 0
  ): Promise<T> {
    try {
      return await this.request<T>(method, path, body, idempotencyKey);
    } catch (error) {
      const shouldRetry =
        this.isRetryable(error) && attempt < this.maxRetries;

      if (!shouldRetry) {
        throw error;
      }

      // Exponential backoff: 500ms → 1000ms → 2000ms
      // Jitter: adds 0-200ms random offset to prevent thundering herd
      // (thundering herd = all clients retrying at exactly the same time
      //  after a server blip, which causes another overload spike)
      const baseDelay = Math.pow(2, attempt) * 500;
      const jitter    = Math.random() * 200;
      await this.sleep(baseDelay + jitter);

      return this.requestWithRetry<T>(
        method,
        path,
        body,
        idempotencyKey,
        attempt + 1
      );
    }
  }

  private isRetryable(error: unknown): boolean {
    // Rate limit errors: always retry (after waiting retryAfter seconds)
    if (error instanceof VeyaRateLimitError) return true;

    // Specific HTTP status codes that indicate transient server issues
    if (error instanceof VeyaError) {
      return RETRYABLE_STATUS_CODES.has(error.statusCode);
    }

    // Network-level errors (connection reset, timeout, DNS failure)
    if (error instanceof Error && 'code' in error) {
      return RETRYABLE_NETWORK_CODES.has(
        (error as NodeJS.ErrnoException).code ?? ''
      );
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────
  // Core HTTP Request
  // ─────────────────────────────────────────────────────────────

  private request<T>(
    method:          string,
    path:            string,
    body?:           object,
    idempotencyKey?: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url     = new URL(`${this.baseUrl}${path}`);
      const payload = body ? JSON.stringify(body) : undefined;

      const headers: Record<string, string> = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'User-Agent':    `veya-node/${SDK_VERSION}`,
      };

      // Attach idempotency key on POST requests
      if (idempotencyKey) {
        headers['Idempotency-Key'] = idempotencyKey;
      }

      // Set Content-Length for POST/PUT requests
      // Required by some proxies and helps with connection reuse
      if (payload) {
        headers['Content-Length'] = Buffer.byteLength(payload).toString();
      }

      const transport = url.protocol === 'https:' ? https : http;

      const req = transport.request(
        url,
        { method, headers, timeout: this.timeout },
        (res) => {
          const chunks: Buffer[] = [];

          res.on('data',  (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);

          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');

            // Parse the response body
            let parsed: unknown;
            try {
              parsed = raw ? JSON.parse(raw) : {};
            } catch {
              return reject(
                new VeyaError(
                  'The API returned an invalid response. ' +
                  'Please contact Veya support if this persists.',
                  500,
                  'parse_error'
                  // Note: we do NOT pass raw here
                  // Raw server responses may contain sensitive data
                  // and should not be stored even in non-enumerable fields
                  // when the content is completely unexpected/malformed
                )
              );
            }

            const statusCode = res.statusCode ?? 500;

            if (statusCode >= 200 && statusCode < 300) {
              return resolve(parsed as T);
            }

            return reject(this.buildError(statusCode, parsed));
          });
        }
      );

      // Handle request timeout
      req.on('timeout', () => {
        req.destroy();
        reject(new VeyaTimeoutError());
      });

      // Handle network-level errors
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (
          err.code  === 'ETIMEDOUT' ||
          err.message.toLowerCase().includes('timeout')
        ) {
          return reject(new VeyaTimeoutError());
        }
        reject(err);
      });

      if (payload) req.write(payload);
      req.end();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Error Builder
  // Maps HTTP status codes to typed error classes
  // ─────────────────────────────────────────────────────────────

  private buildError(status: number, body: unknown): VeyaError {
    const b          = body as Record<string, any>;
    const message    = b?.error ?? b?.message ?? 'An unexpected error occurred.';
    const fields     = b?.fields;
    const retryAfter = b?.retryAfter ? Number(b.retryAfter) : undefined;

    switch (status) {
      case 400: return new VeyaValidationError(message, fields, body);
      case 401: return new VeyaAuthenticationError(message, body);
      case 404: return new VeyaNotFoundError(message, body);
      case 409: return new VeyaConflictError(message, body);
      case 429: return new VeyaRateLimitError(message, retryAfter, body);
      default:  return new VeyaError(
                  message,
                  status,
                  b?.code ?? 'api_error',
                  body
                );
    }
  }
}
