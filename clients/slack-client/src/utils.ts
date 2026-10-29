import { ProviderApiError } from "@theholocron/http-client";

export interface SlackClientOptions {
	/** Slack bot/user OAuth token. */
	token: string;
	/** Override base URL for testing. Defaults to https://slack.com/api. */
	baseUrl?: string;
	/** Override fetch for testing. Defaults to globalThis.fetch. */
	fetch?: typeof fetch;
}

export interface SlackRestClient {
	call<T extends { ok: boolean; error?: string }>(method: string, body: Record<string, unknown>): Promise<T>;
}

/**
 * Slack always returns HTTP 200 with an `ok` field signalling success —
 * `@theholocron/http-client`'s `createRestClient` treats non-2xx as the
 * only failure signal, which doesn't apply here, so this is a minimal
 * fetch wrapper instead, with the same transport-failure wrapping
 * (`ProviderApiError`, status `0`) `createRestClient` gives every other
 * client for free.
 */
export function createSlackRestClient(opts: SlackClientOptions): SlackRestClient {
	const base = opts.baseUrl ?? "https://slack.com/api";
	const f = opts.fetch ?? globalThis.fetch;

	return {
		async call<T extends { ok: boolean; error?: string }>(
			method: string,
			body: Record<string, unknown>
		): Promise<T> {
			let res: Response;
			try {
				res = await f(`${base}/${method}`, {
					method: "POST",
					headers: {
						"content-type": "application/json; charset=utf-8",
						authorization: `Bearer ${opts.token}`,
					},
					body: JSON.stringify(body),
				});
			} catch (err) {
				const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
				throw new ProviderApiError(`Slack ${method} failed: ${detail}`, 0, undefined);
			}
			const data = (await res.json()) as T;
			if (!data.ok) throw new ProviderApiError(data.error ?? "unknown Slack error", res.status, data);
			return data;
		},
	};
}
