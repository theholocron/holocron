import { describe, expect, it } from "vitest";

import { tokens } from "./index.js";

describe("the plugin's tokens export", () => {
	it("lists each token the plugin resolves, with where it is looked up", () => {
		expect(tokens).toEqual([
			{ envName: "HOLOCRON_DISCORD_WEBHOOK", vendorEnvName: "DISCORD_WEBHOOK_URL", keyringKey: "discord" },
			{
				envName: "HOLOCRON_DISCORD_BOT_TOKEN",
				vendorEnvName: "DISCORD_BOT_TOKEN",
				keyringKey: "discord.holonet",
				verifiable: false,
			},
			{
				envName: "HOLOCRON_DISCORD_CLIENT_SECRET",
				vendorEnvName: "DISCORD_CLIENT_SECRET",
				keyringKey: "discord.holonet.oauth",
				verifiable: false,
			},
		]);
	});
});
