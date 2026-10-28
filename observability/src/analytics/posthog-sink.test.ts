import { beforeEach, describe, expect, it, vi } from "vitest";

const { captureMock, identifyMock, shutdownMock, PostHogMock } = vi.hoisted(() => {
	const captureMock = vi.fn();
	const identifyMock = vi.fn();
	const shutdownMock = vi.fn().mockResolvedValue(undefined);
	const PostHogMock = vi.fn(function PostHog(this: Record<string, unknown>) {
		this["capture"] = captureMock;
		this["identify"] = identifyMock;
		this["shutdown"] = shutdownMock;
	});
	return { captureMock, identifyMock, shutdownMock, PostHogMock };
});

vi.mock("posthog-node", () => ({ PostHog: PostHogMock }));

import { PostHogSink } from "./posthog-sink.js";

beforeEach(() => {
	vi.clearAllMocks();
});

const CONFIG = { key: "phc_test_key", host: "https://us.i.posthog.com" };

describe("PostHogSink", () => {
	it("constructs the client with the given key + host", () => {
		new PostHogSink({ key: "phc_x", host: "https://eu.i.posthog.com" });
		expect(PostHogMock).toHaveBeenCalledWith("phc_x", { host: "https://eu.i.posthog.com" });
	});
	it("identify() forwards distinctId + properties", () => {
		new PostHogSink(CONFIG).identify("abc123", { ci: true, os: "darwin" });
		expect(identifyMock).toHaveBeenCalledWith({ distinctId: "abc123", properties: { ci: true, os: "darwin" } });
	});
	it("capture() forwards distinctId + event + properties", () => {
		new PostHogSink(CONFIG).capture("abc123", "command_started", { command: "setup" });
		expect(captureMock).toHaveBeenCalledWith({
			distinctId: "abc123",
			event: "command_started",
			properties: { command: "setup" },
		});
	});
	it("shutdown() awaits the client", async () => {
		await new PostHogSink(CONFIG).shutdown();
		expect(shutdownMock).toHaveBeenCalled();
	});
});
