import { ProviderApiError } from "./errors.js";

export interface RestClientConfig {
	/** Default base URL (e.g. "https://api.github.com"). */
	baseUrl: string;
	/** Auth token. */
	token: string;
	/**
	 * How the token is sent.
	 * - `"bearer"` (default): `Authorization: Bearer <token>`
	 * - `"apikey"`: uses `apiKeyHeader` (e.g. `x-api-key`)
	 */
	tokenScheme?: "bearer" | "apikey";
	/** Header name when `tokenScheme` is `"apikey"`. Defaults to `"x-api-key"`. */
	apiKeyHeader?: string;
	/**
	 * Static headers merged into every request. Applied after the auth header
	 * so they can override defaults (e.g. GitHub's `accept` override).
	 */
	extraHeaders?: Record<string, string>;
	/** Query params appended to every request URL (e.g. Vercel's `teamId`). */
	defaultQuery?: Record<string, string>;
	/** Vendor label used in error messages (e.g. `"GitHub"`). */
	vendor?: string;
	/** Override `fetch` for tests. Defaults to `globalThis.fetch`. */
	fetch?: typeof fetch;
}

export interface RequestOptions {
	method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
	body?: unknown;
	/** Per-request query params, merged after `defaultQuery`. */
	query?: Record<string, string>;
	/** Return `undefined` without parsing even on a 200 response. */
	expectNoContent?: boolean;
}

export interface RestClient {
	readonly baseUrl: string;
	request<T>(path: string, opts?: RequestOptions): Promise<T>;
}

export function createRestClient(config: RestClientConfig): RestClient {
	const fetchImpl = config.fetch ?? globalThis.fetch;
	const vendor = config.vendor ?? "";

	// Manual trailing-slash trim — CodeQL flags regex on library input as
	// polynomial ReDoS. O(n) loop, no backtracking risk.
	let baseUrl = config.baseUrl;
	while (baseUrl.endsWith("/")) baseUrl = baseUrl.slice(0, -1);

	const staticHeaders: Record<string, string> = {
		accept: "application/json",
	};

	if (config.tokenScheme === "apikey") {
		staticHeaders[config.apiKeyHeader ?? "x-api-key"] = config.token;
	} else {
		staticHeaders["authorization"] = `Bearer ${config.token}`;
	}

	// extraHeaders applied last so callers can override defaults (e.g. accept).
	Object.assign(staticHeaders, config.extraHeaders);

	return {
		baseUrl,

		async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
			const url = new URL(
				`${baseUrl}${path.startsWith("/") ? path : "/" + path}`,
			);
			for (const [k, v] of Object.entries(config.defaultQuery ?? {}))
				url.searchParams.set(k, v);
			for (const [k, v] of Object.entries(opts.query ?? {}))
				url.searchParams.set(k, v);

			const headers = { ...staticHeaders };
			const init: RequestInit = { method: opts.method ?? "GET", headers };
			if (opts.body !== undefined) {
				headers["content-type"] = "application/json";
				init.body = JSON.stringify(opts.body);
			}

			const tag = vendor
				? `${vendor} ${init.method} ${path}`
				: `${init.method} ${path}`;

			let res: Response;
			try {
				res = await fetchImpl(url.toString(), init);
			} catch (err) {
				const detail =
					err instanceof Error
						? `${err.name}: ${err.message}`
						: String(err);
				throw new ProviderApiError(
					`${tag} failed: ${detail}`,
					0,
					undefined,
				);
			}

			if (!res.ok) {
				const body = await res.text().catch(() => "");
				throw new ProviderApiError(
					`${tag} → ${res.status}`,
					res.status,
					body,
				);
			}

			if (opts.expectNoContent || res.status === 204)
				return undefined as T;
			const text = await res.text();
			if (!text) return undefined as T;
			return JSON.parse(text) as T;
		},
	};
}
