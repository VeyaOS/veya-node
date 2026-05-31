import { VeyaClient }           from '../client';
import { VeyaValidationError }  from '../errors';
import {
  Customer,
  CreateCustomerRequest,
  ListCustomersParams,
  ApiResponse,
} from '../types';

// Minimal email format check
// We do not do complex regex here — the server does full validation.
// This just catches obvious mistakes before a network round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CustomersResource {
  constructor(private readonly client: VeyaClient) {}

  /**
   * Create a new customer record.
   *
   * If a customer with the same email already exists in your account,
   * a VeyaConflictError will be thrown. Retrieve the existing customer
   * instead of creating a duplicate.
   *
   * @param data            - Customer details
   * @param idempotencyKey  - Optional. Tie to your internal user ID for safe retries.
   *
   * @throws {VeyaValidationError}  - Invalid or missing parameters
   * @throws {VeyaConflictError}    - Customer with this email already exists
   *
   * @example
   * const customer = await veya.customers.create(
   *   {
   *     name: 'Jane Doe',
   *     email: 'jane@example.com',
   *     phone: '+1234567890'
   *   },
   *   `user_${userId}` // idempotency key tied to your user ID
   * );
   */
  async create(
    data:             CreateCustomerRequest,
    idempotencyKey?:  string
  ): Promise<Customer> {
    const errors: Record<string, string> = {};

    if (!data.name?.trim()) {
      errors['name'] = 'Customer name is required.';
    }

    if (!data.email?.trim()) {
      errors['email'] = 'Customer email is required.';
    } else if (!EMAIL_PATTERN.test(data.email.trim())) {
      errors['email'] = 'Customer email is not a valid email address.';
    }

    if (Object.keys(errors).length > 0) {
      throw new VeyaValidationError(
        'Customer validation failed. Check the fields property for details.',
        errors
      );
    }

    return this.client.post<Customer>('/customers', data, idempotencyKey);
  }

  /**
   * Retrieve a single customer by their ID.
   *
   * @param id - Customer ID (format: cus_xxxx)
   *
   * @throws {VeyaNotFoundError} - Customer does not exist
   *
   * @example
   * const customer = await veya.customers.retrieve('cus_xxxx');
   * console.log(`${customer.name} has made ${customer.invoiceCount} purchases`);
   */
  async retrieve(id: string): Promise<Customer> {
    if (!id?.trim()) {
      throw new VeyaValidationError(
        'Customer ID is required.',
        { id: 'Customer ID is required.' }
      );
    }

    return this.client.get<Customer>(
      `/customers/${encodeURIComponent(id)}`
    );
  }

  /**
   * List all customers with optional pagination.
   *
   * Results are returned in descending order by creation date
   * (newest first). Maximum of 100 results per page.
   *
   * @param params - Optional pagination options
   *
   * @example
   * const { data, meta } = await veya.customers.list({ limit: 50 });
   * console.log(`${meta.total} customers total`);
   */
  async list(params?: ListCustomersParams): Promise<ApiResponse<Customer[]>> {
    const query = new URLSearchParams();

    if (params?.limit) {
      query.append('limit', String(Math.min(Math.max(1, params.limit), 100)));
    }

    if (params?.page) {
      query.append('page', String(Math.max(1, params.page)));
    }

    const qs   = query.toString();
    const path = `/customers${qs ? '?' + qs : ''}`;

    return this.client.get<ApiResponse<Customer[]>>(path);
  }
}
