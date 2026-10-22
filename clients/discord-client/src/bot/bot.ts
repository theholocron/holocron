import { createRestClient, type RestClient } from "@theholocron/http-client";

import { DEFAULT_BASE_URL } from "../utils.js";
import type {
	CreateChannelInput,
	CreateRoleInput,
	DiscordBotClientOptions,
	DiscordChannel,
	DiscordChannelWebhook,
	DiscordGuild,
	DiscordRole,
	DiscordUser,
	ModifyChannelInput,
} from "./bot.type.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
/** A rate-limit wait longer than this fails fast instead of stalling the caller. */
const MAX_RETRY_WAIT_MS = 10_000;

/** Discord ids are snowflakes; anything else would be spliced into a URL path. */
function id(value: string): string {
	if (!/^\d{1,20}$/.test(value)) throw new Error(`invalid Discord id: ${JSON.stringify(value)}`);
	return value;
}

/** How long Discord asks us to wait after a 429, in ms (header first, then the JSON body). */
async function retryDelayMs(res: Response): Promise<number> {
	const header = Number(res.headers.get("retry-after"));
	if (Number.isFinite(header) && header > 0) return Math.ceil(header * 1000);
	const body = (await res
		.clone()
		.json()
		.catch(() => ({}))) as { retry_after?: number };
	return typeof body.retry_after === "number" && body.retry_after > 0 ? Math.ceil(body.retry_after * 1000) : 1000;
}

/**
 * Adds the two guards `createRestClient` doesn't have: a per-request deadline,
 * and a bounded retry on 429. Retrying a 429 is safe even for POSTs — Discord
 * rejected the request without acting on it.
 */
function guardedFetch(
	f: typeof fetch,
	{
		timeoutMs,
		maxRetries,
		sleep,
	}: {
		timeoutMs: number;
		maxRetries: number;
		sleep: (ms: number) => Promise<void>;
	}
): typeof fetch {
	return async (input, init) => {
		for (let attempt = 0; ; attempt++) {
			const res = await f(input, {
				...init,
				signal: AbortSignal.timeout(timeoutMs),
			});
			if (res.status !== 429 || attempt >= maxRetries) return res;
			const wait = await retryDelayMs(res);
			if (wait > MAX_RETRY_WAIT_MS) return res;
			await sleep(wait);
		}
	};
}

/** Discord includes `url` on webhooks this application created; derive it from id + token if it is ever absent. */
function withUrl(hook: DiscordChannelWebhook): DiscordChannelWebhook {
	if (hook.url || !hook.token) return hook;
	return {
		...hook,
		url: `https://discord.com/api/webhooks/${hook.id}/${hook.token}`,
	};
}

/**
 * Bot-authenticated Discord REST resources (`Authorization: Bot <token>`),
 * for provisioning a server: channels, roles, and per-channel webhooks.
 * Webhook posting stays on {@link createDiscordClient}, which needs no token.
 *
 * `http-client` only knows `Bearer`/`Basic`/api-key, so the `Bot` scheme is
 * sent as an api-key header carrying the whole `Bot <token>` value.
 *
 * `baseUrl` is a test seam: the bot token is sent to whatever host it names, so
 * never derive it from untrusted input.
 */
export function createDiscordBotClient(opts: DiscordBotClientOptions) {
	const rest: RestClient = createRestClient({
		baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
		token: `Bot ${opts.botToken}`,
		tokenScheme: "apikey",
		apiKeyHeader: "authorization",
		vendor: "Discord",
		fetch: guardedFetch(opts.fetch ?? globalThis.fetch, {
			timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
			maxRetries: opts.maxRetries ?? DEFAULT_MAX_RETRIES,
			sleep: opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
		}),
	});

	return {
		users: {
			/** `GET /users/@me` — the bot's own user; a cheap token check. */
			me: () => rest.request<DiscordUser>("/users/@me"),
		},
		guilds: {
			get: (guildId: string) => rest.request<DiscordGuild>(`/guilds/${id(guildId)}`),
			channels: (guildId: string) => rest.request<DiscordChannel[]>(`/guilds/${id(guildId)}/channels`),
			createChannel: (guildId: string, body: CreateChannelInput) =>
				rest.request<DiscordChannel>(`/guilds/${id(guildId)}/channels`, { method: "POST", body }),
			roles: (guildId: string) => rest.request<DiscordRole[]>(`/guilds/${id(guildId)}/roles`),
			createRole: (guildId: string, body: CreateRoleInput) =>
				rest.request<DiscordRole>(`/guilds/${id(guildId)}/roles`, {
					method: "POST",
					body,
				}),
		},
		channels: {
			modify: (channelId: string, body: ModifyChannelInput) =>
				rest.request<DiscordChannel>(`/channels/${id(channelId)}`, {
					method: "PATCH",
					body,
				}),
			webhooks: async (channelId: string) =>
				(await rest.request<DiscordChannelWebhook[]>(`/channels/${id(channelId)}/webhooks`)).map(withUrl),
			createWebhook: async (channelId: string, body: { name: string }) =>
				withUrl(
					await rest.request<DiscordChannelWebhook>(`/channels/${id(channelId)}/webhooks`, {
						method: "POST",
						body,
					})
				),
		},
	};
}

export type DiscordBotClient = ReturnType<typeof createDiscordBotClient>;
