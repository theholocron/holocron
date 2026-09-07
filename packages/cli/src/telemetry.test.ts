import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/node", () => ({
	init: vi.fn(),
	setTag: vi.fn(),
	startSession: vi.fn(),
	endSession: vi.fn(),
	startInactiveSpan: vi.fn(() => ({ setStatus: vi.fn(), end: vi.fn() })),
	captureException: vi.fn(),
	close: vi.fn().mockResolvedValue(undefined),
}));

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

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, hostname: vi.fn(actual.hostname), userInfo: vi.fn(actual.userInfo) };
});

import { userInfo } from "node:os";

import * as Sentry from "@sentry/node";

import * as loggerMod from "./logger.js";
import { captureException, endSession, event, flush, init, resetTelemetry, startCommand } from "./telemetry.js";

/** Latest properties object handed to `posthog.capture` for `event`. */
function lastCapture(): { distinctId: string; event: string; properties: Record<string, unknown> } {
	const calls = captureMock.mock.calls;
	return calls[calls.length - 1]?.[0] as ReturnType<typeof lastCapture>;
}

function capturedEvents(): string[] {
	return captureMock.mock.calls.map((c) => (c[0] as { event: string }).event);
}

type MockSpan = { setStatus: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

function lastSpan(): MockSpan {
	const results = vi.mocked(Sentry.startInactiveSpan).mock.results;
	return results[results.length - 1]?.value as MockSpan;
}

const originalEnv = process.env;

beforeEach(() => {
	process.env = {
		...originalEnv,
		NO_HOLOCRON_TELEMETRY: undefined,
		HOLOCRON_TELEMETRY: undefined,
		HOLOCRON_SENTRY_DSN: undefined,
		SENTRY_DSN: undefined,
		HOLOCRON_POSTHOG_PROJECT_TOKEN: undefined,
		POSTHOG_PROJECT_TOKEN: undefined,
		HOLOCRON_POSTHOG_HOST: undefined,
		POSTHOG_HOST: undefined,
		HOLOCRON_ORG: undefined,
		CI: undefined,
	};
	vi.clearAllMocks();
	resetTelemetry();
});

afterEach(() => {
	process.env = originalEnv;
	resetTelemetry();
});

// ── opt-out ──────────────────────────────────────────────────────────────────

describe("when NO_HOLOCRON_TELEMETRY is set", () => {
	beforeEach(() => {
		process.env["NO_HOLOCRON_TELEMETRY"] = "1";
		process.env["POSTHOG_PROJECT_TOKEN"] = "phc_explicit";
	});

	it("init: skips Sentry.init and PostHog", () => {
		init("1.0.0");
		expect(Sentry.init).not.toHaveBeenCalled();
		expect(PostHogMock).not.toHaveBeenCalled();
	});

	it("startCommand: returns a no-op and skips span + event", () => {
		const finish = startCommand("setup");
		expect(Sentry.startInactiveSpan).not.toHaveBeenCalled();
		expect(() => finish(true)).not.toThrow();
		expect(captureMock).not.toHaveBeenCalled();
	});

	it("captureException: skips Sentry.captureException", () => {
		captureException(new Error("boom"));
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});

	it("endSession: skips Sentry.endSession", () => {
		endSession();
		expect(Sentry.endSession).not.toHaveBeenCalled();
	});

	it("flush: skips Sentry.close", async () => {
		await flush();
		expect(Sentry.close).not.toHaveBeenCalled();
	});
});

describe("when HOLOCRON_TELEMETRY=false", () => {
	beforeEach(() => {
		process.env["HOLOCRON_TELEMETRY"] = "false";
		process.env["POSTHOG_PROJECT_TOKEN"] = "phc_explicit";
	});

	it("init: skips Sentry.init and PostHog", () => {
		init("1.0.0");
		expect(Sentry.init).not.toHaveBeenCalled();
		expect(PostHogMock).not.toHaveBeenCalled();
	});

	it("startCommand: returns a no-op and skips span + event", () => {
		const finish = startCommand("setup");
		expect(Sentry.startInactiveSpan).not.toHaveBeenCalled();
		expect(() => finish(true)).not.toThrow();
		expect(captureMock).not.toHaveBeenCalled();
	});

	it("captureException: skips Sentry.captureException", () => {
		captureException(new Error("boom"));
		expect(Sentry.captureException).not.toHaveBeenCalled();
	});
});

describe("when HOLOCRON_TELEMETRY is any other value", () => {
	it("init: still initialises Sentry (only the exact string 'false' opts out)", () => {
		process.env["HOLOCRON_TELEMETRY"] = "true";
		init("1.0.0");
		expect(Sentry.init).toHaveBeenCalled();
	});
});

// ── init ─────────────────────────────────────────────────────────────────────

describe("init", () => {
	it("calls Sentry.init with release and tracesSampleRate", () => {
		init("1.2.3");
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({
				release: "holocron@1.2.3",
				tracesSampleRate: 1.0,
			})
		);
	});

	it("sets environment to 'ci' when CI is set", () => {
		process.env["CI"] = "true";
		init("1.0.0");
		expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment: "ci" }));
	});

	it("sets environment to 'local' when CI is not set", () => {
		init("1.0.0");
		expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ environment: "local" }));
	});

	it("sets os, node, and ci tags", () => {
		init("1.0.0");
		expect(Sentry.setTag).toHaveBeenCalledWith("os", process.platform);
		expect(Sentry.setTag).toHaveBeenCalledWith("node", process.version);
		expect(Sentry.setTag).toHaveBeenCalledWith("ci", "false");
	});

	it("sets ci tag to 'true' when CI env is set", () => {
		process.env["CI"] = "true";
		init("1.0.0");
		expect(Sentry.setTag).toHaveBeenCalledWith("ci", "true");
	});

	it("calls Sentry.startSession after init", () => {
		init("1.0.0");
		expect(Sentry.startSession).toHaveBeenCalled();
	});

	it("uses the built-in fallback DSN when no env var is set", () => {
		init("1.0.0");
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({ dsn: expect.stringContaining("ingest.us.sentry.io") })
		);
	});

	it("prefers SENTRY_DSN over the fallback", () => {
		process.env["SENTRY_DSN"] = "https://vendor@o1.ingest.sentry.io/1";
		init("1.0.0");
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({ dsn: "https://vendor@o1.ingest.sentry.io/1" })
		);
	});

	it("prefers HOLOCRON_SENTRY_DSN over SENTRY_DSN", () => {
		process.env["HOLOCRON_SENTRY_DSN"] = "https://hlc@o2.ingest.sentry.io/2";
		process.env["SENTRY_DSN"] = "https://vendor@o1.ingest.sentry.io/1";
		init("1.0.0");
		expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://hlc@o2.ingest.sentry.io/2" }));
	});
});

