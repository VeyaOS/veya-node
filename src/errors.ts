// ─────────────────────────────────────────────────────────────
// Base Error Class
// ─────────────────────────────────────────────────────────────

export class VeyaError extends Error {
  /** HTTP status code returned by the API */
  public readonly statusCode: number;

  /** Machine-readable error code for programmatic handling */
  public readonly code: string;

  /**
   * Raw API response body for debugging.
   *
   * SECURITY: Defined as non-enumerable so it is invisible to:
   *   - JSON.stringify()
   *   - Object.keys()
   *   - for...in loops
   *   - Error tracking tools (Sentry, Datadog, LogRocket)
   *
   * Still accessible directly via error.raw for intentional debugging.
   * This prevents sensitive customer data inside API responses from
   * being accidentally exfiltrated to third-party logging services.
   */
  public readonly raw?: unknown;

  constructor(
    message: string,
    statusCode: number,
    code: string,
    raw?: unknown
  ) {
    super(message);
    this.name       = 'VeyaError';
    this.statusCode = statusCode;
    this.code       = code;

    // Store raw response but keep it hidden from serialization
    // A merchant can still access error.raw intentionally for debugging
    // but it will NOT appear in logs or error tracking payloads
    Object.defineProperty(this, 'raw', {
      value:        raw,
      enumerable:   false,   // Hidden from JSON.stringify and for...in
      writable:     false,
      configurable: false
    });

    // Maintain correct prototype chain so instanceof checks work
    // This is required when extending built-in classes in TypeScript
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─────────────────────────────────────────────────────────────
// Specific Error Types
// ─────────────────────────────────────────────────────────────

/**
 * Thrown when the API key is missing, invalid, or revoked.
 *
 * Resolution: Check your API key in the Veya dashboard
 * under Settings → API Keys.
 */
export class VeyaAuthenticationError extends VeyaError {
  constructor(
    message = 'Invalid or missing API key. ' +
              'Verify your credentials in the Veya dashboard under Settings → API Keys.',
    raw?: unknown
  ) {
    super(message, 401, 'authentication_error', raw);
    this.name = 'VeyaAuthenticationError';
  }
}

/**
 * Thrown when you have exceeded the API rate limit.
 *
 * The retryAfter property contains how many seconds to wait
 * before making another request. The SDK retries automatically
 * up to maxRetries times before throwing this error.
 */
export class VeyaRateLimitError extends VeyaError {
  /**
   * Number of seconds to wait before retrying.
   * Undefined if the server did not provide a Retry-After value.
   */
  public readonly retryAfter?: number;

  constructor(
    message    = 'API rate limit exceeded. Reduce your request frequency.',
    retryAfter?: number,
    raw?:        unknown
  ) {
    super(message, 429, 'rate_limit_error', raw);
    this.name       = 'VeyaRateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when a duplicate request is detected.
 *
 * This typically means you sent a request with the same
 * idempotency key but different parameters. If you are
 * retrying a failed request, use the same parameters as
 * the original request.
 */
export class VeyaConflictError extends VeyaError {
  constructor(
    message = 'A conflict occurred. This resource may already exist.',
    raw?:     unknown
  ) {
    super(message, 409, 'conflict_error', raw);
    this.name = 'VeyaConflictError';
  }
}

/**
 * Thrown when request parameters fail validation.
 *
 * The fields property maps parameter names to error messages
 * describing exactly what is wrong with each field.
 */
export class VeyaValidationError extends VeyaError {
  /**
   * Map of field names to their specific validation error messages.
   * @example { amount: 'Must be greater than 0', currency: 'Invalid currency code' }
   */
  public readonly fields?: Record<string, string>;

  constructor(
    message = 'Request validation failed. Check your parameters.',
    fields?:  Record<string, string>,
    raw?:     unknown
  ) {
    super(message, 400, 'validation_error', raw);
    this.name   = 'VeyaValidationError';
    this.fields = fields;
  }
}

/**
 * Thrown when the requested resource does not exist.
 *
 * Check that the ID you provided is correct and belongs
 * to your merchant account.
 */
export class VeyaNotFoundError extends VeyaError {
  constructor(
    message = 'The requested resource was not found. ' +
              'Verify the ID is correct and belongs to your account.',
    raw?:     unknown
  ) {
    super(message, 404, 'not_found_error', raw);
    this.name = 'VeyaNotFoundError';
  }
}

/**
 * Thrown when webhook signature verification fails.
 *
 * Possible causes:
 *   - Wrong webhookSecret in your Veya config
 *   - Payload was modified after signing
 *   - Webhook is older than 5 minutes (replay attack prevention)
 *   - Timestamp is in the future (clock skew or manipulation)
 *
 * Always respond with HTTP 400 when this is thrown.
 * Never fulfill an order when this error occurs.
 */
export class VeyaWebhookSignatureError extends VeyaError {
  constructor(
    message = 'Webhook signature verification failed. ' +
              'The payload may have been tampered with or your ' +
              'webhookSecret may be incorrect.'
  ) {
    super(message, 400, 'webhook_signature_error');
    this.name = 'VeyaWebhookSignatureError';
  }
}

/**
 * Thrown when a request exceeds the configured timeout.
 *
 * The request may or may not have been processed by the server.
 * For POST requests (create operations), use idempotency keys
 * to safely retry without creating duplicates.
 */
export class VeyaTimeoutError extends VeyaError {
  constructor(
    message = 'The request timed out. ' +
              'The server may still be processing it. ' +
              'For create operations, retry using the same idempotency key.'
  ) {
    super(message, 408, 'timeout_error');
    this.name = 'VeyaTimeoutError';
  }
}
