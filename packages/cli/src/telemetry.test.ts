import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub at the *sink* seam — no raw @sentry/node / posthog-node here. The sinks'
// own SDK wiring is covered by telemetry/{sentry,posthog}-sink.test.ts.
const { errorSink, analyticsSink, SentrySinkMock, PostHogSinkMock, resolveDsnMock, resolveKeyMock } = vi.hoisted(() => {
	const span = { setStatus: vi.fn(), end: vi.fn() };
	const errorSink = {
		init: vi.fn(),
		startSpan: vi.fn(() => span),
		captureException: vi.fn(),
		endSession: vi.fn(),
		flush: vi.fn().mockResolvedValue(undefined),
		__span: span,
	};
	const analyticsSink = {
		identify: vi.fn(),
		capture: vi.fn(),
		shutdown: vi.fn().mockResolvedValue(undefined),
	};
	return {
		errorSink,
		analyticsSink,
		SentrySinkMock: vi.fn(function SentrySink(this: Record<string, unknown>) {
			Object.assign(this, errorSink);
		}),
		PostHogSinkMock: vi.fn(function PostHogSink(this: Record<string, unknown>) {
			Object.assign(this, analyticsSink);
		}),
		resolveDsnMock: vi.fn(() => "https://x@o1.ingest.sentry.io/1"),
		resolveKeyMock: vi.fn(() => "phc_test_key"),
	};
});

vi.mock("./telemetry/sentry-sink.js", () => ({ SentrySink: SentrySinkMock, resolveDsn: resolveDsnMock }));
vi.mock("./telemetry/posthog-sink.js", () => ({ PostHogSink: PostHogSinkMock, resolvePostHogKey: resolveKeyMock }));

vi.mock("node:os", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:os")>();
	return { ...actual, hostname: vi.fn(actual.hostname), userInfo: vi.fn(actual.userInfo) };
});

import { userInfo } from "node:os";

import * as loggerMod from "./logger.js";
import { captureException, endSession, event, flush, init, resetTelemetry, startCommand } from "./telemetry.js";

const lastCapture = (): { 0: string; 1: string; 2: Record<string, unknown> } =>
	analyticsSink.capture.mock.calls.at(-1) as never;
const capturedEvents = (): string[] => analyticsSink.capture.mock.calls.map((c) => c[1] as string);

const originalEnv = process.env;

beforeEach(() => {
	process.env = {
		...originalEnv,
		NO_HOLOCRON_TELEMETRY: undefined,
		HOLOCRON_TELEMETRY: undefined,
		HOLOCRON_ORG: undefined,
		CI: undefined,
	};
	vi.clearAllMocks();
	resolveDsnMock.mockReturnValue("https://x@o1.ingest.sentry.io/1");
	resolveKeyMock.mockReturnValue("phc_test_key");
	resetTelemetry();
});
afterEach(() => {
	process.env = originalEnv;
	resetTelemetry();
});

// ── opt-out ──────────────────────────────────────────────────────────────────

describe.each([
	["NO_HOLOCRON_TELEMETRY", "1"],
	["HOLOCRON_TELEMETRY", "false"],
])("when %s=%s", (key, value) => {
	beforeEach(() => {
		process.env[key] = value;
	});

	it("init installs neither real sink", () => {
		init("1.0.0");
		expect(SentrySinkMock).not.toHaveBeenCalled();
		expect(PostHogSinkMock).not.toHaveBeenCalled();
	});

	it("startCommand / captureException / event are no-ops", () => {
		const finish = startCommand("setup");
		captureException(new Error("x"));
		event("sync_github_run", { repo: "x" });
		finish(false);
		expect(errorSink.startSpan).not.toHaveBeenCalled();
		expect(errorSink.captureException).not.toHaveBeenCalled();
		expect(analyticsSink.capture).not.toHaveBeenCalled();
	});

	it("flush resolves without touching a real sink", async () => {
		await expect(flush()).resolves.toBeUndefined();
		expect(errorSink.flush).not.toHaveBeenCalled();
	});
});

it("HOLOCRON_TELEMETRY set to anything but the exact string 'false' stays on", () => {
	process.env["HOLOCRON_TELEMETRY"] = "true";
	init("1.0.0");
	expect(SentrySinkMock).toHaveBeenCalled();
	expect(PostHogSinkMock).toHaveBeenCalled();
});

// ── init ─────────────────────────────────────────────────────────────────────

