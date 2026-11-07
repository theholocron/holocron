import { describe, expect, it } from "vitest";

import { findDiscordOptions } from "./find-discord-options.js";

describe("findDiscordOptions", () => {
	it("returns the discord entry's options", () => {
		const config = { providers: { notifications: ["discord", { guildId: "1" }] } };
		expect(findDiscordOptions(config, "acme/holocron")).toEqual({ ok: true, options: { guildId: "1" } });
	});

	it("finds discord among several providers", () => {
		const config = { providers: { notifications: ["slack", ["discord", { guildId: "2" }]] } };
		expect(findDiscordOptions(config, "acme/holocron")).toEqual({ ok: true, options: { guildId: "2" } });
	});

	it("says so when there is no notifications provider, or none is discord", () => {
		expect(findDiscordOptions({}, "acme/holocron")).toEqual({
			ok: false,
			reason: "acme/holocron declares no notifications provider",
		});
		expect(findDiscordOptions({ providers: { notifications: ["slack"] } }, "acme/holocron")).toEqual({
			ok: false,
			reason: "acme/holocron declares no discord notifications provider",
		});
	});
});