// ── startCommand ─────────────────────────────────────────────────────────────

describe("startCommand", () => {
	it("starts a span with command name and op", () => {
		startCommand("setup");
		expect(Sentry.startInactiveSpan).toHaveBeenCalledWith(
			expect.objectContaining({ name: "setup", op: "holocron.command", forceTransaction: true })
		);
	});

	it("sets the command tag", () => {
		startCommand("deploy main");
		expect(Sentry.setTag).toHaveBeenCalledWith("command", "deploy main");
	});

	it("finish(true) sets ok status (code 1) and ends span", () => {
		const finish = startCommand("setup");
		finish(true);
		const span = lastSpan();
		expect(span.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(span.end).toHaveBeenCalled();
	});

	it("finish(false) sets error status (code 2) and ends span", () => {
		const finish = startCommand("setup");
		finish(false);
		const span = lastSpan();
		expect(span.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(span.end).toHaveBeenCalled();
	});
});

// ── captureException ─────────────────────────────────────────────────────────

describe("captureException", () => {
	it("forwards the error to Sentry", () => {
		const err = new Error("something broke");
		captureException(err);
		expect(Sentry.captureException).toHaveBeenCalledWith(err);
	});
});

// ── flush ────────────────────────────────────────────────────────────────────

describe("flush", () => {
	it("calls Sentry.close with a 2000ms timeout", async () => {
		await flush();
		expect(Sentry.close).toHaveBeenCalledWith(2_000);
	});
});

// ── endSession ───────────────────────────────────────────────────────────────

describe("endSession", () => {
	it("calls Sentry.endSession", () => {
		endSession();
		expect(Sentry.endSession).toHaveBeenCalled();
	});
});

// ── scrubError (via beforeSend) ───────────────────────────────────────────────

describe("scrubError", () => {
	function getBeforeSend() {
		init("1.0.0");
		const options = vi.mocked(Sentry.init).mock.calls[0]?.[0] as {
			beforeSend: (event: object, hint: object) => object;
		};
		return options.beforeSend;
	}

	it("redacts ghp_ tokens", () => {
		const scrub = getBeforeSend();
		const result = scrub({ message: "auth failed with ghp_abc123XYZ" }, {});
		expect(JSON.stringify(result)).not.toContain("ghp_abc123");
		expect(JSON.stringify(result)).toContain("[REDACTED]");
	});

	it("redacts SCREAMING_SNAKE_TOKEN= patterns", () => {
		const scrub = getBeforeSend();
		const result = scrub({ message: "GITHUB_TOKEN=ghs_secret456" }, {});
		expect(JSON.stringify(result)).not.toContain("ghs_secret456");
		expect(JSON.stringify(result)).toContain("[REDACTED]");
	});

	it("leaves non-token content intact", () => {
		const scrub = getBeforeSend();
		const result = scrub({ message: "config not found at ./holocron.config.ts" }, {});
		expect(JSON.stringify(result)).toContain("config not found");
	});
});

// ── PostHog (product analytics) ──────────────────────────────────────────────

describe("PostHog", () => {
	beforeEach(() => {
		process.env["POSTHOG_PROJECT_TOKEN"] = "phc_test_key";
	});

	describe("activation", () => {
		it("uses the built-in fallback key when nothing is set", () => {
			delete process.env["POSTHOG_PROJECT_TOKEN"];
			init("1.0.0");
			expect(PostHogMock).toHaveBeenCalledWith(expect.stringMatching(/^phc_/), {
				host: "https://us.i.posthog.com",
			});
		});

		it("initialises with POSTHOG_PROJECT_TOKEN and the default US host", () => {
			init("1.0.0");
			expect(PostHogMock).toHaveBeenCalledWith("phc_test_key", { host: "https://us.i.posthog.com" });
		});

		it("prefers HOLOCRON_POSTHOG_PROJECT_TOKEN over POSTHOG_PROJECT_TOKEN", () => {
			process.env["HOLOCRON_POSTHOG_PROJECT_TOKEN"] = "phc_holocron";
			init("1.0.0");
			expect(PostHogMock).toHaveBeenCalledWith("phc_holocron", expect.anything());
		});

		it("honours HOLOCRON_POSTHOG_HOST", () => {
			process.env["HOLOCRON_POSTHOG_HOST"] = "https://eu.i.posthog.com";
			init("1.0.0");
			expect(PostHogMock).toHaveBeenCalledWith(expect.any(String), { host: "https://eu.i.posthog.com" });
		});

		it("falls back to a fixed distinctId when the machine identity can't be read", () => {
			vi.mocked(userInfo).mockImplementationOnce(() => {
				throw new Error("EPERM");
			});
			init("1.0.0");
			expect(identifyMock).toHaveBeenCalledWith(expect.objectContaining({ distinctId: "unknown" }));
		});

		it("identifies the machine with anonymous person properties (no raw hostname/username)", () => {
			process.env["CI"] = "true";
			process.env["HOLOCRON_ORG"] = "theholocron";
			init("2.3.4");
			expect(identifyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					distinctId: expect.stringMatching(/^[0-9a-f]{32}$/),
					properties: expect.objectContaining({
						ci: true,
						os: process.platform,
						cli: "2.3.4",
						org: "theholocron",
					}),
				})
			);
			const { distinctId, properties } = identifyMock.mock.calls[0]![0] as {
				distinctId: string;
				properties: Record<string, unknown>;
			};
			expect(distinctId).not.toContain(process.env["USER"] ?? "no-such-user");
			expect(JSON.stringify(properties)).not.toContain(process.env["USER"] ?? "no-such-user");
		});
	});

	describe("command lifecycle events", () => {
		beforeEach(() => init("1.0.0"));

		it("captures command_started on startCommand", () => {
			startCommand("sync-github");
			expect(lastCapture()).toEqual(
				expect.objectContaining({
					event: "command_started",
					distinctId: expect.stringMatching(/^[0-9a-f]{32}$/),
					properties: expect.objectContaining({ command: "sync-github", ci: false }),
				})
			);
		});

		it("captures command_completed with a duration on finish(true)", () => {
			const finish = startCommand("setup");
			finish(true);
			expect(capturedEvents()).toEqual(["command_started", "command_completed"]);
			expect(lastCapture().properties).toEqual(
				expect.objectContaining({ status: "ok", command: "setup", duration_ms: expect.any(Number) })
			);
		});

		it("captures command_failed with the error constructor name on finish(false)", () => {
			class AuthError extends Error {}
			const finish = startCommand("deploy");
			captureException(new AuthError("no token"));
			finish(false);
			expect(lastCapture()).toEqual(
				expect.objectContaining({
					event: "command_failed",
					properties: expect.objectContaining({ status: "fail", error_type: "AuthError" }),
				})
			);
		});

		it("uses 'Error' as error_type for a non-Error throw", () => {
			const finish = startCommand("deploy");
			captureException("string failure");
			finish(false);
			expect(lastCapture().properties).toEqual(expect.objectContaining({ error_type: "Error" }));
		});

		it("omits error_type on failure when nothing was captured", () => {
			const finish = startCommand("deploy");
			finish(false);
			expect(lastCapture().properties).not.toHaveProperty("error_type");
		});
	});

	describe("event()", () => {
		beforeEach(() => init("1.0.0"));

		it("merges base props and scrubs token-shaped values from properties", () => {
			startCommand("sync-github");
			event("sync_github_run", { repo: "theholocron/.github", branch: "chore/sync", token: "ghp_abc123XYZ" }); // gitleaks:allow — fake fixture
			const { properties } = lastCapture();
			expect(properties).toEqual(
				expect.objectContaining({ command: "sync-github", repo: "theholocron/.github", branch: "chore/sync" })
			);
			expect(JSON.stringify(properties)).not.toContain("ghp_abc123XYZ");
			expect(JSON.stringify(properties)).toContain("[REDACTED]");
		});

		it("is a no-op when PostHog is not initialised", () => {
			resetTelemetry();
			event("sync_github_run", { repo: "x" });
			expect(captureMock).not.toHaveBeenCalled();
		});

		it("carries the logger's runId so events pivot to the Axiom trace", () => {
			const spy = vi.spyOn(loggerMod, "getRunId").mockReturnValue("11111111-2222-3333-4444-555555555555");
			event("sync_github_run", { repo: "x" });
			expect(lastCapture().properties).toEqual(
				expect.objectContaining({ runId: "11111111-2222-3333-4444-555555555555" })
			);
			spy.mockRestore();
		});
	});

	describe("flush", () => {
		it("awaits posthog.shutdown()", async () => {
			init("1.0.0");
			await flush();
			expect(shutdownMock).toHaveBeenCalled();
		});
	});
});
