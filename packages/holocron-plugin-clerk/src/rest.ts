/**
 * Thin REST wrapper around api.clerk.com/v1.
 *
 * Same pattern as the github/vercel/neon REST clients — bearer auth,
 * JSON-only bodies, transport-failure wrapping with `status: 0` so the
 * orchestrator's soft-skip path sees a clear "Clerk GET /path failed"
 * message instead of a generic `TypeError: fetch failed`.
 */

import { ProviderApiError } from "@theholocron/cli";

export interface RestClientOptions {
	token: string;
	fetch?: typeof fetch;
	baseUrl?: string;
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	body?: unknown;
	query?: Record<string, string>;
}

export class ClerkRestClient {
	private readonly token: string;
	private readonly fetchImpl: typeof fetch;
	readonly baseUrl: string;

	constructor(opts: RestClientOptions) {
		this.token = opts.token;
		this.fetchImpl = opts.fetch ?? globalThis.fetch;
		// Manual trailing-slash trim instead of `.replace(/\/+$/, '')` —
		// CodeQL flags the regex as polynomial ReDoS when applied to
		// library input. The loop is O(n) without backtracking risk.
		let url = opts.baseUrl ?? "https://api.clerk.com/v1";
		while (url.endsWith("/")) url = url.slice(0, -1);
		this.baseUrl = url;
	}

	async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
		const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`);
		for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
		const fullUrl = url.toString();

		const headers: Record<string, string> = {
			authorization: `Bearer ${this.token}`,
			accept: "application/json",
		};
		const init: RequestInit = {
			method: opts.method ?? "GET",
			headers,
		};
		if (opts.body !== undefined) {
			headers["content-type"] = "application/json";
			init.body = JSON.stringify(opts.body);
		}

		let res: Response;
		try {
			res = await this.fetchImpl(fullUrl, init);
		} catch (err) {
			const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
			throw new ProviderApiError(`Clerk ${init.method} ${path} failed: ${detail}`, 0, undefined);
		}
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ProviderApiError(`Clerk ${init.method} ${path} → ${res.status}`, res.status, body);
		}
		if (res.status === 204) return undefined as T;
		const text = await res.text();
		if (!text) return undefined as T;
		return JSON.parse(text) as T;
	}
}
