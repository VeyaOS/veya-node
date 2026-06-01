// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

export interface VeyaConfig {
  /**
   * Your Veya API key.
   * Test keys start with:  vk_test_
   * Live keys start with:  vk_live_
   *
   * Get yours from the Veya merchant dashboard under
   * Settings → API Keys.
   *
   * WARNING: Never hardcode this in client-side code.
   * Always load from environment variables.
   * @example
   * const veya = new Veya({ apiKey: process.env.VEYA_API_KEY! });
   */
  apiKey: string;

  /**
   * Your webhook signing secret.
   * Required only if you are verifying webhook events.
   *
   * Found in the Veya dashboard under Settings → Webhooks.
   * Must be at least 32 characters (use the value from the dashboard).
   *
   * WARNING: Never expose this in client-side code or logs.
   */
  webhookSecret?: string;

  /**
   * Override the API base URL.
   * Only use this for local testing or staging environments.
   * Defaults to https://veyaos.xyz/api/v1
   */
  baseUrl?: string;

  /**
   * Request timeout in milliseconds.
   * Defaults to 30000 (30 seconds).
   */
  timeout?: number;

  /**
   * Maximum number of automatic retries on transient failures.
   * The SDK uses exponential backoff with jitter between retries.
   * Defaults to 3.
   */
  maxRetries?: number;
}

// ─────────────────────────────────────────────────────────────
// Enums and Union Types
// ─────────────────────────────────────────────────────────────

export type InvoiceStatus = 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED';
export type Environment   = 'LIVE' | 'TEST';
export type WebhookEventType =
  | 'invoice.paid'
  | 'invoice.expired'
  | 'invoice.created';

// ─────────────────────────────────────────────────────────────
// Core Models
// ─────────────────────────────────────────────────────────────

export interface Invoice {
  /** Internal unique database identifier. Format: cuid */
  id: string;

  /** Human-readable invoice number. Format: INV-XXXX */
  invoiceNum: string;

  /** Invoice amount in the specified currency */
  amount: number;

  /** Currency code. Example: USD, USDT, BTC */
  currency: string;

  /** Current invoice status */
  status: InvoiceStatus;

  /** Human-readable description of the invoice */
  reference?: string;

  /** Associated customer object */
  customer?: { id: string };

  /**
   * URL to redirect your customer to complete payment.
   * Hosted by Veya.
   */
  checkoutUrl?: string;

  /**
   * Raw Bitcoin deposit address. Only included for BTC invoices.
   */
  depositAddress?: string;

  /** Environment in which this invoice was created */
  environment: Environment;

  /** ISO 8601 creation timestamp */
  createdAt: string;

  /** ISO 8601 due date. After this date the invoice expires. */
  expiresAt: string;
}

export interface Customer {
  /** Unique customer identifier. */
  id: string;
  
  /** Merchant ID */
  merchantId: string;

  /** Customer full name */
  name: string;

  /** Customer email address */
  email?: string;

  /** Customer phone number */
  phone?: string;

  /** Total number of invoices associated with this customer */
  invoiceCount: number;

  /** Total payment volume from this customer */
  totalPaid: number;

  /** ISO 8601 creation timestamp */
  createdAt: string;
}

export interface WebhookEvent {
  /** Type of event that occurred */
  type: WebhookEventType;

  /** The invoice associated with this event */
  invoice: Invoice;

  /** Unique identifier for this specific event */
  eventId: string;

  /** ISO 8601 timestamp of when the event occurred */
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────
// Request Parameters
// ─────────────────────────────────────────────────────────────

export interface CreateInvoiceRequest {
  /**
   * Amount to charge. Must be greater than 0.
   * @example 150.00
   */
  amount: number;

  /**
   * Currency code. Defaults to USD.
   * @example 'USD' | 'USDT' | 'BTC'
   */
  currency?: string;

  /**
   * Description of what the invoice is for.
   * Shown to the customer on the payment page.
   * @example 'Order #1234 - Pro Plan Subscription'
   */
  description?: string;

  /**
   * Customer email address.
   * Used to send payment receipts.
   */
  customerEmail?: string;

  /**
   * Customer full name.
   */
  customerName?: string;

  /**
   * ISO 8601 due date.
   * After this date the invoice will automatically expire.
   * @example '2025-12-31T23:59:59Z'
   */
  dueDate?: string;
}

export interface CreateCustomerRequest {
  /** Customer full name */
  name: string;

  /** Customer email address */
  email: string;

  /** Customer phone number */
  phone?: string;
}

export interface ListInvoicesParams {
  /** Filter by invoice status */
  status?: InvoiceStatus;

  /** Number of results to return. Max 100. Defaults to 20. */
  limit?: number;

  /** Page number for pagination. Starts at 1. */
  page?: number;
}

export interface ListCustomersParams {
  /** Number of results to return. Max 100. Defaults to 20. */
  limit?: number;

  /** Page number for pagination. Starts at 1. */
  page?: number;
}

// ─────────────────────────────────────────────────────────────
// Response Wrappers
// ─────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}
