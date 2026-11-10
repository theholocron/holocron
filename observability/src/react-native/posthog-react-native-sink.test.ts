import { describe, expect, it, vi } from "vitest";

import { PostHogReactNativeSink } from "./posthog-react-native-sink.js";

function fakeClient() {
	return { identify: vi.fn(), capture: vi.fn(), shutdown: vi.fn().mockResolvedValue(undefined) };
}

describe("PostHogReactNativeSink", () => {
	it("forwards identify and capture (capture records for the current person)", () => {
		const client = fakeClient();
		const sink = new PostHogReactNativeSink({ client });
		sink.identify("u1", { plan: "pro" });
		sink.capture("u1", "opened", { screen: "home" });
		expect(client.identify).toHaveBeenCalledWith("u1", { plan: "pro" });
		expect(client.capture).toHaveBeenCalledWith("opened", { screen: "home" });
	});
	it("shuts the client down", async () => {
		const client = fakeClient();
		await new PostHogReactNativeSink({ client }).shutdown();
		expect(client.shutdown).toHaveBeenCalled();
	});
	it("never throws into the app", async () => {
		const boom = () => {
			throw new Error("boom");
		};
		const sink = new PostHogReactNativeSink({
			client: { identify: boom, capture: boom, shutdown: () => Promise.reject(new Error("boom")) },
		});
		expect(() => {
			sink.identify("u", {});
			sink.capture("u", "e", {});
		}).not.toThrow();
		await expect(sink.shutdown()).resolves.toBeUndefined();
	});
});
