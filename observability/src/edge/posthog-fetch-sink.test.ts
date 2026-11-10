import { afterEach, describe, expect, it, vi } from "vitest";

import { PostHogFetchSink } from "./posthog-fetch-sink.js";

afterEach(() => {
	vi.unstubAllGlobals();
});

function body(call: unknown[]): Record<string, unknown> {
	return JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
}

describe("PostHogFetchSink", () => {
	it("posts a capture to <host>/capture/ with the key, event, person and properties", () => {
		const fetch = vi.fn().mockResolvedValue({});
		new PostHogFetchSink({ key: "phc_fake", host: "https://us.example.invalid/", fetch }).capture("u1", "viewed", {
			page: "/",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0]![0]).toBe("https://us.example.invalid/capture/");
		expect((fetch.mock.calls[0]![1] as { method: string }).method).toBe("POST");
		expect(body(fetch.mock.calls[0]!)).toEqual({
			api_key: "phc_fake",
			event: "viewed",
			distinct_id: "u1",
			properties: { page: "/" },
		});
	});
	it("sends identify as a $identify event with $set", () => {
		const fetch = vi.fn().mockResolvedValue({});
		new PostHogFetchSink({ key: "k", host: "https://h.example.invalid", fetch }).identify("u1", { plan: "pro" });
		expect(body(fetch.mock.calls[0]!)).toMatchObject({ event: "$identify", properties: { $set: { plan: "pro" } } });
	});
	it("shutdown waits for requests in flight", async () => {
		let release: () => void = () => {};
		const fetch = vi.fn(() => new Promise<unknown>((resolve) => (release = () => resolve({}))));
		const sink = new PostHogFetchSink({ key: "k", host: "https://h.example.invalid", fetch });
		sink.capture("u", "e", {});
		let done = false;
		const shutdown = sink.shutdown().then(() => (done = true));
		await Promise.resolve();
		expect(done).toBe(false);
		release();
		await shutdown;
		expect(done).toBe(true);
	});
	it("hands each request to waitUntil", () => {
		const waitUntil = vi.fn();
		const fetch = vi.fn().mockResolvedValue({});
		new PostHogFetchSink({ key: "k", host: "https://h.example.invalid", fetch, waitUntil }).capture("u", "e", {});
		expect(waitUntil).toHaveBeenCalledWith(expect.any(Promise));
	});
	it("never throws when fetch rejects, throws, or waitUntil throws", async () => {
		const rejecting = new PostHogFetchSink({
			key: "k",
			host: "https://h.example.invalid",
			fetch: () => Promise.reject(new Error("offline")),
		});
		const throwing = new PostHogFetchSink({
			key: "k",
			host: "https://h.example.invalid",
			fetch: () => {
				throw new Error("sync");
			},
		});
		const badWait = new PostHogFetchSink({
			key: "k",
			host: "https://h.example.invalid",
			fetch: () => Promise.resolve({}),
			waitUntil: () => {
				throw new Error("frozen");
			},
		});
		expect(() => {
			rejecting.capture("u", "e", {});
			throwing.capture("u", "e", {});
			badWait.identify("u", {});
		}).not.toThrow();
		await expect(
			Promise.all([rejecting.shutdown(), throwing.shutdown(), badWait.shutdown()])
		).resolves.toBeDefined();
	});
	it("uses the global fetch by default", () => {
		const fetch = vi.fn().mockResolvedValue({});
		vi.stubGlobal("fetch", fetch);
		new PostHogFetchSink({ key: "k", host: "https://h.example.invalid" }).capture("u", "e", {});
		expect(fetch).toHaveBeenCalledWith(
			"https://h.example.invalid/capture/",
			expect.objectContaining({ method: "POST" })
		);
	});
});
