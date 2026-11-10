import { describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
	default: {
		init: vi.fn(),
		get_distinct_id: vi.fn(() => "anon"),
		identify: vi.fn(),
		capture: vi.fn(),
		shutdown: vi.fn().mockResolvedValue(undefined),
	},
}));

import posthog from "posthog-js";

import { PostHogBrowserSink } from "./posthog-browser-sink.js";

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

function fakeClient(current = "u1") {
	return {
		init: vi.fn(),
		get_distinct_id: vi.fn(() => current),
		identify: vi.fn(),
		capture: vi.fn(),
		shutdown: vi.fn().mockResolvedValue(undefined),
	};
}

describe("PostHogBrowserSink init", () => {
	it("starts the client with api_host and nothing captured by default", () => {
		const client = fakeClient();
		new PostHogBrowserSink({ key: "phc_fake", host: "https://eu.example.invalid", client });
		expect(client.init).toHaveBeenCalledWith("phc_fake", {
			autocapture: false,
			capture_pageview: false,
			capture_pageleave: false,
			disable_session_recording: true,
			person_profiles: "identified_only",
			api_host: "https://eu.example.invalid",
		});
	});
	it("lets the caller opt in through options, but not change the host", () => {
		const client = fakeClient();
		new PostHogBrowserSink({
			key: "k",
			host: "https://h.example.invalid",
			client,
			options: { capture_pageview: true, api_host: "https://other.invalid" },
		});
		expect(client.init).toHaveBeenCalledWith(
			"k",
			expect.objectContaining({
				capture_pageview: true,
				autocapture: false,
				api_host: "https://h.example.invalid",
			})
		);
	});
});

describe("PostHogBrowserSink person rule", () => {
	it("does not identify when distinctId is the client's current person", () => {
		const client = fakeClient("u1");
		new PostHogBrowserSink({ key: "k", host: "h", client }).capture("u1", "clicked", { where: "nav" });
		expect(client.identify).not.toHaveBeenCalled();
		expect(client.capture).toHaveBeenCalledWith("clicked", { where: "nav" });
	});
	it("identifies the supplied person first when the client is on another one", () => {
		const client = fakeClient("someone-else");
		new PostHogBrowserSink({ key: "k", host: "h", client }).capture("u2", "clicked", {});
		expect(client.identify).toHaveBeenCalledWith("u2");
		expect(client.identify.mock.invocationCallOrder[0]).toBeLessThan(client.capture.mock.invocationCallOrder[0]!);
	});
});

describe("PostHogBrowserSink calls", () => {
	it("forwards identify", () => {
		const client = fakeClient();
		new PostHogBrowserSink({ key: "k", host: "h", client }).identify("u1", { plan: "pro" });
		expect(client.identify).toHaveBeenCalledWith("u1", { plan: "pro" });
	});
	it("scrubs token-shaped values in event and person properties", () => {
		const client = fakeClient();
		const sink = new PostHogBrowserSink({ key: "k", host: "h", client });
		sink.capture("u1", "e", { note: `key ${TOKEN}` });
		sink.identify("u1", { secret: TOKEN });
		expect(JSON.stringify(client.capture.mock.calls)).not.toContain(TOKEN);
		expect(JSON.stringify(client.identify.mock.calls)).not.toContain(TOKEN);
		expect(client.identify).toHaveBeenCalledWith("u1", { secret: "[REDACTED]" });
	});
	it("shuts the client down", async () => {
		const client = fakeClient();
		await new PostHogBrowserSink({ key: "k", host: "h", client }).shutdown();
		expect(client.shutdown).toHaveBeenCalled();
	});
	it("never throws into the app, and reports each error with its context", async () => {
		const boom = vi.fn(() => {
			throw new Error("boom");
		});
		const shutdown = vi.fn(() => Promise.reject(new Error("boom")));
		const onError = vi.fn();
		const client = { init: boom, get_distinct_id: () => "x", identify: boom, capture: boom, shutdown };
		const sink = new PostHogBrowserSink({ key: "k", host: "h", client, onError });
		expect(() => {
			sink.identify("u", {});
			sink.capture("x", "e", {});
		}).not.toThrow();
		await expect(sink.shutdown()).resolves.toBeUndefined();
		expect(boom).toHaveBeenCalledTimes(3);
		expect(shutdown).toHaveBeenCalled();
		expect(onError.mock.calls.map((call) => call[1])).toEqual([
			"posthog.init",
			"posthog.identify",
			"posthog.capture",
			"posthog.shutdown",
		]);
	});
	it("uses the posthog-js singleton by default", () => {
		const sink = new PostHogBrowserSink({ key: "k", host: "h" });
		sink.capture("anon", "e", { a: 1 });
		const singleton = posthog as unknown as { init: unknown; capture: unknown };
		expect(singleton.init).toHaveBeenCalledWith(
			"k",
			expect.objectContaining({ api_host: "h", autocapture: false })
		);
		expect(singleton.capture).toHaveBeenCalledWith("e", { a: 1 });
	});
});
