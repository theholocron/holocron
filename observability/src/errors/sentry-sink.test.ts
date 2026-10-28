import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { scrubError, SentrySink } from "./sentry-sink.js";

beforeEach(() => {
	vi.clearAllMocks();
});

const CTX = {
	dsn: "https://key@o0.ingest.us.sentry.io/0",
	release: "app@1.2.3",
	environment: "local" as const,
	tags: { os: "darwin", node: "v22", ci: "false" },
};

describe("SentrySink.init", () => {
	it("passes the resolved dsn, release, environment, tracesSampleRate and beforeSend", () => {
		new SentrySink().init(CTX);
		expect(Sentry.init).toHaveBeenCalledWith(
			expect.objectContaining({
				dsn: "https://key@o0.ingest.us.sentry.io/0",
				release: "app@1.2.3",
				environment: "local",
				tracesSampleRate: 1.0,
				beforeSend: scrubError,
			})
		);
	});
	it("starts a session and applies every tag", () => {
		new SentrySink().init(CTX);
		expect(Sentry.startSession).toHaveBeenCalled();
		expect(Sentry.setTag).toHaveBeenCalledWith("os", "darwin");
		expect(Sentry.setTag).toHaveBeenCalledWith("node", "v22");
		expect(Sentry.setTag).toHaveBeenCalledWith("ci", "false");
	});
});

describe("SentrySink.startSpan", () => {
	it("starts a command span and sets the command tag", () => {
		new SentrySink().startSpan("deploy main");
		expect(Sentry.setTag).toHaveBeenCalledWith("command", "deploy main");
		expect(Sentry.startInactiveSpan).toHaveBeenCalledWith(
			expect.objectContaining({ name: "deploy main", op: "holocron.command", forceTransaction: true })
		);
	});
	it("maps setStatus(true|false) to Sentry span codes and ends the span", () => {
		const span = new SentrySink().startSpan("setup")!;
		const inner = vi.mocked(Sentry.startInactiveSpan).mock.results[0]!.value as {
			setStatus: ReturnType<typeof vi.fn>;
			end: ReturnType<typeof vi.fn>;
		};
		span.setStatus(true);
		span.setStatus(false);
		span.end();
		expect(inner.setStatus).toHaveBeenCalledWith({ code: 1 });
		expect(inner.setStatus).toHaveBeenCalledWith({ code: 2 });
		expect(inner.end).toHaveBeenCalled();
	});
});

describe("SentrySink — captureException / endSession / flush", () => {
	it("forwards the error", () => {
		const err = new Error("broke");
		new SentrySink().captureException(err);
		expect(Sentry.captureException).toHaveBeenCalledWith(err);
	});
	it("ends the session", () => {
		new SentrySink().endSession();
		expect(Sentry.endSession).toHaveBeenCalled();
	});
	it("flushes with a 2000ms timeout", async () => {
		await new SentrySink().flush();
		expect(Sentry.close).toHaveBeenCalledWith(2_000);
	});
});

describe("scrubError", () => {
	it("redacts ghp_ tokens", () => {
		const out = scrubError({ message: "auth failed with ghp_abc123XYZ" } as never, {} as never); // gitleaks:allow — fixture
		expect(JSON.stringify(out)).not.toContain("ghp_abc123");
		expect(JSON.stringify(out)).toContain("[REDACTED]");
	});
	it("redacts SCREAMING_SNAKE_TOKEN= patterns", () => {
		const out = scrubError({ message: "GITHUB_TOKEN=ghs_secret456" } as never, {} as never); // gitleaks:allow — fixture
		expect(JSON.stringify(out)).not.toContain("ghs_secret456");
	});
	it("leaves non-token content intact", () => {
		const out = scrubError({ message: "config not found at ./holocron.config.ts" } as never, {} as never);
		expect(JSON.stringify(out)).toContain("config not found");
	});
});
