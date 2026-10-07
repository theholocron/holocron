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
