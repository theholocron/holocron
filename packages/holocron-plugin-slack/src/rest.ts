import { ProviderApiError } from "@theholocron/cli";

export interface SlackClientOptions {
	token: string;
	/** Override base URL for tests. Default: https://slack.com/api */
	baseUrl?: string;
	fetch?: typeof fetch;
}

export interface SlackClient {
	auth: {
		test(): Promise<{ ok: true; team: string; user: string }>;
	};
	chat: {
		postMessage(channel: string, text: string): Promise<void>;
	};
}

// Slack always returns HTTP 200 with an `ok` field — createRestClient's
// non-2xx error handling doesn't apply, so we use a minimal fetch wrapper.
export function createSlackClient({ token, baseUrl, fetch: fetchImpl }: SlackClientOptions): SlackClient {
	const base = baseUrl ?? "https://slack.com/api";
	const f = fetchImpl ?? globalThis.fetch;

	async function call<T extends { ok: boolean; error?: string }>(method: string, body: Record<string, unknown>): Promise<T> {
		const res = await f(`${base}/${method}`, {
			method: "POST",
			headers: {
				"content-type": "application/json; charset=utf-8",
				authorization: `Bearer ${token}`,
			},
			body: JSON.stringify(body),
		});
		const data = (await res.json()) as T;
		if (!data.ok) throw new ProviderApiError(data.error ?? "unknown Slack error", res.status, data);
		return data;
	}

	return {
		auth: {
			test: () => call<{ ok: true; team: string; user: string }>("auth.test", {}),
		},
		chat: {
			postMessage: async (channel, text) => {
				await call<{ ok: true }>("chat.postMessage", { channel, text });
			},
		},
	};
}
