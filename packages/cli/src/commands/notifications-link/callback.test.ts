import { describe, expect, it } from "vitest";

import { DEFAULT_LOCAL_PORT, localRedirectUri, redirectInstruction, resolveCallback } from "./callback.js";

const reply = (status: number, body: unknown = {}) =>
	(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("resolveCallback", () => {
	it("is local with the default port when no hosted URL is configured", async () => {
		const choice = await resolveCallback({});
		expect(choice).toMatchObject({ kind: "local", redirectUri: "http://localhost:53682/callback" });
		expect(choice.reason).toContain("no hosted URL");
		expect(DEFAULT_LOCAL_PORT).toBe(53682);
	});

	it("is hosted when the service answers as the link service", async () => {
		const seen: string[] = [];
		const f = (async (url: string) => {
			seen.push(url);
			return Response.json({ service: "link" });
		}) as unknown as typeof fetch;
		const choice = await resolveCallback({ hostedUrl: "https://sentinel.example///", fetch: f });
		expect(choice).toMatchObject({ kind: "hosted", redirectUri: "https://sentinel.example/api/link/callback" });
		expect(seen).toEqual(["https://sentinel.example/api/link"]);
	});

	it("falls back to this machine, saying why, on a 402", async () => {
		const choice = await resolveCallback({ hostedUrl: "https://s.example", port: 4000, fetch: reply(402) });
		expect(choice).toMatchObject({ kind: "local", redirectUri: "http://localhost:4000/callback" });
		expect(choice.reason).toContain("402");
	});

	it("falls back on any other refusal, a different service, or no answer", async () => {
		expect((await resolveCallback({ hostedUrl: "https://s.example", fetch: reply(404) })).reason).toContain("404");
		expect(
			(await resolveCallback({ hostedUrl: "https://s.example", fetch: reply(200, { service: "other" }) })).reason
		).toContain("not the link service");
		const notJson = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
		expect((await resolveCallback({ hostedUrl: "https://s.example", fetch: notJson })).kind).toBe("local");
		const down = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		expect((await resolveCallback({ hostedUrl: "https://s.example", fetch: down })).reason).toContain(
			"did not answer"
		);
	});

	it("uses the global fetch when none is given", async () => {
		const down = (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch;
		const original = globalThis.fetch;
		globalThis.fetch = down;
		try {
			expect((await resolveCallback({ hostedUrl: "https://s.example", timeoutMs: 50 })).kind).toBe("local");
		} finally {
			globalThis.fetch = original;
		}
	});
});

describe("helpers", () => {
	it("words the portal step for the redirect wanted", () => {
		expect(localRedirectUri(1234)).toBe("http://localhost:1234/callback");
		expect(redirectInstruction("http://localhost:1234/callback")).toContain("OAuth2 → Redirects");
	});
});
