# Veya Node.js SDK

[![npm version](https://img.shields.io/npm/v/veya-node.svg)](https://www.npmjs.com/package/veya-node)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

The official Node.js SDK for the VeyaOS API. 

Build custom payment flows, manage customers, generate crypto invoices, and listen to real-time events on your account securely.

## Features

- **TypeScript Native:** Fully typed requests, responses, and errors.
- **Idempotency Built-in:** Safe automatic retries for failed network requests.
- **Defence-in-Depth Webhooks:** Best-in-class webhook verification with replay attack and timing attack protection.
- **Exponential Backoff:** Gracefully handles rate limits and transient server errors.

---

## Installation

```bash
npm install veya-node
# or
yarn add veya-node
# or
pnpm add veya-node
```

> **Requirements:** Node.js 14.0.0 or higher.

---

## Initialization

Initialize the SDK with your secret API key from your VeyaOS Dashboard.

```typescript
import { Veya } from 'veya-node';

const veya = new Veya({
  // Use your test key for development (starts with vk_test_)
  // Use your live key for production (starts with vk_live_)
  apiKey: process.env.VEYA_API_KEY,
  
  // Optional: Required only if you are verifying webhooks
  webhookSecret: process.env.VEYA_WEBHOOK_SECRET
});
```

---

## Usage

### 1. Invoices

Invoices represent a request for payment from a customer.

#### Create an Invoice

Creating an invoice returns a `paymentUrl` where you can redirect your customer to pay via crypto. POST requests are automatically idempotent if you provide an `idempotencyKey`.

```typescript
try {
  const invoice = await veya.invoices.create(
    {
      amount: 150.00,
      currency: 'USDT', // Defaults to USD
      description: 'Order #1234 - Pro Plan',
      customerEmail: 'alice@example.com',
      customerName: 'Alice Smith'
    },
    'order_1234' // Optional idempotency key for safe retries
  );

  console.log(`Redirect customer to: ${invoice.paymentUrl}`);
} catch (error) {
  console.error('Failed to create invoice:', error);
}
```

#### Retrieve an Invoice

```typescript
const invoice = await veya.invoices.retrieve('inv_abc123');

if (invoice.status === 'PAID') {
  console.log('Payment confirmed!');
}
```

#### List Invoices

```typescript
const { data, meta } = await veya.invoices.list({
  status: 'PAID',
  limit: 20,
  page: 1
});

console.log(`Found ${meta.total} paid invoices.`);
```

### 2. Customers

Customers allow you to track users and their associated payment history over time.

#### Create a Customer

```typescript
const customer = await veya.customers.create(
  {
    name: 'Bob Jones',
    email: 'bob@example.com',
    phone: '+1234567890'
  },
  'user_bob123' // Optional idempotency key
);
```

#### Retrieve a Customer

```typescript
const customer = await veya.customers.retrieve('cus_xyz789');
console.log(`${customer.name} has spent ${customer.totalVolume}`);
```

---

## Webhooks

Webhooks allow Veya to notify your application in real-time when an asynchronous event occurs, such as a customer successfully paying an invoice.

### Verifying Webhooks Securely

Veya signs all webhook events to prevent replay attacks and tampering. The SDK provides a rigorous `verify` method to handle the cryptography for you.

> ⚠️ **CRITICAL:** You must pass the **RAW** request body as a string or Buffer. Do not parse it with `JSON.parse()` first, as this alters the spacing and will invalidate the cryptographic signature.

#### Express.js Example

```typescript
import express from 'express';
import { Veya, VeyaWebhookSignatureError } from 'veya-node';

const app = express();
const veya = new Veya({
  apiKey: process.env.VEYA_API_KEY,
  webhookSecret: process.env.VEYA_WEBHOOK_SECRET
});

// Use express.raw() to capture the exact raw body string
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-veya-signature'];
  const rawBody = req.body.toString('utf8');

  try {
    // This will securely verify the signature, check the timestamp for replay attacks,
    // and parse the JSON for you.
    const event = veya.webhooks.verify(rawBody, signature);

    if (event.type === 'invoice.paid') {
      console.log(`Invoice ${event.invoice.id} was paid! Fulfilling order...`);
    }

    res.status(200).send('OK');
  } catch (error) {
    if (error instanceof VeyaWebhookSignatureError) {
      console.error('Invalid Webhook Signature', error.message);
      res.status(400).send('Invalid signature');
    } else {
      res.status(500).send('Server Error');
    }
  }
});
```

#### Next.js App Router Example

```typescript
import { Veya } from 'veya-node';

const veya = new Veya({
  apiKey: process.env.VEYA_API_KEY,
  webhookSecret: process.env.VEYA_WEBHOOK_SECRET
});

export async function POST(req: Request) {
  const payload = await req.text(); // Get raw string
  const signature = req.headers.get('x-veya-signature');

  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  try {
    const event = veya.webhooks.verify(payload, signature);
    // Process event...
    return new Response('OK', { status: 200 });
  } catch (err) {
    return new Response('Invalid Signature', { status: 400 });
  }
}
```

---

## Error Handling

The SDK throws structured, typed errors so you can handle issues programmatically.

```typescript
import { VeyaRateLimitError, VeyaValidationError, VeyaAuthenticationError } from 'veya-node';

try {
  await veya.invoices.create({ /* ... */ });
} catch (error) {
  if (error instanceof VeyaValidationError) {
    console.error('Validation failed:', error.fields);
  } else if (error instanceof VeyaRateLimitError) {
    console.error(`Rate limited. Retry after ${error.retryAfter} seconds.`);
  } else if (error instanceof VeyaAuthenticationError) {
    console.error('Check your API Key!');
  } else {
    console.error('API Error:', error.message);
  }
}
```

### Auto-Retries

The SDK will automatically retry failed requests due to transient network issues (like `ECONNRESET` or timeouts) or HTTP `429 Rate Limit` / `5xx Server Error` responses. 

It uses **exponential backoff with jitter** to retry safely up to 3 times (customizable via `maxRetries` during initialization). If the request is a `POST`, it will safely retry using the provided `idempotencyKey` to prevent double-charging.

---

## TypeScript Support

The SDK ships with comprehensive TypeScript definitions. You can import types directly:

```typescript
import { Invoice, Customer, CreateInvoiceRequest, WebhookEvent } from 'veya-node';
```

## Security

- **API Key Masking:** If you accidentally log the `veya` client object, your API key will be redacted (`vk_live_ab...[REDACTED]`).
- **Constant-Time Verification:** Webhooks are verified using `crypto.timingSafeEqual` to prevent timing attacks.
- **Replay Protection:** Webhooks older than 5 minutes are strictly rejected.

---

## Support

If you encounter any issues or need help integrating the SDK, please reach out to support@veyaos.xyz or open an issue on our GitHub repository.
