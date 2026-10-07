import { describe, expect, it, vi } from "vitest";

import { createSlackClient } from "../index.js";
import { stubFetch } from "./helpers.js";

const BASE = "https://slack.test/api";
const TOKEN = "xoxb-test-token";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	const client = createSlackClient({ token: TOKEN, baseUrl: BASE, fetch });
	return { client, calls };
}

describe("createSlackClient", () => {
	it("sends Bearer authorization header", async () => {
		const { client, calls } = makeClient([{ body: { ok: true, team: "t", user: "u" } }]);
		await client.auth.test();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("targets the default Slack API base URL when no override is given", async () => {
		const { fetch, calls } = stubFetch([{ body: { ok: true, team: "t", user: "u" } }]);
		const client = createSlackClient({ token: TOKEN, fetch });
		await client.auth.test();
		expect(calls[0]?.url).toContain("https://slack.com/api");
	});

	it("respects baseUrl override", async () => {
		const { client, calls } = makeClient([{ body: { ok: true, team: "t", user: "u" } }]);
		await client.auth.test();
		expect(calls[0]?.url).toContain(BASE);
	});

	it("throws ProviderApiError when Slack returns ok:false, even on HTTP 200", async () => {
		const { client } = makeClient([{ status: 200, body: { ok: false, error: "invalid_auth" } }]);
		const err = await client.auth.test().catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
		expect((err as Error).message).toBe("invalid_auth");
	});

	it("wraps a transport failure as ProviderApiError with status 0", async () => {
		const fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
		const client = createSlackClient({
			token: TOKEN,
			baseUrl: BASE,
			fetch: fetch as unknown as typeof globalThis.fetch,
		});
		const err = await client.auth.test().catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
		expect((err as { status: number }).status).toBe(0);
	});

	it("stringifies a non-Error throw in the transport-failure message", async () => {
		const fetch = vi.fn().mockRejectedValue("plain string boom");
		const client = createSlackClient({
			token: TOKEN,
			baseUrl: BASE,
			fetch: fetch as unknown as typeof globalThis.fetch,
		});
		const err = await client.auth.test().catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/plain string boom/);
	});

	it("falls back to globalThis.fetch when no override is given", async () => {
		const { fetch, calls } = stubFetch([{ body: { ok: true, team: "t", user: "u" } }]);
		vi.stubGlobal("fetch", fetch);
		try {
			const client = createSlackClient({ token: TOKEN, baseUrl: BASE });
			await client.auth.test();
			expect(calls[0]?.url).toBe(`${BASE}/auth.test`);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("falls back to a generic message when a non-ok response has no error field", async () => {
		const { client } = makeClient([{ body: { ok: false } }]);
		const err = await client.auth.test().catch((e: unknown) => e);
		expect((err as Error).message).toBe("unknown Slack error");
	});
});

describe("auth.test", () => {
	it("POST auth.test", async () => {
		const { client, calls } = makeClient([{ body: { ok: true, team: "acme", user: "bot" } }]);
		const result = await client.auth.test();
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/auth.test`);
		expect(result).toEqual({ ok: true, team: "acme", user: "bot" });
	});
});

describe("chat.postMessage", () => {
	it("POST chat.postMessage with channel and text", async () => {
		const { client, calls } = makeClient([{ body: { ok: true } }]);
		await client.chat.postMessage("#general", "hello");
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/chat.postMessage`);
		expect(calls[0]?.body).toEqual({ channel: "#general", text: "hello" });
	});

	it("throws ProviderApiError when Slack returns ok:false", async () => {
		const { client } = makeClient([{ body: { ok: false, error: "channel_not_found" } }]);
		const err = await client.chat.postMessage("#nope", "hello").catch((e: unknown) => e);
		expect((err as Error).name).toBe("ProviderApiError");
		expect((err as Error).message).toBe("channel_not_found");
	});
});
