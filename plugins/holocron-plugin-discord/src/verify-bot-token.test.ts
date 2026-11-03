import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { verifyBotToken } from "./verify-bot-token.js";

const BASE = "https://discord.test/api/v10";

describe("verifyBotToken", () => {
	it("returns ok:true with the application's name and id, asking only for its own application", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { id: "9", name: "Holonet" } }]);
		const result = await verifyBotToken("bot-tok", { baseUrl: BASE, fetch, unsafeBotBaseUrl: true });
		expect(result).toEqual({ ok: true, subject: "bot: Holonet (id: 9)" });
		expect(calls[0]?.url).toBe(`${BASE}/applications/@me`);
	});

	it("returns ok:false with Discord's message when the token is rejected", async () => {
		const { fetch } = stubFetch([{ status: 401, body: { message: "401: Unauthorized" } }]);
		const result = await verifyBotToken("bad", { baseUrl: BASE, fetch, unsafeBotBaseUrl: true });
		expect(result.ok).toBe(false);
	});

	it("does not send the bot token to a base URL unless that is switched on", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { id: "9", name: "Holonet" } }]);
		await verifyBotToken("bot-tok", { baseUrl: BASE, fetch });
		expect(calls[0]?.url).toBe("https://discord.com/api/v10/applications/@me");
	});
});
