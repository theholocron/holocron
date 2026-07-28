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

import * as Sentry from "@sentry/node";

import { captureException, endSession, flush, init, startCommand } from "../telemetry.js";

type MockSpan = { setStatus: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };

function lastSpan(): MockSpan {
	const results = vi.mocked(Sentry.startInactiveSpan).mock.results;
	return results[results.length - 1]?.value as MockSpan;
}

const originalEnv = process.env;

beforeEach(() => {
	process.env = { ...originalEnv, NO_HOLOCRON_TELEMETRY: undefined, CI: undefined };
	vi.clearAllMocks();
});

afterEach(() => {
	process.env = originalEnv;
});

// ── opt-out ──────────────────────────────────────────────────────────────────

describe("when NO_HOLOCRON_TELEMETRY is set", () => {
	beforeEach(() => {
		process.env["NO_HOLOCRON_TELEMETRY"] = "1";
	});

	it("init: skips Sentry.init", () => {
		init("1.0.0");
		expect(Sentry.init).not.toHaveBeenCalled();
	});

	it("startCommand: returns a no-op and skips span creation", () => {
		const finish = startCommand("setup");
		expect(Sentry.startInactiveSpan).not.toHaveBeenCalled();
		expect(() => finish(true)).not.toThrow();
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
