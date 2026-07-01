/**
 * Thin REST wrapper around api.vercel.com.
 *
 * Differences from the GitHub REST client:
 *  - Vercel uses simple `Bearer <token>` (no api-version header)
 *  - Team scoping is a query-string param (`teamId=...`), not a path
 *    prefix; the client appends it to every URL when configured
 *  - 204 responses are honored the same way; transport failures get
 *    wrapped in `ProviderApiError` with `status: 0` for clear hint
 *    output
 */

import { ProviderApiError } from "@theholocron/cli";

export interface RestClientOptions {
	token: string;
	/** Vercel team id. When set, scoped to that team for every request. */
	teamId?: string;
	fetch?: typeof fetch;
	baseUrl?: string;
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	body?: unknown;
	/** Additional query-string params. */
	query?: Record<string, string>;
}

export class VercelRestClient {
	private readonly token: string;
	private readonly teamId?: string;
	private readonly fetchImpl: typeof fetch;
	readonly baseUrl: string;

	constructor(opts: RestClientOptions) {
		this.token = opts.token;
		if (opts.teamId !== undefined) this.teamId = opts.teamId;
		this.fetchImpl = opts.fetch ?? globalThis.fetch;
		// Manual trailing-slash trim instead of `.replace(/\/+$/, '')` —
		// CodeQL flags the regex as polynomial ReDoS when applied to
		// library input. The loop is O(n) without backtracking risk.
		let url = opts.baseUrl ?? "https://api.vercel.com";
		while (url.endsWith("/")) url = url.slice(0, -1);
		this.baseUrl = url;
	}

	async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
		const url = new URL(`${this.baseUrl}${path.startsWith("/") ? path : "/" + path}`);
		if (this.teamId) url.searchParams.set("teamId", this.teamId);
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
			// Transport-level failure (DNS / TCP / TLS). Wrap so the caller
			// sees which API call broke instead of `TypeError: fetch failed`.
			const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
			throw new ProviderApiError(`Vercel ${init.method} ${path} failed: ${detail}`, 0, undefined);
		}
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ProviderApiError(`Vercel ${init.method} ${path} → ${res.status}`, res.status, body);
		}
		if (res.status === 204) return undefined as T;
		const text = await res.text();
		if (!text) return undefined as T;
		return JSON.parse(text) as T;
	}
}
