import { describe, expect, it } from "vitest";

import { createContext, createDiscordClient, createPlugin, DiscordNotifications, notifications } from "./index.js";

const WEBHOOK = "https://discord.com/api/webhooks/111/abc123";

describe("createPlugin", () => {
	it("returns a plugin with a notifications capability factory", () => {
		const plugin = createPlugin({ cliToken: WEBHOOK });
		expect(plugin.name).toBe("@theholocron/holocron-plugin-discord");
		expect(typeof plugin.capabilities.notifications).toBe("function");
	});

	it("capability has correct key and providerName", () => {
		const plugin = createPlugin({ cliToken: WEBHOOK });
		const cap = plugin.capabilities.notifications();
		expect(cap.key).toBe("notifications");
		expect(cap.providerName).toBe("discord");
	});

	function recordingFetch() {
		const seen: Array<{ url: string; authorization: string | undefined; method: string }> = [];
		const f = (async (url: string, init?: RequestInit) => {
			seen.push({
				url,
				authorization: (init?.headers as Record<string, string> | undefined)?.authorization,
				method: init?.method ?? "GET",
			});
			const body = (init?.method ?? "GET") === "GET" ? [] : { id: "9", name: "ALERTS", type: 4 };
			return new Response(JSON.stringify(body), { status: 200 });
		}) as unknown as typeof fetch;
		return { seen, f };
	}

	it("provisions through the capability it returns, authenticating with the bot token (not the webhook)", async () => {
		const { seen, f } = recordingFetch();
		const ctx = createContext({
			cliToken: WEBHOOK,
			guildId: "1",
			env: { HOLOCRON_DISCORD_BOT_TOKEN: "bot-tok" },
			baseUrl: "https://discord.test/api/v10",
			unsafeBotBaseUrl: true,
			fetch: f,
		});
		// Building the capability must not demand a bot token.
		const cap = notifications(ctx);
		expect(seen).toHaveLength(0);
		await expect(cap.ensureCategory!("ALERTS")).resolves.toEqual({ id: "9", created: true });
		expect(seen.map((r) => r.method)).toEqual(["GET", "POST"]);
		expect(seen.every((r) => r.authorization === "Bot bot-tok")).toBe(true);
		expect(seen[0]?.url).toBe("https://discord.test/api/v10/guilds/1/channels");
		expect(ctx.bot()).toBe(ctx.bot());
	});

	it("does not send the bot token to a configured baseUrl unless that is explicitly allowed", async () => {
		const { seen, f } = recordingFetch();
		const ctx = createContext({
			cliToken: WEBHOOK,
			guildId: "1",
			env: { HOLOCRON_DISCORD_BOT_TOKEN: "bot-tok" },
			baseUrl: "https://attacker.example/api",
			fetch: f,
		});
		await notifications(ctx).ensureCategory!("ALERTS");
		expect(seen.length).toBeGreaterThan(0);
		expect(seen.every((r) => r.url.startsWith("https://discord.com/api/v10/"))).toBe(true);
	});

	it("fails with a message naming the bot token env var when none is set", () => {
		const ctx = createContext({ cliToken: WEBHOOK, env: {}, keyring: () => null });
		expect(() => ctx.bot()).toThrow(/HOLOCRON_DISCORD_BOT_TOKEN/);
	});

	it("reads the bot token from the keyring entry discord.holonet", () => {
		const asked: string[] = [];
		const ctx = createContext({
			cliToken: WEBHOOK,
			env: {},
			keyring: (key) => {
				asked.push(key);
				return key === "discord.holonet" ? "stored-bot-tok" : null;
			},
		});
		expect(() => ctx.bot()).not.toThrow();
		expect(asked).toContain("discord.holonet");
	});

	it("points the user at `holocron auth set discord.holonet` when no bot token is found", () => {
		const ctx = createContext({ cliToken: WEBHOOK, env: {}, keyring: () => null });
		expect(() => ctx.bot()).toThrow(/holocron auth set discord\.holonet/);
	});
});

