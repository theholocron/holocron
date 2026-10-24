import { createRestClient, ProviderApiError, type RestClient } from "@theholocron/http-client";

import { DEFAULT_BASE_URL } from "../utils.js";
import type {
	CreateChannelInput,
	CreateGuildInput,
	CreateInviteInput,
	CreateMessageInput,
	CreateRoleInput,
	DiscordApplication,
	DiscordBotClientOptions,
	DiscordChannel,
	DiscordChannelMessage,
	DiscordChannelWebhook,
	DiscordEmoji,
	DiscordGuild,
	DiscordGuildMember,
	DiscordInvite,
	DiscordMessage,
	DiscordOnboarding,
	DiscordRole,
	DiscordUser,
	DiscordWelcomeScreen,
	ListMembersInput,
	ModifyApplicationInput,
	ModifyChannelInput,
	ModifyGuildInput,
	ModifyRoleInput,
	ModifyWebhookInput,
	ModifyWelcomeScreenInput,
} from "./bot.type.js";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 3;
/** A rate-limit wait longer than this fails fast instead of stalling the caller. */
const MAX_RETRY_WAIT_MS = 10_000;
/** A guard on `membersWithRole`, so a runaway cursor cannot loop forever. */
const MAX_MEMBER_PAGES = 50;

/** Discord ids are snowflakes; anything else would be spliced into a URL path. */
function id(value: string): string {
	if (!/^\d{1,20}$/.test(value)) throw new Error(`invalid Discord id: ${JSON.stringify(value)}`);
	return value;
}

