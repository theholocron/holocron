import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/vercel-edge", () => ({
	init: vi.fn(),
	setTag: vi.fn(),
	captureException: vi.fn(),
	startInactiveSpan: vi.fn(),
	flush: vi.fn().mockResolvedValue(true),
}));

import * as Sentry from "@sentry/vercel-edge";

import { SentryEdgeSink } from "./sentry-edge-sink.js";

describe("SentryEdgeSink", () => {
	it("calls @sentry/vercel-edge by default and tolerates its missing sessions", async () => {
		const sink = new SentryEdgeSink({ tracesSampleRate: 0 });
		sink.init({ dsn: "https://key@example.invalid/1", release: "r", environment: "production", tags: { k: "v" } });
		sink.endSession();
		sink.captureException(new Error("x"));
		await sink.flush();
		expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 0 }));
		expect(Sentry.setTag).toHaveBeenCalledWith("k", "v");
		expect(Sentry.captureException).toHaveBeenCalled();
		expect(Sentry.flush).toHaveBeenCalled();
	});
	it("calls the injected SDK instead", () => {
		const captureException = vi.fn();
		const sdk = { init: vi.fn(), setTag: vi.fn(), captureException, startInactiveSpan: vi.fn(), flush: vi.fn() };
		new SentryEdgeSink({ sdk }).captureException("e");
		expect(captureException).toHaveBeenCalledWith("e");
	});
});
