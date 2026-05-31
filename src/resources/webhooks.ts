import { createHmac, timingSafeEqual } from 'crypto';
import { WebhookEvent }                from '../types';
import { VeyaWebhookSignatureError }   from '../errors';

// Reject webhooks older than this to prevent replay attacks.
// 5 minutes gives enough buffer for network delays and clock skew
// while keeping the replay window tight.
const MAX_WEBHOOK_AGE_SECONDS  = 300;

// Minimum secret length enforced at initialization.
// Secrets shorter than 32 chars are too easy to brute force.
const MIN_SECRET_LENGTH = 32;

export class WebhooksResource {
  private readonly secret: string;

  constructor(secret: string) {
    // This validation also runs in the Veya constructor,
    // but we repeat it here as a defence-in-depth measure
    // in case WebhooksResource is ever instantiated directly.
    if (!secret || secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `Webhook secret must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Use the secret from the Veya dashboard, not a custom string.`
      );
    }

    this.secret = secret;
  }

  /**
   * Verify a webhook payload sent by Veya and return the parsed event.
   *
   * This method performs four security checks in sequence:
   *   1. Signature header format validation
   *   2. Replay attack prevention (rejects webhooks older than 5 minutes)
   *   3. Future timestamp rejection (catches clock manipulation)
   *   4. Constant-time HMAC signature comparison (prevents timing attacks)
   *
   * CRITICAL: You must pass the RAW request body as a string.
   * Do not parse the body with JSON.parse() before passing it here.
   * Parsing changes whitespace and key ordering, which breaks the
   * signature and will cause all verifications to fail.
   *
   * @param payload   - Raw request body as a UTF-8 string
   * @param signature - Value of the X-Veya-Signature header
   *
   * @returns Parsed and verified WebhookEvent
   *
   * @throws {VeyaWebhookSignatureError} - Signature invalid, expired, or malformed
   *
   * @example Express.js
   * app.post(
   *   '/webhook/veya',
   *   express.raw({ type: 'application/json' }),
   *   (req, res) => {
   *     try {
   *       const event = veya.webhooks.verify(
   *         req.body.toString('utf-8'),
   *         req.headers['x-veya-signature']
   *       );
   *       if (event.type === 'invoice.paid') {
   *         // Fulfill order
   *       }
   *       res.sendStatus(200);
   *     } catch (err) {
   *       res.sendStatus(400);
   *     }
   *   }
   * );
   */
  verify(payload: string, signature: string): WebhookEvent {
    // ── Step 1: Parse and validate signature header format ──────────────
    //
    // Expected format: "t=1234567890,v1=abc123def456..."
    // The timestamp (t) and signature (v1) are separated by a comma.
    // We parse into a map for safe access without index assumptions.

    if (!signature || typeof signature !== 'string') {
      throw new VeyaWebhookSignatureError(
        'X-Veya-Signature header is missing or empty. ' +
        'Ensure your webhook endpoint receives the raw request headers.'
      );
    }

    const parts = Object.fromEntries(
      signature.split(',').map(part => {
        const separatorIndex = part.indexOf('=');
        if (separatorIndex === -1) return [part, ''];
        return [
          part.slice(0, separatorIndex),
          part.slice(separatorIndex + 1)
        ];
      })
    );

    const timestamp   = parts['t'];
    const receivedSig = parts['v1'];

    if (!timestamp || !receivedSig) {
      throw new VeyaWebhookSignatureError(
        'Malformed X-Veya-Signature header. ' +
        `Expected format: "t=<timestamp>,v1=<signature>". ` +
        `Received: "${signature.slice(0, 50)}..."`
      );
    }

    // ── Step 2: Replay attack prevention ────────────────────────────────
    //
    // An attacker who captures a valid webhook payload and signature
    // could replay it later to falsely trigger order fulfillment.
    // We reject any webhook older than MAX_WEBHOOK_AGE_SECONDS.

    const parsedTimestamp = parseInt(timestamp, 10);

    if (isNaN(parsedTimestamp)) {
      throw new VeyaWebhookSignatureError(
        'Webhook timestamp is not a valid number.'
      );
    }

    const nowSeconds  = Math.floor(Date.now() / 1000);
    const webhookAge  = nowSeconds - parsedTimestamp;

    if (webhookAge > MAX_WEBHOOK_AGE_SECONDS) {
      throw new VeyaWebhookSignatureError(
        `Webhook rejected: timestamp is ${webhookAge} seconds old ` +
        `(maximum allowed: ${MAX_WEBHOOK_AGE_SECONDS} seconds). ` +
        `This webhook may be a replay attack.`
      );
    }

    // ── Step 3: Future timestamp rejection ──────────────────────────────
    //
    // A webhook with a timestamp far in the future could be crafted
    // to remain valid indefinitely, bypassing the replay prevention window.
    // We reject timestamps more than 60 seconds in the future to allow
    // for minor clock skew between servers.

    if (parsedTimestamp > nowSeconds + 60) {
      throw new VeyaWebhookSignatureError(
        'Webhook rejected: timestamp is in the future. ' +
        'Check that your server clock is synchronized (NTP).'
      );
    }

    // ── Step 4: HMAC signature verification ─────────────────────────────
    //
    // We sign the timestamp concatenated with the payload body.
    // This binds the timestamp to the specific payload, preventing
    // an attacker from swapping a legitimate timestamp onto a
    // forged payload.
    //
    // Signed payload format: "<timestamp>.<raw_body>"
    // This must match exactly how the Veya backend generates signatures.

    const signedPayload = `${timestamp}.${payload}`;
    const expectedSig   = createHmac('sha256', this.secret)
      .update(signedPayload, 'utf-8')
      .digest('hex');

    // Convert both signatures to Buffers for constant-time comparison.
    // timingSafeEqual requires both buffers to be the same length.
    // If they are different lengths, the signatures cannot match,
    // but we must not short-circuit — doing so leaks timing information
    // that could help an attacker brute-force the signature.

    const expectedBuf = Buffer.from(expectedSig,   'hex');
    const receivedBuf = Buffer.from(receivedSig,   'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      // Lengths differ = signatures cannot match.
      // We still avoid branching on content to prevent timing leaks.
      throw new VeyaWebhookSignatureError();
    }

    if (!timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new VeyaWebhookSignatureError();
    }

    // ── Step 5: Parse and return the verified event ──────────────────────
    //
    // Only parse the JSON after the signature is confirmed valid.
    // This prevents processing malformed or malicious JSON payloads
    // that failed signature verification.

    try {
      return JSON.parse(payload) as WebhookEvent;
    } catch {
      throw new VeyaWebhookSignatureError(
        'Webhook signature is valid but the payload is not valid JSON. ' +
        'Contact Veya support.'
      );
    }
  }

  /**
   * Verify a webhook from a raw Buffer instead of a string.
   *
   * Convenience method for frameworks that provide the body as a Buffer.
   * Functionally identical to verify() — converts the buffer to UTF-8 first.
   *
   * @param body      - Raw request body as a Buffer
   * @param signature - Value of the X-Veya-Signature header
   *
   * @example Next.js App Router
   * export async function POST(req: Request) {
   *   const payload   = await req.text();
   *   const signature = req.headers.get('x-veya-signature') ?? '';
   *   const event     = veya.webhooks.verify(payload, signature);
   * }
   *
   * @example Next.js Pages Router
   * export const config = { api: { bodyParser: false } };
   * export default async function handler(req, res) {
   *   const buf   = await buffer(req);
   *   const event = veya.webhooks.verifyBuffer(buf, req.headers['x-veya-signature']);
   * }
   */
  verifyBuffer(body: Buffer, signature: string): WebhookEvent {
    return this.verify(body.toString('utf-8'), signature);
  }
}
