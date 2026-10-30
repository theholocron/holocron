import { createRestClient, ProviderApiError, type RestClient } from "@theholocron/http-client";
import type { ErrorSink, Logger } from "@theholocron/observability/core";

export type { RestClient };

export interface CloudflareClientOptions {
	token: string;
	/** Override base URL for testing. Defaults to https://api.cloudflare.com/client/v4 */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
	/** Structured logger for request/response diagnostics. Defaults to a no-op. */
	logger?: Logger;
	/** Reports transport failures and unexpected 5xx. Defaults to a no-op. */
	errors?: ErrorSink;
	/** How many times a read is sent again after a transient failure (see `retryDelayMs`). Defaults to 2; 0 turns it off. */
	retries?: number;
	/** Milliseconds before the first retry; each later one waits three times as long. Defaults to 300. */
	retryDelayMs?: number;
}

/**
 * Cloudflare answers these when the API itself is briefly unavailable. A read that gets one is asked for again; a
 * write is never repeated (it may have been applied). A 429 is left out because its `Retry-After` is not honoured here.
 */
const TRANSIENT_STATUSES = [500, 502, 503, 504];

export interface CfEnvelope<T> {
	success: boolean;
	errors: unknown[];
	result: T;
}

export function createCloudflareRestClient(opts: CloudflareClientOptions): RestClient {
	return createRestClient({
		baseUrl: opts.baseUrl ?? "https://api.cloudflare.com/client/v4",
		token: opts.token,
		vendor: "Cloudflare",
		fetch: opts.fetch,
		logger: opts.logger,
		errors: opts.errors,
		retryStatuses: TRANSIENT_STATUSES,
		retries: opts.retries,
		retryDelayMs: opts.retryDelayMs,
	});
}

/**
 * Unwrap Cloudflare's `{ result, success, errors }` envelope.
 * `createRestClient` already throws on HTTP 4xx/5xx; this handles the rare
 * 200 + `success: false` case Cloudflare emits for some validation failures.
 */
export async function cfRequest<T>(
	rest: RestClient,
	method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
	path: string,
	body?: unknown,
	query?: Record<string, string>
): Promise<T> {
	const envelope = await rest.request<CfEnvelope<T> | undefined>(path, {
		method,
		...(body !== undefined ? { body } : {}),
		...(query !== undefined ? { query } : {}),
	});
	if (!envelope) return undefined as T;
	if (!envelope.success) {
		throw new ProviderApiError(
			`Cloudflare ${method} ${path} returned success:false`,
			0,
			JSON.stringify(envelope.errors)
		);
	}
	return envelope.result;
}