/** Validates ids that travel in a request body, so a malformed one fails here and not at Discord. */
function bodyIds(...values: Array<string | null | undefined | readonly string[]>): void {
	for (const value of values) {
		if (value === undefined || value === null) continue;
		for (const one of typeof value === "string" ? [value] : value) id(one);
	}
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
			/** `GET /users/:id` — a user's name, for reports that would otherwise show a bare id. */
			get: (userId: string) => rest.request<DiscordUser>(`/users/${id(userId)}`),
		},
		guilds: {
			get: (guildId: string) => rest.request<DiscordGuild>(`/guilds/${id(guildId)}`),
			/** `POST /guilds` — a new server the bot owns. Not idempotent: look one up by name before retrying. */
			create: (body: CreateGuildInput) => rest.request<DiscordGuild>("/guilds", { method: "POST", body }),
			/** `DELETE /guilds/:id` — only the owner may; a 404 counts as done. */
			delete: async (guildId: string): Promise<void> => {
				try {
					await rest.request<void>(`/guilds/${id(guildId)}`, { method: "DELETE", expectNoContent: true });
				} catch (err) {
					if (err instanceof ProviderApiError && err.status === 404) return;
					throw err;
				}
			},
			/** `PATCH /guilds/:id` — verification, notification defaults, content filter, system channels. */
			modify: (guildId: string, body: ModifyGuildInput) => {
				bodyIds(body.owner_id, body.system_channel_id, body.rules_channel_id, body.public_updates_channel_id);
				return rest.request<DiscordGuild>(`/guilds/${id(guildId)}`, {
					method: "PATCH",
					body,
				});
			},
			welcomeScreen: (guildId: string) =>
				rest.request<DiscordWelcomeScreen>(`/guilds/${id(guildId)}/welcome-screen`),
			/** Needs the community features on. */
			modifyWelcomeScreen: (guildId: string, body: ModifyWelcomeScreenInput) => {
				for (const c of body.welcome_channels ?? []) bodyIds(c.channel_id, c.emoji_id);
				return rest.request<DiscordWelcomeScreen>(`/guilds/${id(guildId)}/welcome-screen`, {
					method: "PATCH",
					body,
				});
			},
			onboarding: (guildId: string) => rest.request<DiscordOnboarding>(`/guilds/${id(guildId)}/onboarding`),
			/**
			 * `PUT` replaces the whole onboarding config, so send every prompt you want to keep. Discord has no
			 * conditional write: two callers that read, edit and PUT at once, the later one wins.
			 */
			modifyOnboarding: (guildId: string, body: Omit<DiscordOnboarding, "guild_id">) => {
				bodyIds(body.default_channel_ids);
				for (const prompt of body.prompts) {
					for (const option of prompt.options) bodyIds(option.channel_ids, option.role_ids, option.emoji_id);
				}
				return rest.request<DiscordOnboarding>(`/guilds/${id(guildId)}/onboarding`, { method: "PUT", body });
			},
			channels: (guildId: string) => rest.request<DiscordChannel[]>(`/guilds/${id(guildId)}/channels`),
			createChannel: (guildId: string, body: CreateChannelInput) =>
				rest.request<DiscordChannel>(`/guilds/${id(guildId)}/channels`, { method: "POST", body }),
			roles: (guildId: string) => rest.request<DiscordRole[]>(`/guilds/${id(guildId)}/roles`),
			createRole: (guildId: string, body: CreateRoleInput) =>
				rest.request<DiscordRole>(`/guilds/${id(guildId)}/roles`, {
					method: "POST",
					body,
				}),
			modifyRole: (guildId: string, roleId: string, body: ModifyRoleInput) =>
				rest.request<DiscordRole>(`/guilds/${id(guildId)}/roles/${id(roleId)}`, { method: "PATCH", body }),
			/** `GET /guilds/:id/members/:id` — one member and the roles they hold. A 404 means either they are not in the server or the guild id is unknown; read the error body to tell them apart. */
			member: (guildId: string, userId: string) =>
				rest.request<DiscordGuildMember>(`/guilds/${id(guildId)}/members/${id(userId)}`),
			/**
			 * `GET /guilds/:id/members` — one page. Needs the privileged Server Members Intent, switched on in the
			 * developer portal; without it Discord answers 403.
			 */
			members: (guildId: string, opts: ListMembersInput = {}) => {
				const query: Record<string, string> = { limit: String(opts.limit ?? 1000) };
				if (opts.after !== undefined) query.after = id(opts.after);
				return rest.request<DiscordGuildMember[]>(`/guilds/${id(guildId)}/members`, { query });
			},
			/** Every member holding the role, read page by page; needs the same intent as `members`. */
			membersWithRole: async (guildId: string, roleId: string): Promise<DiscordGuildMember[]> => {
				const wanted = id(roleId);
				const found: DiscordGuildMember[] = [];
				let after: string | undefined;
				for (let page = 0; page < MAX_MEMBER_PAGES; page++) {
					const batch = await rest.request<DiscordGuildMember[]>(`/guilds/${id(guildId)}/members`, {
						query: { limit: "1000", ...(after === undefined ? {} : { after }) },
					});
					for (const m of batch) if (m.roles.includes(wanted)) found.push(m);
					const last = batch[batch.length - 1]?.user?.id;
					if (batch.length < 1000 || last === undefined) return found;
					after = last;
				}
				throw new Error(`more than ${MAX_MEMBER_PAGES * 1000} members; refusing to read them all`);
			},
			/** `GET /guilds/:id/emojis` — custom emoji, for welcome screen and onboarding ids. */
			emojis: (guildId: string) => rest.request<DiscordEmoji[]>(`/guilds/${id(guildId)}/emojis`),
			/** `PUT /guilds/:id/members/:id/roles/:id` — gives the member the role; giving one they have is a no-op. */
			addMemberRole: (guildId: string, userId: string, roleId: string): Promise<void> =>
				rest.request<void>(`/guilds/${id(guildId)}/members/${id(userId)}/roles/${id(roleId)}`, {
					method: "PUT",
					expectNoContent: true,
				}),
			/** `DELETE /guilds/:id/members/:id/roles/:id` — takes the role away; taking one they lack is a no-op. */
			removeMemberRole: (guildId: string, userId: string, roleId: string): Promise<void> =>
				rest.request<void>(`/guilds/${id(guildId)}/members/${id(userId)}/roles/${id(roleId)}`, {
					method: "DELETE",
					expectNoContent: true,
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
			/** `POST /channels/:id/messages` as the bot. Mentions are off unless `allowed_mentions` asks for them. */
			createMessage: (channelId: string, body: CreateMessageInput) => {
				bodyIds(body.allowed_mentions?.roles, body.allowed_mentions?.users);
				return rest.request<DiscordMessage>(`/channels/${id(channelId)}/messages`, {
					method: "POST",
					// After the spread, so an explicit `allowed_mentions: undefined` still means "no mentions".
					body: { ...body, allowed_mentions: body.allowed_mentions ?? { parse: [] } },
				});
			},
			/** `POST /channels/:id/invites` — a join link for the server, e.g. to hand over a newly created one. */
			createInvite: (channelId: string, body: CreateInviteInput = {}) =>
				rest.request<DiscordInvite>(`/channels/${id(channelId)}/invites`, { method: "POST", body }),
			/** `GET /channels/:id/messages` — the newest messages first, to read a post back. */
			messages: (channelId: string, limit = 50) =>
				rest.request<DiscordChannelMessage[]>(`/channels/${id(channelId)}/messages`, {
					query: { limit: String(limit) },
				}),
			/** `PUT /channels/:id/pins/:id` — pins a message; one already pinned is a no-op. */
			pin: (channelId: string, messageId: string): Promise<void> =>
				rest.request<void>(`/channels/${id(channelId)}/pins/${id(messageId)}`, {
					method: "PUT",
					expectNoContent: true,
				}),
			deleteMessage: (channelId: string, messageId: string): Promise<void> =>
				rest.request<void>(`/channels/${id(channelId)}/messages/${id(messageId)}`, {
					method: "DELETE",
					expectNoContent: true,
				}),
			createWebhook: async (channelId: string, body: { name: string }) =>
				withUrl(
					await rest.request<DiscordChannelWebhook>(`/channels/${id(channelId)}/webhooks`, {
						method: "POST",
						body,
					})
				),
		},
		application: {
			/** `GET /applications/@me` — the bot's own application: description, tags, install settings, URLs. */
			get: () => rest.request<DiscordApplication>("/applications/@me"),
			/** `PATCH /applications/@me` — only what is in the body changes. */
			modify: (body: ModifyApplicationInput) =>
				rest.request<DiscordApplication>("/applications/@me", { method: "PATCH", body }),
		},
		webhooks: {
			/** `PATCH /webhooks/:id` — name and avatar of a webhook this bot manages. */
			modify: async (webhookId: string, body: ModifyWebhookInput) =>
				withUrl(
					await rest.request<DiscordChannelWebhook>(`/webhooks/${id(webhookId)}`, { method: "PATCH", body })
				),
			/** `DELETE /webhooks/:id` — e.g. to roll back an orphan whose URL was never stored. */
			/** A 404 counts as done: the webhook is already gone, as when a retry follows a lost response. */
			delete: async (webhookId: string): Promise<void> => {
				try {
					await rest.request<void>(`/webhooks/${id(webhookId)}`, {
						method: "DELETE",
						expectNoContent: true,
					});
				} catch (err) {
					if (err instanceof ProviderApiError && err.status === 404) return;
					throw err;
				}
			},
		},
	};
}

export type DiscordBotClient = ReturnType<typeof createDiscordBotClient>;
