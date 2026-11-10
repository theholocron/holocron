import { describe, expect, it, vi } from "vitest";

vi.mock("posthog-js", () => ({
	default: {
		init: vi.fn(),
		identify: vi.fn(),
		capture: vi.fn(),
		shutdown: vi.fn().mockResolvedValue(undefined),
	},
}));

import posthog from "posthog-js";

import { PostHogBrowserSink } from "./posthog-browser-sink.js";

function fakeClient() {
	return { init: vi.fn(), identify: vi.fn(), capture: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
}

describe("PostHogBrowserSink", () => {
	it("starts the client with the key and api_host", () => {
		const client = fakeClient();
		new PostHogBrowserSink({ key: "phc_fake", host: "https://eu.example.invalid", client });
		expect(client.init).toHaveBeenCalledWith("phc_fake", { api_host: "https://eu.example.invalid" });
	});
	it("forwards identify and capture (capture records for the current person)", () => {
		const client = fakeClient();
		const sink = new PostHogBrowserSink({ key: "k", host: "h", client });
		sink.identify("u1", { plan: "pro" });
		sink.capture("u1", "clicked", { where: "nav" });
		expect(client.identify).toHaveBeenCalledWith("u1", { plan: "pro" });
		expect(client.capture).toHaveBeenCalledWith("clicked", { where: "nav" });
	});
	it("shuts the client down", async () => {
		const client = fakeClient();
		await new PostHogBrowserSink({ key: "k", host: "h", client }).shutdown();
		expect(client.shutdown).toHaveBeenCalled();
	});
	it("never throws into the app", async () => {
		const boom = () => {
			throw new Error("boom");
		};
		const client = { init: boom, identify: boom, capture: boom, shutdown: () => Promise.reject(new Error("boom")) };
		const sink = new PostHogBrowserSink({ key: "k", host: "h", client });
		expect(() => {
			sink.identify("u", {});
			sink.capture("u", "e", {});
		}).not.toThrow();
		await expect(sink.shutdown()).resolves.toBeUndefined();
	});
	it("uses the posthog-js singleton by default", () => {
		const sink = new PostHogBrowserSink({ key: "k", host: "h" });
		sink.capture("u", "e", { a: 1 });
		const singleton = posthog as unknown as { init: unknown; capture: unknown };
		expect(singleton.init).toHaveBeenCalledWith("k", { api_host: "h" });
		expect(singleton.capture).toHaveBeenCalledWith("e", { a: 1 });
	});
});
