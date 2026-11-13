import { tokenExpectations } from "@theholocron/cli";
import { describe, expect, it, vi } from "vitest";

import { BOT_NEEDS } from "./bot-needs.js";
import { tokens } from "./index.js";
import { EXPECTED } from "./probes/token/expectations.js";

describe("the plugin's tokens export", () => {
	it("lists each token the plugin resolves, with where it is looked up", () => {
		expect(tokens).toEqual([
			{
				envName: "HOLOCRON_DISCORD_WEBHOOK",
				vendorEnvName: "DISCORD_WEBHOOK_URL",
				keyringKey: "discord",
				optional: true,
			},
			{
				envName: "HOLOCRON_DISCORD_BOT_TOKEN",
				vendorEnvName: "DISCORD_BOT_TOKEN",
				keyringKey: "discord.holonet",
				verify: expect.any(Function),
				expect: EXPECTED,
			},
			{
				envName: "HOLOCRON_DISCORD_CLIENT_SECRET",
				vendorEnvName: "DISCORD_CLIENT_SECRET",
				keyringKey: "discord.holonet.oauth",
				verifiable: false,
			},
		]);
	});

	it("checks the bot token against the Discord API, with the token as a bot credential", async () => {
		const fetchMock = vi.fn(
			async () => new Response(JSON.stringify({ id: "1", name: "holonet" }), { status: 200 })
		);
		vi.stubGlobal("fetch", fetchMock);
		const bot = tokens.find((t) => t.keyringKey === "discord.holonet");
		const result = await bot?.verify?.("bot-token");
		vi.unstubAllGlobals();

		expect(result).toEqual({ ok: true, subject: "bot: holonet (id: 1)" });
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toContain("/applications/@me");
		expect(JSON.stringify(init.headers)).toContain("Bot bot-token");
	});

	it("declares the same membership and permissions for every layer that holds the bot token, from the one needs list", () => {
		const found = tokenExpectations(tokens);
		expect(found.map((e) => e.layer)).toEqual(["local", "dev", "ci", "prod"]);
		for (const e of found) {
			expect(e.required).toEqual(["guild", ...BOT_NEEDS]);
			expect(e.absent).toEqual([]);
		}
	});
});