describe("init", () => {
	it("installs SentrySink with release + environment + os/node/ci tags", () => {
		init("1.2.3");
		expect(errorSink.init).toHaveBeenCalledWith({
			release: "holocron@1.2.3",
			environment: "local",
			tags: { os: process.platform, node: process.version, ci: "false" },
		});
	});

	it("uses environment 'ci' and ci tag 'true' under CI", () => {
		process.env["CI"] = "true";
		init("1.0.0");
		expect(errorSink.init).toHaveBeenCalledWith(
			expect.objectContaining({ environment: "ci", tags: expect.objectContaining({ ci: "true" }) })
		);
	});

	it("skips SentrySink when the resolved DSN is empty", () => {
		resolveDsnMock.mockReturnValue("");
		init("1.0.0");
		expect(SentrySinkMock).not.toHaveBeenCalled();
		expect(PostHogSinkMock).toHaveBeenCalled(); // independent
	});

	it("skips PostHogSink when the resolved key is empty", () => {
		resolveKeyMock.mockReturnValue("");
		init("1.0.0");
		expect(PostHogSinkMock).not.toHaveBeenCalled();
		expect(SentrySinkMock).toHaveBeenCalled();
	});

	it("identifies the machine with anonymous props — no raw hostname/username", () => {
		process.env["CI"] = "true";
		process.env["HOLOCRON_ORG"] = "theholocron";
		init("2.3.4");
		const [distinctId, props] = analyticsSink.identify.mock.calls[0]! as [string, Record<string, unknown>];
		expect(distinctId).toMatch(/^[0-9a-f]{32}$/);
		expect(props).toEqual(
			expect.objectContaining({ ci: true, os: process.platform, cli: "2.3.4", org: "theholocron" })
		);
		expect(JSON.stringify(props)).not.toContain(process.env["USER"] ?? "no-such-user");
	});

	it("falls back to a fixed distinctId when the machine identity can't be read", () => {
		vi.mocked(userInfo).mockImplementationOnce(() => {
			throw new Error("EPERM");
		});
		init("1.0.0");
		expect(analyticsSink.identify).toHaveBeenCalledWith("unknown", expect.anything());
	});
});

// ── command lifecycle ────────────────────────────────────────────────────────

describe("startCommand", () => {
	beforeEach(() => init("1.0.0"));

	it("opens a span and captures command_started", () => {
		startCommand("sync-github");
		expect(errorSink.startSpan).toHaveBeenCalledWith("sync-github");
		expect(lastCapture()[1]).toBe("command_started");
		expect(lastCapture()[2]).toEqual(expect.objectContaining({ command: "sync-github", ci: false }));
	});

	it("finish(true) → ok span status + command_completed with a duration", () => {
		startCommand("setup")(true);
		expect(errorSink.__span.setStatus).toHaveBeenCalledWith(true);
		expect(errorSink.__span.end).toHaveBeenCalled();
		expect(capturedEvents()).toEqual(["command_started", "command_completed"]);
		expect(lastCapture()[2]).toEqual(
			expect.objectContaining({ status: "ok", command: "setup", duration_ms: expect.any(Number) })
		);
	});

	it("finish(false) → error span status + command_failed with the error constructor name", () => {
		class AuthError extends Error {}
		const finish = startCommand("deploy");
		captureException(new AuthError("no token"));
		finish(false);
		expect(errorSink.__span.setStatus).toHaveBeenCalledWith(false);
		expect(lastCapture()[1]).toBe("command_failed");
		expect(lastCapture()[2]).toEqual(expect.objectContaining({ status: "fail", error_type: "AuthError" }));
	});

	it("error_type is 'Error' for a non-Error throw, omitted when nothing was captured", () => {
		const finish = startCommand("a");
		captureException("string failure");
		finish(false);
		expect(lastCapture()[2]).toEqual(expect.objectContaining({ error_type: "Error" }));

		vi.clearAllMocks();
		startCommand("b")(false);
		expect(lastCapture()[2]).not.toHaveProperty("error_type");
	});
});

describe("captureException", () => {
	it("forwards the error to the error sink", () => {
		init("1.0.0");
		const err = new Error("broke");
		captureException(err);
		expect(errorSink.captureException).toHaveBeenCalledWith(err);
	});
});

// ── event() ──────────────────────────────────────────────────────────────────

describe("event", () => {
	beforeEach(() => init("1.0.0"));

	it("merges base props and scrubs token-shaped values", () => {
		startCommand("sync-github");
		event("sync_github_run", { repo: "theholocron/.github", token: "ghp_abc123XYZ" }); // gitleaks:allow — fixture
		const props = lastCapture()[2];
		expect(props).toEqual(expect.objectContaining({ command: "sync-github", repo: "theholocron/.github" }));
		expect(JSON.stringify(props)).not.toContain("ghp_abc123XYZ");
		expect(JSON.stringify(props)).toContain("[REDACTED]");
	});

	it("is a no-op after resetTelemetry() (no sink)", () => {
		resetTelemetry();
		event("sync_github_run", { repo: "x" });
		expect(analyticsSink.capture).not.toHaveBeenCalled();
	});

	it("carries the logger's runId so events pivot to the Axiom trace", () => {
		const spy = vi.spyOn(loggerMod, "getRunId").mockReturnValue("11111111-2222-3333-4444-555555555555");
		event("sync_github_run", { repo: "x" });
		expect(lastCapture()[2]).toEqual(expect.objectContaining({ runId: "11111111-2222-3333-4444-555555555555" }));
		spy.mockRestore();
	});
});

// ── flush / endSession ───────────────────────────────────────────────────────

describe("flush / endSession", () => {
	it("flush awaits both sinks; endSession forwards", async () => {
		init("1.0.0");
		endSession();
		await flush();
		expect(errorSink.endSession).toHaveBeenCalled();
		expect(errorSink.flush).toHaveBeenCalled();
		expect(analyticsSink.shutdown).toHaveBeenCalled();
	});
});
