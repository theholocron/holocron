import { createRestClient, ProviderApiError, type RestClient } from "@theholocron/http-client";

export type { RestClient };

export interface CloudflareClientOptions {
	token: string;
	/** Override base URL for testing. Defaults to https://api.cloudflare.com/client/v4 */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

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
