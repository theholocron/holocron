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

	it("resolves the bot token only when a provisioning call is made, from its own env var", async () => {
		const ctx = createContext({
			cliToken: WEBHOOK,
			guildId: "1",
			env: { HOLOCRON_DISCORD_BOT_TOKEN: "bot-tok" },
			baseUrl: "https://discord.test/api/v10",
			fetch: (async (_url: unknown, init?: RequestInit) =>
				new Response(JSON.stringify([]), {
					status: 200,
					headers: { "x-auth": String((init?.headers as Record<string, string>)?.authorization) },
				})) as unknown as typeof fetch,
		});
		// Building the capability must not demand a bot token.
		expect(() => notifications(ctx)).not.toThrow();
		await expect(ctx.bot().guilds.channels("1")).resolves.toEqual([]);
		expect(ctx.bot()).toBe(ctx.bot());
	});

	it("fails with a message naming the bot token env var when none is set", () => {
		const ctx = createContext({ cliToken: WEBHOOK, env: {}, keyring: () => null });
		expect(() => ctx.bot()).toThrow(/HOLOCRON_DISCORD_BOT_TOKEN/);
	});
});
