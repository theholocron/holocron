import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { PostHogSink, resolvePostHogHost, resolvePostHogKey } from "./posthog-sink.js";

const originalEnv = process.env;

beforeEach(() => {
	process.env = {
		...originalEnv,
		HOLOCRON_POSTHOG_PROJECT_TOKEN: undefined,
		POSTHOG_PROJECT_TOKEN: undefined,
		HOLOCRON_POSTHOG_HOST: undefined,
		POSTHOG_HOST: undefined,
	};
	vi.clearAllMocks();
});
afterEach(() => {
	process.env = originalEnv;
});

describe("resolvePostHogKey / resolvePostHogHost", () => {
	it("uses the built-in fallback key + US host by default", () => {
		expect(resolvePostHogKey()).toMatch(/^phc_/);
		expect(resolvePostHogHost()).toBe("https://us.i.posthog.com");
	});
	it("prefers POSTHOG_PROJECT_TOKEN, then HOLOCRON_POSTHOG_PROJECT_TOKEN", () => {
		process.env["POSTHOG_PROJECT_TOKEN"] = "phc_vendor";
		expect(resolvePostHogKey()).toBe("phc_vendor");
		process.env["HOLOCRON_POSTHOG_PROJECT_TOKEN"] = "phc_holocron";
		expect(resolvePostHogKey()).toBe("phc_holocron");
	});
	it("honours HOLOCRON_POSTHOG_HOST", () => {
		process.env["HOLOCRON_POSTHOG_HOST"] = "https://eu.i.posthog.com";
		expect(resolvePostHogHost()).toBe("https://eu.i.posthog.com");
	});
});

describe("PostHogSink", () => {
	it("constructs the client with the resolved key + host", () => {
		process.env["POSTHOG_PROJECT_TOKEN"] = "phc_test_key";
		new PostHogSink();
		expect(PostHogMock).toHaveBeenCalledWith("phc_test_key", { host: "https://us.i.posthog.com" });
	});
	it("identify() forwards distinctId + properties", () => {
		new PostHogSink().identify("abc123", { ci: true, os: "darwin" });
		expect(identifyMock).toHaveBeenCalledWith({ distinctId: "abc123", properties: { ci: true, os: "darwin" } });
	});
	it("capture() forwards distinctId + event + properties", () => {
		new PostHogSink().capture("abc123", "command_started", { command: "setup" });
		expect(captureMock).toHaveBeenCalledWith({
			distinctId: "abc123",
			event: "command_started",
			properties: { command: "setup" },
		});
	});
	it("shutdown() awaits the client", async () => {
		await new PostHogSink().shutdown();
		expect(shutdownMock).toHaveBeenCalled();
	});
});
