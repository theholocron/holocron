/**
 * Translates a Clerk webhook delivery into the normalized `AuthEvent`
 * shape defined in `@theholocron/cli`. The first concrete example of
 * the cross-provider sync pattern (see `AuthEvent` JSDoc in core).
 *
 * Status: signature SHIPPED, body STUBBED. Real Svix signature
 * verification (HMAC-SHA256 over `svix-id.svix-timestamp.body` with
 * the `whsec_…` signing secret, base64-decoded) lands in a follow-up
 * (tracked at #80). For now, parseWebhook trusts the request and
 * focuses on shape translation — usable in environments where
 * signature verification happens upstream (e.g., Vercel middleware,
 * an API gateway), and an explicit error in production-grade
 * deployments until the verification body lands.
 *
 * Reference event shapes:
 *   https://clerk.com/docs/integrations/webhooks/overview
 *   https://clerk.com/docs/reference/backend-api/tag/Webhooks
 */

import {
  WebhookVerificationError,
  type AuthEvent,
  type AuthEventType,
  type ParseWebhookInput,
} from '@theholocron/cli'

interface ClerkWebhookPayload {
  type: string
  data: {
    id: string
    email_addresses?: Array<{ email_address: string; id?: string }>
    primary_email_address_id?: string
    first_name?: string | null
    last_name?: string | null
    [key: string]: unknown
  }
  /** Unix ms — Clerk's `created_at` on the envelope. */
  created_at?: number
}

const CLERK_TO_NORMALIZED: Record<string, AuthEventType> = {
  'user.created': 'user.created',
  'user.updated': 'user.updated',
  'user.deleted': 'user.deleted',
}

export async function parseWebhook(input: ParseWebhookInput): Promise<AuthEvent> {
  // Real signature verification arrives with #80. Until then we treat
  // the absence of signing-secret-validated headers as a soft-skip;
  // production deployments should not rely on this code path.
  await verifySignature(input)

  const bodyStr = typeof input.body === 'string' ? input.body : input.body.toString('utf8')
  let payload: ClerkWebhookPayload
  try {
    payload = JSON.parse(bodyStr) as ClerkWebhookPayload
  } catch (err) {
    throw new WebhookVerificationError(
      `Clerk webhook body is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const normalizedType = CLERK_TO_NORMALIZED[payload.type]
  if (!normalizedType) {
    throw new WebhookVerificationError(
      `Clerk webhook event type "${payload.type}" has no normalized mapping yet`,
    )
  }

  const primaryEmail =
    payload.data.email_addresses?.find((e) => e.id === payload.data.primary_email_address_id)
      ?.email_address ?? payload.data.email_addresses?.[0]?.email_address

  const occurredAt = payload.created_at
    ? new Date(payload.created_at).toISOString()
    : new Date(0).toISOString()

  return {
    type: normalizedType,
    user: {
      id: payload.data.id,
      email: primaryEmail ?? '',
      ...(payload.data.first_name !== undefined ? { firstName: payload.data.first_name } : {}),
      ...(payload.data.last_name !== undefined ? { lastName: payload.data.last_name } : {}),
      raw: payload.data,
    },
    occurredAt,
  }
}

/**
 * Stub for Svix signature verification. The real implementation
 * lands at #80 and will:
 *
 *   1. Read svix-id, svix-timestamp, svix-signature headers
 *   2. Verify svix-timestamp is within the replay window (±5 min)
 *   3. Compute HMAC-SHA256(<signing_secret>, `${id}.${timestamp}.${body}`)
 *   4. Compare (constant-time) against the base64 sig in svix-signature
 *
 * For now: throw WebhookVerificationError when the signing secret is
 * missing, so consumers see the contract; let the call through
 * otherwise (signature-validation TODO).
 */
async function verifySignature(input: ParseWebhookInput): Promise<void> {
  if (!input.signingSecret) {
    throw new WebhookVerificationError(
      'Clerk webhook signingSecret is required (use the Svix whsec_… value from the Clerk dashboard)',
    )
  }
  // TODO(#80): real HMAC verification. Until then, accept and move on.
  return Promise.resolve()
}
