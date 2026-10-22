import { describe, expect, it } from "vitest";

import { createContext, createPlugin, notifications } from "./index.js";

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
