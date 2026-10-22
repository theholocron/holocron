import { describe, expect, it } from "vitest";

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

describe("createDiscordBotClient", () => {
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