describe("sign-in (notifications link)", () => {
	function routedFetch(over: { connections?: unknown; revokeFails?: boolean; appFails?: boolean } = {}) {
		const seen: Array<{ url: string; method: string; authorization: string; body: string }> = [];
		const f = (async (input: string | URL, init?: RequestInit) => {
			const url = String(input);
			seen.push({
				url,
				method: init?.method ?? "GET",
				authorization: String((init?.headers as Record<string, string> | undefined)?.authorization ?? ""),
				body: typeof init?.body === "string" ? init.body : "",
			});
			if (url.endsWith("/applications/@me")) {
				return over.appFails
					? new Response("{}", { status: 500 })
					: Response.json({ id: "9", name: "Holonet" });
			}
			if (url.endsWith("/oauth2/token"))
				return Response.json({ access_token: "at", token_type: "Bearer", expires_in: 1, scope: "identify" });
			if (url.endsWith("/oauth2/token/revoke"))
				return new Response("{}", { status: over.revokeFails ? 500 : 200 });
			if (url.endsWith("/users/@me")) return Response.json({ id: "333", username: "luke", global_name: "Luke" });
			if (url.endsWith("/users/@me/connections")) {
				return Response.json(
					over.connections ?? [{ id: "55", name: "luke-gh", type: "github", verified: true }]
				);
			}
			return Response.json({});
		}) as unknown as typeof fetch;
		return { seen, f };
	}

	function signIn(
		f: typeof fetch,
		env: Record<string, string> = { HOLOCRON_DISCORD_BOT_TOKEN: "bot", HOLOCRON_DISCORD_CLIENT_SECRET: "shh" }
	) {
		const ctx = createContext({
			cliToken: WEBHOOK,
			env,
			keyring: () => null,
			baseUrl: "https://discord.test/api/v10",
			unsafeBotBaseUrl: true,
			fetch: f,
		});
		return notifications(ctx).signIn!();
	}

	it("builds the authorize link from the application's own id", async () => {
		const { f, seen } = routedFetch();
		const url = new URL(
			await signIn(f).authorizeUrl({ redirectUri: "http://localhost:53682/callback", state: "st" })
		);
		expect(url.searchParams.get("client_id")).toBe("9");
		expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:53682/callback");
		expect(url.searchParams.get("state")).toBe("st");
		expect(url.searchParams.get("scope")).toBe("identify connections");
		expect(seen[0]?.authorization).toBe("Bot bot");
	});

	it("reads who signed in and the GitHub account Discord verified, then revokes the token", async () => {
		const { f, seen } = routedFetch();
		const who = await signIn(f).complete({ redirectUri: "http://localhost:53682/callback", code: "c" });
		expect(who).toEqual({ member: "333", name: "Luke", github: { id: "55", login: "luke-gh" } });
		const exchange = seen.find((r) => r.url.endsWith("/oauth2/token"));
		expect(new URLSearchParams(exchange!.body).get("code")).toBe("c");
		expect(seen.some((r) => r.url.endsWith("/oauth2/token/revoke"))).toBe(true);
	});

	it("reports no GitHub account when none is verified, and still revokes", async () => {
		const { f, seen } = routedFetch({ connections: [{ id: "55", name: "x", type: "github", verified: false }] });
		const who = await signIn(f).complete({ redirectUri: "http://localhost:53682/callback", code: "c" });
		expect(who.github).toBeUndefined();
		expect(who.member).toBe("333");
		expect(seen.some((r) => r.url.endsWith("/oauth2/token/revoke"))).toBe(true);
	});

	it("uses the username when the member has no display name", async () => {
		const { f } = routedFetch();
		const wrapped = (async (input: string | URL, init?: RequestInit) => {
			if (String(input).endsWith("/users/@me")) return Response.json({ id: "333", username: "luke" });
			return f(input, init);
		}) as unknown as typeof fetch;
		expect(
			(await signIn(wrapped).complete({ redirectUri: "http://localhost:53682/callback", code: "c" })).name
		).toBe("luke");
	});

	it("a failed revoke does not hide who signed in", async () => {
		const { f } = routedFetch({ revokeFails: true });
		await expect(
			signIn(f).complete({ redirectUri: "http://localhost:53682/callback", code: "c" })
		).resolves.toMatchObject({ member: "333" });
	});

	it("names the client secret setting when it is missing", async () => {
		const { f } = routedFetch();
		await expect(
			signIn(f, { HOLOCRON_DISCORD_BOT_TOKEN: "bot" }).authorizeUrl({
				redirectUri: "http://localhost:53682/callback",
				state: "s",
			})
		).rejects.toThrow(/HOLOCRON_DISCORD_CLIENT_SECRET/);
	});

	it("looks the application up again after a failure, and only once after a success", async () => {
		const failing = routedFetch({ appFails: true });
		const s = signIn(failing.f);
		await expect(
			s.authorizeUrl({ redirectUri: "http://localhost:53682/callback", state: "s" })
		).rejects.toBeDefined();
		const ok = routedFetch();
		const t = signIn(ok.f);
		await t.authorizeUrl({ redirectUri: "http://localhost:53682/callback", state: "a" });
		await t.authorizeUrl({ redirectUri: "http://localhost:53682/callback", state: "b" });
		expect(ok.seen.filter((r) => r.url.endsWith("/applications/@me"))).toHaveLength(1);
	});

	it("a provider built without OAuth says so", async () => {
		const n = new DiscordNotifications(createDiscordClient(), {}, () => WEBHOOK);
		await expect(
			n.signIn().authorizeUrl({ redirectUri: "http://localhost:53682/callback", state: "s" })
		).rejects.toThrow(/no Discord OAuth client configured/);
	});
});
