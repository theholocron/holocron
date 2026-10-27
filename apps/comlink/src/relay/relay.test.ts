import { afterEach, describe, expect, it, vi } from "vitest";

import { MalformedDelivery, type Source } from "../sources/source.type.js";
import { bindingNames, createRelay, MAX_BODY_BYTES } from "./relay.js";

const HOOK = "https://discord.com/api/webhooks/1/token";

// A source that trusts the header `x-ok: yes` and carries payloads with a `text`, so the relay is tested on its own.
const fake: Source = {
	id: "fake",
	verify: async (headers) => headers.get("x-ok") === "yes",
	format: (_headers, payload) => {
		const text = (payload as { text?: string } | null)?.text;
		if (text === "broken") throw new MalformedDelivery("broken");
		if (text === "crash") throw new Error("crash");
		return text ? { username: "Fake", allowed_mentions: { parse: [] }, embeds: [{ title: text }] } : null;
	},
};
const relay = createRelay([fake]);
const env = { COMLINK_FAKE_SECRET: "s", COMLINK_FAKE_WEBHOOK: HOOK };

const post = (path: string, body: string, headers: Record<string, string> = { "x-ok": "yes" }, method = "POST") =>
	new Request(`https://comlink.example${path}`, { method, headers, ...(method === "GET" ? {} : { body }) });

function discord(status = 204) {
	const spy = vi.fn(async () => new Response(null, { status }));
	vi.stubGlobal("fetch", spy);
	return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe("bindingNames", () => {
	it("prefixes a source's two secrets with Comlink and its id", () => {
		expect(bindingNames("sentry")).toEqual({ secret: "COMLINK_SENTRY_SECRET", webhook: "COMLINK_SENTRY_WEBHOOK" });
	});
});

describe("the relay", () => {
	it("posts a source's message to that source's webhook", async () => {
		const spy = discord();
		const res = await relay(post("/fake", JSON.stringify({ text: "hello" })), env);
		expect(res.status).toBe(204);
		const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe(HOOK);
		expect(JSON.parse(init.body as string).embeds[0].title).toBe("hello");
	});

	it("only takes POST", async () => {
		const spy = discord();
		expect((await relay(post("/fake", "", {}, "GET"), env)).status).toBe(405);
		expect(spy).not.toHaveBeenCalled();
	});

	it("answers 404 for a path that is no source's, without reading the body", async () => {
		const spy = discord();
		for (const path of ["/", "/nope", "/nope/fake"]) {
			expect((await relay(post(path, "{}"), env)).status).toBe(404);
		}
		expect(spy).not.toHaveBeenCalled();
	});

	it("uses only the first path segment, so a trailing path still reaches the source", async () => {
		discord();
		expect((await relay(post("/fake/extra", JSON.stringify({ text: "x" })), env)).status).toBe(204);
	});

	it("refuses, before posting, a request the source does not vouch for", async () => {
		const spy = discord();
		expect((await relay(post("/fake", JSON.stringify({ text: "x" }), { "x-ok": "no" }), env)).status).toBe(401);
		expect(spy).not.toHaveBeenCalled();
	});

	it("passes the source its own secret, and an empty one when none is bound", async () => {
		const verify = vi.fn(async (_headers: Headers, _raw: string, _secret: string) => true);
		const spyRelay = createRelay([{ ...fake, verify }]);
		discord();
		await spyRelay(post("/fake", JSON.stringify({ text: "x" })), env);
		await spyRelay(post("/fake", JSON.stringify({ text: "x" })), {});
		expect(verify.mock.calls.map((c) => c[2])).toEqual(["s", ""]);
	});

	it("answers 400 for a vouched-for body that is not JSON", async () => {
		const spy = discord();
		expect((await relay(post("/fake", "not json"), env)).status).toBe(400);
		expect(spy).not.toHaveBeenCalled();
	});

	it("acknowledges, without posting, a delivery the source does not carry", async () => {
		const spy = discord();
		expect((await relay(post("/fake", JSON.stringify({})), env)).status).toBe(202);
		expect(spy).not.toHaveBeenCalled();
	});

	it("answers 422 for a delivery the source cannot read, and lets any other failure through", async () => {
		const spy = discord();
		expect((await relay(post("/fake", JSON.stringify({ text: "broken" })), env)).status).toBe(422);
		await expect(relay(post("/fake", JSON.stringify({ text: "crash" })), env)).rejects.toThrow("crash");
		expect(spy).not.toHaveBeenCalled();
	});

	it("refuses an oversized body before the source sees it, by its declared length or its actual length", async () => {
		const spy = discord();
		const verify = vi.fn(async () => true);
		const guarded = createRelay([{ ...fake, verify }]);
		const big = "x".repeat(MAX_BODY_BYTES + 1);
		expect((await guarded(post("/fake", "{}", { "content-length": String(MAX_BODY_BYTES + 1) }), env)).status).toBe(
			413
		);
		expect((await guarded(post("/fake", big), env)).status).toBe(413);
		expect(verify).not.toHaveBeenCalled();
		expect(spy).not.toHaveBeenCalled();
	});

	it("says it is not configured when the source has no webhook bound", async () => {
		const spy = discord();
		expect((await relay(post("/fake", JSON.stringify({ text: "x" })), { COMLINK_FAKE_SECRET: "s" })).status).toBe(
			500
		);
		expect(spy).not.toHaveBeenCalled();
	});

	it("answers 502 when Discord refuses the post", async () => {
		discord(429);
		expect((await relay(post("/fake", JSON.stringify({ text: "x" })), env)).status).toBe(502);
	});
});
