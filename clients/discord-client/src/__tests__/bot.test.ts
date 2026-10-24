import { afterEach, describe, expect, it, vi } from "vitest";

import { ChannelType, createDiscordBotClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://discord.test/api/v10";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return {
		client: createDiscordBotClient({
			botToken: "tok",
			baseUrl: BASE,
			fetch,
		}),
		calls,
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("createDiscordBotClient", () => {
	it("falls back to the global fetch when none is injected", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "u1", username: "holonet" } }]);
		vi.stubGlobal("fetch", fetch);
		await createDiscordBotClient({ botToken: "tok" }).users.me();
		expect(calls[0]?.url).toBe("https://discord.com/api/v10/users/@me");
	});

	it("authenticates with the Bot scheme, not Bearer", async () => {
		const { client, calls } = makeClient([{ body: { id: "u1", username: "holonet", bot: true } }]);
		await client.users.me();
		expect(calls[0]?.headers.authorization).toBe("Bot tok");
	});

	it("targets the default Discord base URL when no override is given", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "u1", username: "holonet" } }]);
		await createDiscordBotClient({ botToken: "tok", fetch }).users.me();
		expect(calls[0]?.url).toBe("https://discord.com/api/v10/users/@me");
	});
});

describe("guilds", () => {
	it("get: GET /guilds/:id", async () => {
		const { client, calls } = makeClient([{ body: { id: "111", name: "Holocron" } }]);
		expect(await client.guilds.get("111")).toEqual({
			id: "111",
			name: "Holocron",
		});
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111`,
			method: "GET",
		});
	});

	it("channels: GET /guilds/:id/channels", async () => {
		const { client, calls } = makeClient([{ body: [{ id: "222", name: "alerts", type: 0 }] }]);
		expect(await client.guilds.channels("111")).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/channels`,
			method: "GET",
		});
	});

	it("createChannel: POST /guilds/:id/channels with the body", async () => {
		const { client, calls } = makeClient([{ body: { id: "c2", name: "sync", type: 0 } }]);
		await client.guilds.createChannel("111", {
			name: "sync",
			type: ChannelType.Text,
			parent_id: "333",
		});
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/channels`,
			method: "POST",
			body: { name: "sync", type: 0, parent_id: "333" },
		});
	});

	it("roles: GET /guilds/:id/roles", async () => {
		const { client, calls } = makeClient([
			{
				body: [
					{
						id: "r1",
						name: "gatekeepers",
						color: 0,
						mentionable: true,
					},
				],
			},
		]);
		expect(await client.guilds.roles("111")).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/roles`,
			method: "GET",
		});
	});

	it("createRole: POST /guilds/:id/roles with the body", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "r2",
					name: "gatekeepers",
					color: 0,
					mentionable: true,
				},
			},
		]);
		await client.guilds.createRole("111", {
			name: "gatekeepers",
			mentionable: true,
		});
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/roles`,
			method: "POST",
			body: { name: "gatekeepers", mentionable: true },
		});
	});
});

describe("channels", () => {
	it("modify: PATCH /channels/:id", async () => {
		const { client, calls } = makeClient([{ body: { id: "222", name: "alerts", type: 0 } }]);
		await client.channels.modify("222", { parent_id: "333" });
		expect(calls[0]).toMatchObject({
			url: `${BASE}/channels/222`,
			method: "PATCH",
			body: { parent_id: "333" },
		});
	});

	it("webhooks: GET /channels/:id/webhooks", async () => {
		const { client, calls } = makeClient([{ body: [{ id: "w1", name: "repo-sync", channel_id: "222" }] }]);
		expect(await client.channels.webhooks("222")).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			url: `${BASE}/channels/222/webhooks`,
			method: "GET",
		});
	});

	it("createWebhook: POST /channels/:id/webhooks and returns the token + url", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "w2",
					name: "repo-sync",
					channel_id: "222",
					token: "t",
					url: "https://discord.com/api/webhooks/w2/t",
				},
			},
		]);
		const hook = await client.channels.createWebhook("222", {
			name: "repo-sync",
		});
		expect(hook.url).toBe("https://discord.com/api/webhooks/w2/t");
		expect(hook.token).toBe("t");
		expect(calls[0]).toMatchObject({
			url: `${BASE}/channels/222/webhooks`,
			method: "POST",
			body: { name: "repo-sync" },
		});
	});

	it("surfaces a non-2xx response as a ProviderApiError carrying the status", async () => {
		const { client } = makeClient([{ status: 403, text: '{"message":"Missing Permissions"}' }]);
		await expect(client.guilds.channels("111")).rejects.toMatchObject({
			status: 403,
		});
	});
});

describe("webhook url", () => {
	it("derives the url from id + token when Discord omits it", async () => {
		const { client } = makeClient([{ body: { id: "w3", name: "x", channel_id: "222", token: "tk" } }]);
		const hook = await client.channels.createWebhook("222", { name: "x" });
		expect(hook.url).toBe("https://discord.com/api/webhooks/w3/tk");
	});

	it("leaves url undefined on a listed webhook this bot did not create (no token)", async () => {
		const { client } = makeClient([{ body: [{ id: "w4", name: "other", channel_id: "222" }] }]);
		const [hook] = await client.channels.webhooks("222");
		expect(hook?.url).toBeUndefined();
	});

	it("lists webhooks with a derived url when a token is present", async () => {
		const { client } = makeClient([{ body: [{ id: "w5", name: "x", channel_id: "222", token: "tk" }] }]);
		const [hook] = await client.channels.webhooks("222");
		expect(hook?.url).toBe("https://discord.com/api/webhooks/w5/tk");
	});
});

describe("id validation", () => {
	it.each(["../guilds/1/roles", "12/../34", "abc", "", "1?x=1"])(
		"rejects %j before any request is made",
		async (bad) => {
			const { client, calls } = makeClient([]);
			expect(() => client.channels.modify(bad, { name: "x" })).toThrow(/invalid Discord id/);
			expect(() => client.guilds.get(bad)).toThrow(/invalid Discord id/);
			expect(calls).toHaveLength(0);
		}
	);
});

describe("rate limits and deadlines", () => {
	const noSleep = () => Promise.resolve();

	it("retries a 429 using Retry-After, then succeeds", async () => {
		const waits: number[] = [];
		let n = 0;
		const f = (async () => {
			n++;
			return n === 1
				? new Response("{}", {
						status: 429,
						headers: { "retry-after": "2" },
					})
				: new Response(JSON.stringify({ id: "111", name: "g" }), {
						status: 200,
					});
		}) as unknown as typeof fetch;
		const client = createDiscordBotClient({
			botToken: "tok",
			baseUrl: BASE,
			fetch: f,
			sleep: async (ms) => void waits.push(ms),
		});
		await expect(client.guilds.get("111")).resolves.toMatchObject({
			id: "111",
		});
		expect(waits).toEqual([2000]);
	});

	it("falls back to retry_after in the JSON body", async () => {
		const waits: number[] = [];
		let n = 0;
		const f = (async () => {
			n++;
			return n === 1
				? new Response(JSON.stringify({ retry_after: 0.5 }), {
						status: 429,
					})
				: new Response("{}", { status: 200 });
		}) as unknown as typeof fetch;
		const client = createDiscordBotClient({
			botToken: "t",
			baseUrl: BASE,
			fetch: f,
			sleep: async (ms) => void waits.push(ms),
		});
		await client.guilds.get("111");
		expect(waits).toEqual([500]);
	});

	it("waits one second when a 429 says nothing about how long", async () => {
		const waits: number[] = [];
		let n = 0;
		const f = (async () =>
			++n === 1
				? new Response("not json", { status: 429 })
				: new Response("{}", {
						status: 200,
					})) as unknown as typeof fetch;
		const client = createDiscordBotClient({
			botToken: "t",
			baseUrl: BASE,
			fetch: f,
			sleep: async (ms) => void waits.push(ms),
		});
		await client.guilds.get("111");
		expect(waits).toEqual([1000]);
	});

	it("gives up after maxRetries and surfaces the 429", async () => {
		let n = 0;
		const f = (async () => {
			n++;
			return new Response("{}", {
				status: 429,
				headers: { "retry-after": "1" },
			});
		}) as unknown as typeof fetch;
		const client = createDiscordBotClient({
			botToken: "t",
			baseUrl: BASE,
			fetch: f,
			sleep: noSleep,
			maxRetries: 2,
		});
		await expect(client.guilds.get("111")).rejects.toMatchObject({
			status: 429,
		});
		expect(n).toBe(3);
	});

	it("fails fast, without waiting, when Discord asks for a long wait", async () => {
		const waits: number[] = [];
		const f = (async () =>
			new Response("{}", {
				status: 429,
				headers: { "retry-after": "60" },
			})) as unknown as typeof fetch;
		const client = createDiscordBotClient({
			botToken: "t",
			baseUrl: BASE,
			fetch: f,
			sleep: async (ms) => void waits.push(ms),
		});
		await expect(client.guilds.get("111")).rejects.toMatchObject({
			status: 429,
		});
		expect(waits).toEqual([]);
	});

	it("sends an abort signal so a stalled request cannot hang the caller", async () => {
		let signal: AbortSignal | undefined;
		const f = (async (_url: unknown, init?: RequestInit) => {
			signal = init?.signal ?? undefined;
			return new Response("{}", { status: 200 });
		}) as unknown as typeof fetch;
		await createDiscordBotClient({
			botToken: "t",
			baseUrl: BASE,
			fetch: f,
			timeoutMs: 5000,
		}).guilds.get("111");
		expect(signal).toBeInstanceOf(AbortSignal);
	});

	it("uses the global setTimeout to wait when no sleep is injected", async () => {
		let n = 0;
		const f = (async () =>
			++n === 1
				? new Response("{}", {
						status: 429,
						headers: { "retry-after": "0.001" },
					})
				: new Response("{}", {
						status: 200,
					})) as unknown as typeof fetch;
		const client = createDiscordBotClient({
			botToken: "t",
			baseUrl: BASE,
			fetch: f,
		});
		await expect(client.guilds.get("111")).resolves.toBeDefined();
		expect(n).toBe(2);
	});
});

describe("server settings", () => {
	it("guilds.modify: PATCH /guilds/:id with the settings", async () => {
		const { client, calls } = makeClient([{ body: { id: "111", name: "Holocron", verification_level: 2 } }]);
		const guild = await client.guilds.modify("111", {
			verification_level: 2,
			default_message_notifications: 1,
		});
		expect(guild.verification_level).toBe(2);
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111`,
			method: "PATCH",
			body: { verification_level: 2, default_message_notifications: 1 },
		});
	});

	it("guilds.modifyRole: PATCH /guilds/:id/roles/:role", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "r1",
					name: "gatekeepers",
					color: 1,
					mentionable: true,
				},
			},
		]);
		await client.guilds.modifyRole("111", "r1".replace("r", "9"), {
			color: 1,
			hoist: true,
			permissions: "8",
		});
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/roles/91`,
			method: "PATCH",
			body: { color: 1, hoist: true, permissions: "8" },
		});
	});

	it("member roles: read a member, add a role, remove a role", async () => {
		const { client, calls } = makeClient([
			{ body: { user: { id: "333" }, roles: ["91"] } },
			{ status: 204 },
			{ status: 204 },
		]);
		expect((await client.guilds.member("111", "333")).roles).toEqual(["91"]);
		await client.guilds.addMemberRole("111", "333", "92");
		await client.guilds.removeMemberRole("111", "333", "91");
		expect(calls[0]).toMatchObject({ url: `${BASE}/guilds/111/members/333`, method: "GET" });
		expect(calls[1]).toMatchObject({ url: `${BASE}/guilds/111/members/333/roles/92`, method: "PUT" });
		expect(calls[2]).toMatchObject({ url: `${BASE}/guilds/111/members/333/roles/91`, method: "DELETE" });
	});

	it("member roles: an id that is not a snowflake is refused before any request", async () => {
		const { client, calls } = makeClient([]);
		expect(() => client.guilds.addMemberRole("111", "../x", "92")).toThrow(/invalid Discord id/);
		// `$` in a JavaScript regex matches only at the very end, so a trailing line feed is refused too.
		expect(() => client.guilds.addMemberRole("111", "333\n", "92")).toThrow(/invalid Discord id/);
		expect(calls).toHaveLength(0);
	});

	it("members: one page, with a cursor, and a bad cursor is refused", async () => {
		const { client, calls } = makeClient([{ body: [] }, { body: [] }]);
		await client.guilds.members("111");
		await client.guilds.members("111", { limit: 5, after: "42" });
		expect(calls[0]?.url).toBe(`${BASE}/guilds/111/members?limit=1000`);
		expect(calls[1]?.url).toBe(`${BASE}/guilds/111/members?limit=5&after=42`);
		expect(() => client.guilds.members("111", { after: "../x" })).toThrow(/invalid Discord id/);
	});

	it("membersWithRole: keeps those holding the role and follows the cursor", async () => {
		const page = (from: number, role: string) =>
			Array.from({ length: 1000 }, (_, i) => ({ user: { id: String(from + i) }, roles: i === 0 ? [role] : [] }));
		const { client, calls } = makeClient([
			{ body: page(1, "91") },
			{
				body: [
					{ user: { id: "5000" }, roles: ["91", "92"] },
					{ user: { id: "5001" }, roles: [] },
				],
			},
		]);
		const found = await client.guilds.membersWithRole("111", "91");
		expect(found.map((m) => m.user?.id)).toEqual(["1", "5000"]);
		expect(calls[1]?.url).toBe(`${BASE}/guilds/111/members?limit=1000&after=1000`);
	});

	it("membersWithRole: a page of members without users ends the read", async () => {
		const { client } = makeClient([{ body: Array.from({ length: 1000 }, () => ({ roles: ["91"] })) }]);
		expect(await client.guilds.membersWithRole("111", "91")).toHaveLength(1000);
	});

	it("membersWithRole: refuses to read without end", async () => {
		const full = Array.from({ length: 1000 }, (_, i) => ({ user: { id: String(i + 1) }, roles: [] }));
		const { client } = makeClient(Array.from({ length: 51 }, () => ({ body: full })));
		await expect(client.guilds.membersWithRole("111", "91")).rejects.toThrow(/refusing to read/);
	});

	it("membersWithRole: exactly the limit of members is read whole", async () => {
		const full = Array.from({ length: 1000 }, (_, i) => ({ user: { id: String(i + 1) }, roles: ["91"] }));
		const { client } = makeClient([...Array.from({ length: 50 }, () => ({ body: full })), { body: [] }]);
		expect(await client.guilds.membersWithRole("111", "91")).toHaveLength(50_000);
	});

	it("guilds: create, delete (404 counts as done), transfer, emojis", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "777", name: "New" } },
			{ status: 204 },
			{ status: 404, body: {} },
			{ body: { id: "777", name: "New" } },
			{ body: [{ id: "5", name: "wave" }] },
		]);
		expect((await client.guilds.create({ name: "New" })).id).toBe("777");
		await client.guilds.delete("777");
		await client.guilds.delete("777");
		await client.guilds.modify("777", { owner_id: "333" });
		expect((await client.guilds.emojis("777"))[0]?.name).toBe("wave");
		expect(calls[0]).toMatchObject({ url: `${BASE}/guilds`, method: "POST", body: { name: "New" } });
		expect(calls[1]).toMatchObject({ url: `${BASE}/guilds/777`, method: "DELETE" });
		expect(calls[3]).toMatchObject({ method: "PATCH", body: { owner_id: "333" } });
		expect(calls[4]?.url).toBe(`${BASE}/guilds/777/emojis`);
	});

	it("guilds.delete: another failure comes through", async () => {
		const { client } = makeClient([{ status: 403, body: {} }]);
		await expect(client.guilds.delete("777")).rejects.toMatchObject({ status: 403 });
	});

	it("users.get, invites, listing, pinning and deleting messages", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "333", username: "luke" } },
			{ body: { code: "abc" } },
			{ body: [{ id: "8", channel_id: "5", content: "hi", webhook_id: "7" }] },
			{ status: 204 },
			{ status: 204 },
		]);
		expect((await client.users.get("333")).username).toBe("luke");
		expect((await client.channels.createInvite("5", { max_age: 0, max_uses: 1 })).code).toBe("abc");
		expect((await client.channels.messages("5", 10))[0]?.webhook_id).toBe("7");
		await client.channels.pin("5", "8");
		await client.channels.deleteMessage("5", "8");
		expect(calls[0]?.url).toBe(`${BASE}/users/333`);
		expect(calls[1]).toMatchObject({
			url: `${BASE}/channels/5/invites`,
			method: "POST",
			body: { max_age: 0, max_uses: 1 },
		});
		expect(calls[2]?.url).toBe(`${BASE}/channels/5/messages?limit=10`);
		expect(calls[3]).toMatchObject({ url: `${BASE}/channels/5/pins/8`, method: "PUT" });
		expect(calls[4]).toMatchObject({ url: `${BASE}/channels/5/messages/8`, method: "DELETE" });
	});

	it("channels.createInvite and messages default their options", async () => {
		const { client, calls } = makeClient([{ body: { code: "a" } }, { body: [] }]);
		await client.channels.createInvite("5");
		await client.channels.messages("5");
		expect(calls[0]?.body).toEqual({});
		expect(calls[1]?.url).toBe(`${BASE}/channels/5/messages?limit=50`);
	});

	it("application: GET and PATCH /applications/@me", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "9", name: "Holonet", description: "old", tags: [] } },
			{ body: { id: "9", name: "Holonet", description: "new", tags: ["a"] } },
		]);
		expect((await client.application.get()).description).toBe("old");
		const out = await client.application.modify({
			description: "new",
			tags: ["a"],
			install_params: { scopes: ["bot"], permissions: "8" },
		});
		expect(out.tags).toEqual(["a"]);
		expect(calls[0]).toMatchObject({ url: `${BASE}/applications/@me`, method: "GET" });
		expect(calls[1]).toMatchObject({
			url: `${BASE}/applications/@me`,
			method: "PATCH",
			body: { description: "new", tags: ["a"], install_params: { scopes: ["bot"], permissions: "8" } },
		});
	});

	it("welcome screen: GET and PATCH /guilds/:id/welcome-screen", async () => {
		const { client, calls } = makeClient([
			{ body: { description: "hi", welcome_channels: [] } },
			{
				body: {
					description: "hello",
					welcome_channels: [{ channel_id: "222", description: "start" }],
				},
			},
		]);
		expect((await client.guilds.welcomeScreen("111")).description).toBe("hi");
		await client.guilds.modifyWelcomeScreen("111", {
			enabled: true,
			description: "hello",
			welcome_channels: [{ channel_id: "222", description: "start" }],
		});
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/welcome-screen`,
			method: "GET",
		});
		expect(calls[1]).toMatchObject({
			url: `${BASE}/guilds/111/welcome-screen`,
			method: "PATCH",
			body: { enabled: true, description: "hello" },
		});
	});

	it("modifyWelcomeScreen: a body with no channels is sent as is", async () => {
		const { client, calls } = makeClient([{ body: { description: "hi", welcome_channels: [] } }]);
		await client.guilds.modifyWelcomeScreen("111", { enabled: false });
		expect(calls[0]?.body).toEqual({ enabled: false });
	});

	it("onboarding: GET and PUT /guilds/:id/onboarding", async () => {
		const onboarding = {
			prompts: [],
			default_channel_ids: ["222"],
			enabled: true,
		};
		const { client, calls } = makeClient([{ body: onboarding }, { body: onboarding }]);
		expect((await client.guilds.onboarding("111")).enabled).toBe(true);
		await client.guilds.modifyOnboarding("111", onboarding);
		expect(calls[0]).toMatchObject({
			url: `${BASE}/guilds/111/onboarding`,
			method: "GET",
		});
		expect(calls[1]).toMatchObject({
			url: `${BASE}/guilds/111/onboarding`,
			method: "PUT",
			body: onboarding,
		});
	});

	it("channels.createMessage: POST with mentions off unless asked for", async () => {
		const { client, calls } = makeClient([
			{ body: { id: "m1", channel_id: "222", content: "hi" } },
			{ body: { id: "m2", channel_id: "222", content: "@x" } },
		]);
		await client.channels.createMessage("222", { content: "hi" });
		await client.channels.createMessage("222", {
			content: "@x",
			allowed_mentions: { roles: ["9"] },
		});
		expect(calls[0]).toMatchObject({
			url: `${BASE}/channels/222/messages`,
			method: "POST",
			body: { content: "hi", allowed_mentions: { parse: [] } },
		});
		expect(calls[1]?.body).toMatchObject({
			allowed_mentions: { roles: ["9"] },
		});
	});

	it("webhooks.modify: PATCH /webhooks/:id and derives the url when a token comes back", async () => {
		const { client, calls } = makeClient([
			{
				body: {
					id: "777",
					name: "alerts",
					channel_id: "222",
					token: "t0k",
				},
			},
		]);
		const hook = await client.webhooks.modify("777", {
			name: "alerts",
			avatar: "data:image/png;base64,AAAA",
		});
		expect(hook.url).toBe("https://discord.com/api/webhooks/777/t0k");
		expect(calls[0]).toMatchObject({
			url: `${BASE}/webhooks/777`,
			method: "PATCH",
			body: { name: "alerts", avatar: "data:image/png;base64,AAAA" },
		});
	});

	it("webhooks.delete: DELETE /webhooks/:id and resolves on 204", async () => {
		const { client, calls } = makeClient([{ status: 204 }]);
		await expect(client.webhooks.delete("777")).resolves.toBeUndefined();
		expect(calls[0]).toMatchObject({
			url: `${BASE}/webhooks/777`,
			method: "DELETE",
		});
	});

	it("createMessage: an explicit undefined allowed_mentions still means no mentions", async () => {
		const { client, calls } = makeClient([{ body: { id: "m1", channel_id: "222", content: "hi" } }]);
		await client.channels.createMessage("222", {
			content: "hi",
			allowed_mentions: undefined,
			nonce: "n1",
			enforce_nonce: true,
		});
		expect(calls[0]?.body).toEqual({
			content: "hi",
			allowed_mentions: { parse: [] },
			nonce: "n1",
			enforce_nonce: true,
		});
	});

	it("webhooks.delete: a 404 means it is already gone, any other error still throws", async () => {
		const gone = makeClient([{ status: 404, body: { message: "Unknown Webhook" } }]);
		await expect(gone.client.webhooks.delete("777")).resolves.toBeUndefined();
		const denied = makeClient([{ status: 403, body: { message: "Missing Permissions" } }]);
		await expect(denied.client.webhooks.delete("777")).rejects.toThrow(/403/);
	});

	it("rejects a malformed id inside a request body before any request is made", () => {
		const { client, calls } = makeClient([]);
		expect(() => client.guilds.modify("111", { system_channel_id: "x" })).toThrow(/invalid Discord id/);
		expect(() => client.guilds.modify("111", { rules_channel_id: "x" })).toThrow(/invalid Discord id/);
		expect(() =>
			client.guilds.modifyWelcomeScreen("111", { welcome_channels: [{ channel_id: "x", description: "d" }] })
		).toThrow(/invalid Discord id/);
		expect(() =>
			client.guilds.modifyOnboarding("111", {
				enabled: true,
				default_channel_ids: ["222", "no"],
				prompts: [],
			})
		).toThrow(/invalid Discord id/);
		expect(() =>
			client.guilds.modifyOnboarding("111", {
				enabled: true,
				default_channel_ids: [],
				prompts: [
					{
						type: 0,
						title: "t",
						single_select: false,
						required: false,
						in_onboarding: true,
						options: [{ title: "o", role_ids: ["bad"] }],
					},
				],
			})
		).toThrow(/invalid Discord id/);
		expect(() =>
			client.channels.createMessage("222", { content: "x", allowed_mentions: { roles: ["bad"] } })
		).toThrow(/invalid Discord id/);
		expect(calls).toHaveLength(0);
	});

	it("rejects an id that is not a snowflake before any request is made", async () => {
		const { client, calls } = makeClient([]);
		await expect(client.webhooks.delete("../x")).rejects.toThrow(/invalid Discord id/);
		expect(() => client.guilds.modifyRole("111", "a/b", {})).toThrow(/invalid Discord id/);
		expect(calls).toHaveLength(0);
	});
});
