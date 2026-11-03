import { stubFetch } from "@theholocron/http-client/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyBotToken } from "./verify-bot-token.js";

const BASE = "https://discord.test/api/v10";

afterEach(() => vi.unstubAllGlobals());

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

	it("uses the global fetch when it is given none", async () => {
		const seen: string[] = [];
		vi.stubGlobal("fetch", async (input: string | URL) => {
			seen.push(String(input));
			return new Response(JSON.stringify({ id: "9", name: "Holonet" }), { status: 200 });
		});
		expect(await verifyBotToken("bot-tok")).toEqual({ ok: true, subject: "bot: Holonet (id: 9)" });
		expect(seen).toEqual(["https://discord.com/api/v10/applications/@me"]);
	});
});
