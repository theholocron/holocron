/**
 * Thin REST wrapper around api.github.com.
 *
 * Adapted from rando-id/rando.id `packages/cli/src/adapters/gh-rest.ts`
 * `request<T>` method into a standalone class so each capability can
 * hold a reference and share the same auth/error handling.
 *
 * Errors throw `ProviderApiError` from `@theholocron/cli`, which the
 * orchestrator catches to soft-skip rather than abort the whole pipeline.
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
	/** Skip JSON parse when true (204 No Content endpoints). */
	expectNoContent?: boolean;
}

export class GitHubRestClient {
	private readonly token: string;
	private readonly fetchImpl: typeof fetch;
	readonly baseUrl: string;

	constructor(opts: RestClientOptions) {
		this.token = opts.token;
		this.fetchImpl = opts.fetch ?? globalThis.fetch;
		// Manual trailing-slash trim instead of `.replace(/\/+$/, '')` —
		// CodeQL flags the regex as polynomial ReDoS when applied to
		// library input. The loop is O(n) without backtracking risk.
		let url = opts.baseUrl ?? "https://api.github.com";
		while (url.endsWith("/")) url = url.slice(0, -1);
		this.baseUrl = url;
	}

	async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
		const url = `${this.baseUrl}${path}`;
		const headers: Record<string, string> = {
			accept: "application/vnd.github+json",
			authorization: `Bearer ${this.token}`,
			"x-github-api-version": "2022-11-28",
		};
		const init: RequestInit = {
			method: opts.method ?? "GET",
			headers,
		};
		if (opts.body !== undefined) {
			headers["content-type"] = "application/json";
			init.body = JSON.stringify(opts.body);
		}
		const res = await this.fetchImpl(url, init);
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ProviderApiError(`GitHub ${init.method} ${path} → ${res.status}`, res.status, body);
		}
		if (opts.expectNoContent || res.status === 204) {
			return undefined as T;
		}
		const text = await res.text();
		if (!text) return undefined as T;
		return JSON.parse(text) as T;
	}
}
