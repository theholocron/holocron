import { describe, expect, it, vi } from "vitest";

import { PostHogReactNativeSink } from "./posthog-react-native-sink.js";

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"; // gitleaks:allow — fake fixture, only checked for redaction

function fakeClient(current = "u1", shutdown: () => Promise<void> = () => Promise.resolve()) {
	return {
		getDistinctId: vi.fn(() => current),
		identify: vi.fn(),
		capture: vi.fn(),
		shutdown: vi.fn(shutdown),
	};
}

describe("PostHogReactNativeSink", () => {
	it("forwards identify", () => {
		const client = fakeClient();
		new PostHogReactNativeSink({ client }).identify("u1", { plan: "pro" });
		expect(client.identify).toHaveBeenCalledWith("u1", { plan: "pro" });
	});
	it("captures for the current person without identifying", () => {
		const client = fakeClient("u1");
		new PostHogReactNativeSink({ client }).capture("u1", "opened", { screen: "home" });
		expect(client.identify).not.toHaveBeenCalled();
		expect(client.capture).toHaveBeenCalledWith("opened", { screen: "home" });
	});
	it("identifies the supplied person first when the client is on another one", () => {
		const client = fakeClient("someone-else");
		new PostHogReactNativeSink({ client }).capture("u2", "opened", {});
		expect(client.identify).toHaveBeenCalledWith("u2");
		expect(client.identify.mock.invocationCallOrder[0]).toBeLessThan(client.capture.mock.invocationCallOrder[0]!);
	});
	it("scrubs token-shaped values in event and person properties", () => {
		const client = fakeClient();
		const sink = new PostHogReactNativeSink({ client });
		sink.capture("u1", "e", { note: `key ${TOKEN}` });
		sink.identify("u1", { secret: TOKEN });
		expect(client.capture).toHaveBeenCalledWith("e", { note: "key [REDACTED]" });
		expect(client.identify).toHaveBeenCalledWith("u1", { secret: "[REDACTED]" });
	});
	it("shutdown stays pending until the client's shutdown resolves", async () => {
		let release: () => void = () => {};
		const client = fakeClient("u1", () => new Promise<void>((resolve) => (release = resolve)));
		let done = false;
		const pending = new PostHogReactNativeSink({ client }).shutdown().then(() => (done = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(client.shutdown).toHaveBeenCalled();
		expect(done).toBe(false);
		release();
		await pending;
		expect(done).toBe(true);
	});
	it("never throws into the app, and reports each error with its context", async () => {
		const boom = vi.fn(() => {
			throw new Error("boom");
		});
		const shutdown = vi.fn(() => Promise.reject(new Error("boom")));
		const onError = vi.fn();
		const sink = new PostHogReactNativeSink({
			client: { getDistinctId: () => "x", identify: boom, capture: boom, shutdown },
			onError,
		});
		expect(() => {
			sink.identify("u", {});
			sink.capture("x", "e", {});
		}).not.toThrow();
		await expect(sink.shutdown()).resolves.toBeUndefined();
		expect(boom).toHaveBeenCalledTimes(2);
		expect(shutdown).toHaveBeenCalled();
		expect(onError.mock.calls.map((call) => call[1])).toEqual([
			"posthog.identify",
			"posthog.capture",
			"posthog.shutdown",
		]);
	});
});
