import { afterEach, describe, expect, it, vi } from "vitest";

import { clip, message, postToDiscord } from "./discord.js";

afterEach(() => vi.unstubAllGlobals());

describe("clip", () => {
	it("leaves short text, and null or undefined, alone", () => {
		expect(clip("abc", 5)).toBe("abc");
		expect(clip(undefined, 5)).toBe("");
		expect(clip(null, 5)).toBe("");
		expect(clip(12, 5)).toBe("12");
	});

	it("cuts long text to exactly the limit, ending in an ellipsis", () => {
		const cut = clip("x".repeat(20), 10);
		expect(cut).toHaveLength(10);
		expect(cut.endsWith("…")).toBe(true);
	});
});

describe("message", () => {
	it("pings no one", () => {
		expect(message("Sentry", { title: "t" })).toEqual({
			username: "Sentry",
			allowed_mentions: { parse: [] },
			embeds: [{ title: "t" }],
		});
	});
});

describe("message, combined limit", () => {
	it("cuts the description so title, description and fields fit 6000 together", () => {
		const embed = message("S", {
			title: "t".repeat(256),
			description: "d".repeat(4096),
			fields: [
				{ name: "n".repeat(100), value: "v".repeat(1024) },
				{ name: "n", value: "v".repeat(1024) },
				{ name: "n", value: "v".repeat(1024) },
			],
		}).embeds[0]!;
		const total =
			embed.title!.length +
			embed.description!.length +
			embed.fields!.reduce((n, f) => n + f.name.length + f.value.length, 0);
		expect(total).toBe(6000);
	});

	it("drops the description when nothing is left for it, and leaves a small embed alone", () => {
		const big = {
			title: "t",
			description: "d",
			fields: Array.from({ length: 6 }, () => ({ name: "n", value: "v".repeat(1024) })),
		};
		expect(message("S", big).embeds[0]).not.toHaveProperty("description");
		const small = { title: "t", description: "d" };
		expect(message("S", small).embeds[0]).toEqual(small);
	});
});

describe("postToDiscord", () => {
	it("posts the message as JSON and says whether Discord took it", async () => {
		const spy = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", spy);
		expect(await postToDiscord("https://discord.com/api/webhooks/1/t", message("S", { title: "t" }))).toBe(true);
		const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://discord.com/api/webhooks/1/t");
		expect(init.method).toBe("POST");
		expect(JSON.parse(init.body as string).embeds[0].title).toBe("t");

		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(null, { status: 429 }))
		);
		expect(await postToDiscord("https://discord.com/api/webhooks/1/t", message("S", {}))).toBe(false);
	});

	it("says false, rather than throwing, when the request fails or times out", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => {
				throw new Error("boom");
			})
		);
		expect(await postToDiscord("https://discord.com/api/webhooks/1/t", message("S", {}))).toBe(false);
	});

	it("gives the request a timeout signal", async () => {
		const spy = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", spy);
		await postToDiscord("https://discord.com/api/webhooks/1/t", message("S", {}));
		const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});
