import type { TemplateInputs } from "../template-inputs.js";

export function render(inputs: TemplateInputs): string {
	const clientClass = `${inputs.vendorName}RestClient`;
	return `/**
 * Thin REST wrapper around ${inputs.baseUrl}.
 *
 * Bearer auth, JSON-only bodies, transport-failure wrapping with
 * \`status: 0\` so orchestrator soft-skip paths see a clear message
 * instead of a generic \`TypeError: fetch failed\`.
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
	/** Treat this response as void even if 200 is returned. */
	expectNoContent?: boolean;
}

export class ${clientClass} {
	private readonly token: string;
	private readonly fetchImpl: typeof fetch;
	readonly baseUrl: string;

	constructor(opts: RestClientOptions) {
		this.token = opts.token;
		this.fetchImpl = opts.fetch ?? globalThis.fetch;
		// Manual trailing-slash trim — CodeQL flags regex on library
		// input as polynomial ReDoS. O(n) loop, no backtracking risk.
		let url = opts.baseUrl ?? "${inputs.baseUrl}";
		while (url.endsWith("/")) url = url.slice(0, -1);
		this.baseUrl = url;
	}

	async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
		const url = new URL(\`\${this.baseUrl}\${path.startsWith("/") ? path : "/" + path}\`);
		for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
		const fullUrl = url.toString();

		const headers: Record<string, string> = {
			authorization: \`Bearer \${this.token}\`,
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
			const detail = err instanceof Error ? \`\${err.name}: \${err.message}\` : String(err);
			throw new ProviderApiError(\`${inputs.vendorName} \${init.method} \${path} failed: \${detail}\`, 0, undefined);
		}
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new ProviderApiError(\`${inputs.vendorName} \${init.method} \${path} → \${res.status}\`, res.status, body);
		}
		if (opts.expectNoContent || res.status === 204) return undefined as T;
		const text = await res.text();
		if (!text) return undefined as T;
		return JSON.parse(text) as T;
	}
}
`;
}
