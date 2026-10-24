import { describe, expect, it, vi } from "vitest";

import { createDiscordClient, parseWebhookUrl } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://discord.test/api/v10";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createDiscordClient({ baseUrl: BASE, fetch });
	return { client, calls };
}

describe("createDiscordClient", () => {
	it("targets the default Discord base URL when no override is given", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "w1", name: "hooks" } }]);
		const client = createDiscordClient({ fetch });
		await client.webhooks.get("w1", "tok");
		expect(calls[0]?.url).toContain("https://discord.com/api/v10");
	});

	it("respects baseUrl override", async () => {
		const { client, calls } = makeClient([{ body: { id: "w1", name: "hooks" } }]);
		await client.webhooks.get("w1", "tok");
		expect(calls[0]?.url).toContain(BASE);
	});

	it("sends no Authorization header -- the id+token are in the URL path", async () => {
		const { client, calls } = makeClient([{ body: { id: "w1", name: "hooks" } }]);
		await client.webhooks.get("w1", "tok");
		expect(calls[0]?.headers.authorization).toBeUndefined();
	});
});

describe("webhooks.get", () => {
	it("GET /webhooks/:id/:token", async () => {
		const { client, calls } = makeClient([{ body: { id: "w1", name: "hooks", guild_id: "g1" } }]);
		const result = await client.webhooks.get("w1", "tok");
		expect(calls[0]?.url).toBe(`${BASE}/webhooks/w1/tok`);
		expect(calls[0]?.method).toBe("GET");
		expect(result).toEqual({ id: "w1", name: "hooks", guild_id: "g1" });
	});

	it("throws ProviderApiError on a non-2xx response", async () => {
		const { client } = makeClient([{ status: 404, body: { message: "Unknown Webhook" } }]);
		const err = await client.webhooks.get("w1", "bad-tok").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});

	it("wraps a transport failure as ProviderApiError with status 0", async () => {
		const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		const client = createDiscordClient({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch });
		const err = await client.webhooks.get("w1", "tok").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
		expect((err as { status: number }).status).toBe(0);
	});

	it("stringifies a non-Error throw in the transport-failure message", async () => {
		const fetch = vi.fn().mockRejectedValue("plain string boom");
		const client = createDiscordClient({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch });
		const err = await client.webhooks.get("w1", "tok").catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/plain string boom/);
	});
});

describe("webhooks.execute", () => {
	it("POST /webhooks/:id/:token with content", async () => {
		const { client, calls } = makeClient([{ status: 204 }]);
		await client.webhooks.execute("w1", "tok", "hello");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/webhooks/w1/tok`);
		expect(calls[0]?.body).toEqual({ content: "hello" });
	});

	it("throws ProviderApiError on a non-2xx response", async () => {
		const { client } = makeClient([{ status: 400, body: { message: "bad content" } }]);
		const err = await client.webhooks.execute("w1", "tok", "hello").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
	});

	it("wraps a transport failure as ProviderApiError with status 0", async () => {
		const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		const client = createDiscordClient({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch });
		const err = await client.webhooks.execute("w1", "tok", "hello").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
		expect((err as { status: number }).status).toBe(0);
	});

	it("stringifies a non-Error throw in the transport-failure message", async () => {
		const fetch = vi.fn().mockRejectedValue("plain string boom");
		const client = createDiscordClient({ baseUrl: BASE, fetch: fetch as unknown as typeof globalThis.fetch });
		const err = await client.webhooks.execute("w1", "tok", "hello").catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/plain string boom/);
	});
});

describe("parseWebhookUrl", () => {
	it("parses id and token out of a real Discord webhook URL", () => {
		expect(parseWebhookUrl("https://discord.com/api/webhooks/123456789/abcDEF-token")).toEqual({
			id: "123456789",
			token: "abcDEF-token",
		});
	});

	it("throws on an invalid URL", () => {
		expect(() => parseWebhookUrl("https://discord.com/not-a-webhook")).toThrow(/Invalid Discord webhook URL/);
	});
});

describe("webhooks.executeAndWait and deleteMessage", () => {
	it("posts with wait=true, no mentions, and returns the message id", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "88" } }]);
		const client = createDiscordClient({ baseUrl: "https://d.test/api", fetch });
		expect(await client.webhooks.executeAndWait("1", "tok", "hi")).toEqual({ id: "88" });
		expect(calls[0]).toMatchObject({
			url: "https://d.test/api/webhooks/1/tok?wait=true",
			method: "POST",
			body: { content: "hi", allowed_mentions: { parse: [] } },
		});
	});

	it("executeAndWait: a refusal and a transport failure are ProviderApiErrors", async () => {
		const refused = createDiscordClient({ fetch: stubFetch([{ status: 404 }]).fetch });
		await expect(refused.webhooks.executeAndWait("1", "t", "x")).rejects.toMatchObject({ status: 404 });
		const down = createDiscordClient({ fetch: (() => Promise.reject(new Error("offline"))) as typeof fetch });
		await expect(down.webhooks.executeAndWait("1", "t", "x")).rejects.toMatchObject({ status: 0 });
		const odd = createDiscordClient({ fetch: (() => Promise.reject("nope")) as typeof fetch });
		await expect(odd.webhooks.executeAndWait("1", "t", "x")).rejects.toMatchObject({ status: 0 });
	});

	it("deleteMessage: DELETE, 404 counts as done, other failures throw", async () => {
		const { fetch, calls } = stubFetch([{ status: 204 }, { status: 404 }, { status: 403 }]);
		const client = createDiscordClient({ baseUrl: "https://d.test/api", fetch });
		await client.webhooks.deleteMessage("1", "tok", "88");
		await client.webhooks.deleteMessage("1", "tok", "88");
		await expect(client.webhooks.deleteMessage("1", "tok", "88")).rejects.toMatchObject({ status: 403 });
		expect(calls[0]).toMatchObject({ url: "https://d.test/api/webhooks/1/tok/messages/88", method: "DELETE" });
	});

	it("deleteMessage: a transport failure is a ProviderApiError", async () => {
		const down = createDiscordClient({ fetch: (() => Promise.reject(new Error("offline"))) as typeof fetch });
		await expect(down.webhooks.deleteMessage("1", "t", "9")).rejects.toMatchObject({ status: 0 });
		const odd = createDiscordClient({ fetch: (() => Promise.reject("nope")) as typeof fetch });
		await expect(odd.webhooks.deleteMessage("1", "t", "9")).rejects.toMatchObject({ status: 0 });
	});
});

describe("createDiscordClient defaults", () => {
	it("uses the global fetch when none is injected", async () => {
		const { fetch, calls } = stubFetch([{ body: { id: "1", name: "n" } }]);
		vi.stubGlobal("fetch", fetch);
		await createDiscordClient().webhooks.get("1", "tok");
		vi.unstubAllGlobals();
		expect(calls[0]?.url).toBe("https://discord.com/api/v10/webhooks/1/tok");
	});
});
