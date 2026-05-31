import { VeyaClient }           from '../client';
import { VeyaValidationError }  from '../errors';
import {
  Invoice,
  CreateInvoiceRequest,
  ListInvoicesParams,
  ApiResponse,
} from '../types';

export class InvoicesResource {
  constructor(private readonly client: VeyaClient) {}

  /**
   * Create a new invoice and return a payment URL for your customer.
   *
   * POST requests are automatically idempotent. If you provide an
   * idempotencyKey tied to your internal order ID, it is safe to
   * retry this call without creating duplicate invoices.
   *
   * @param data            - Invoice parameters
   * @param idempotencyKey  - Optional. Tie to your order ID for safe retries.
   *
   * @throws {VeyaValidationError}     - Invalid parameters
   * @throws {VeyaAuthenticationError} - Invalid API key
   * @throws {VeyaRateLimitError}      - Rate limit exceeded (auto-retried)
   * @throws {VeyaTimeoutError}        - Request timed out (auto-retried)
   *
   * @example
   * const invoice = await veya.invoices.create(
   *   {
   *     amount: 150.00,
   *     currency: 'USD',
   *     customerEmail: 'buyer@example.com',
   *     customerName: 'John Doe',
   *     description: 'Order #1234'
   *   },
   *   `order_1234` // idempotency key tied to your order
   * );
   *
   * // Redirect customer to complete payment
   * res.redirect(invoice.paymentUrl);
   */
  async create(
    data:             CreateInvoiceRequest,
    idempotencyKey?:  string
  ): Promise<Invoice> {
    // Client-side validation before hitting the network
    // Catches obvious errors immediately without a round trip
    if (data.amount === undefined || data.amount === null) {
      throw new VeyaValidationError(
        'amount is required.',
        { amount: 'amount is required.' }
      );
    }

    if (typeof data.amount !== 'number' || isNaN(data.amount)) {
      throw new VeyaValidationError(
        'amount must be a number.',
        { amount: 'amount must be a number.' }
      );
    }

    if (data.amount <= 0) {
      throw new VeyaValidationError(
        'amount must be greater than 0.',
        { amount: 'amount must be greater than 0.' }
      );
    }

    return this.client.post<Invoice>('/invoices', data, idempotencyKey);
  }

  /**
   * Retrieve a single invoice by its ID.
   *
   * @param id - Invoice ID (format: inv_xxxx)
   *
   * @throws {VeyaNotFoundError}       - Invoice does not exist
   * @throws {VeyaAuthenticationError} - Invalid API key
   *
   * @example
   * const invoice = await veya.invoices.retrieve('inv_xxxx');
   *
   * if (invoice.status === 'PAID') {
   *   // Fulfill the order
   * }
   */
  async retrieve(id: string): Promise<Invoice> {
    if (!id?.trim()) {
      throw new VeyaValidationError(
        'Invoice ID is required.',
        { id: 'Invoice ID is required.' }
      );
    }

    return this.client.get<Invoice>(`/invoices/${encodeURIComponent(id)}`);
  }

  /**
   * List invoices with optional filters and pagination.
   *
   * Results are returned in descending order by creation date
   * (newest first). Maximum of 100 results per page.
   *
   * @param params - Optional filters and pagination options
   *
   * @example
   * // Get the 20 most recent paid invoices
   * const { data, meta } = await veya.invoices.list({
   *   status: 'PAID',
   *   limit: 20,
   *   page: 1
   * });
   *
   * console.log(`${meta.total} paid invoices total`);
   * data.forEach(invoice => console.log(invoice.id, invoice.amount));
   */
  async list(params?: ListInvoicesParams): Promise<ApiResponse<Invoice[]>> {
    const query = new URLSearchParams();

    if (params?.status) {
      query.append('status', params.status);
    }

    if (params?.limit) {
      // Cap at 100 to prevent accidental large queries
      // that could slow down the merchant's integration
      query.append('limit', String(Math.min(Math.max(1, params.limit), 100)));
    }

    if (params?.page) {
      query.append('page', String(Math.max(1, params.page)));
    }

    const qs   = query.toString();
    const path = `/invoices${qs ? '?' + qs : ''}`;

    return this.client.get<ApiResponse<Invoice[]>>(path);
  }

  /**
   * Cancel a pending invoice.
   *
   * Only invoices with PENDING status can be cancelled.
   * Attempting to cancel a PAID or already CANCELLED invoice
   * will throw a VeyaConflictError.
   *
   * @param id - Invoice ID to cancel (format: inv_xxxx)
   *
   * @throws {VeyaNotFoundError}   - Invoice does not exist
   * @throws {VeyaConflictError}   - Invoice cannot be cancelled in its current state
   *
   * @example
   * await veya.invoices.cancel('inv_xxxx');
   */
  async cancel(id: string): Promise<Invoice> {
    if (!id?.trim()) {
      throw new VeyaValidationError(
        'Invoice ID is required.',
        { id: 'Invoice ID is required.' }
      );
    }

    return this.client.delete<Invoice>(
      `/invoices/${encodeURIComponent(id)}`
    );
  }
}
