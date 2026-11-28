import { describe, expect, it, vi } from "vitest";

vi.mock("@sentry/browser", () => ({
	init: vi.fn(),
	setTag: vi.fn(),
	captureException: vi.fn(),
	startInactiveSpan: vi.fn(),
	flush: vi.fn().mockResolvedValue(true),
	startSession: vi.fn(),
	endSession: vi.fn(),
}));

import * as Sentry from "@sentry/browser";

import { SentryBrowserSink } from "./sentry-browser-sink.js";

describe("SentryBrowserSink", () => {
	it("calls @sentry/browser by default", async () => {
		const sink = new SentryBrowserSink();
		sink.init({ dsn: "https://key@example.invalid/1", release: "r", environment: "local", tags: {} });
		sink.captureException(new Error("x"));
		await sink.flush();
		expect(Sentry.init).toHaveBeenCalled();
		expect(Sentry.captureException).toHaveBeenCalled();
		expect(Sentry.flush).toHaveBeenCalledWith(2_000);
	});
	it("calls the injected SDK instead", () => {
		const captureException = vi.fn();
		const sdk = {
			init: vi.fn(),
			setTag: vi.fn(),
			captureException,
			startInactiveSpan: vi.fn(),
			flush: vi.fn(),
		};
		new SentryBrowserSink({ sdk }).captureException("e");
		expect(captureException).toHaveBeenCalledWith("e");
	});
});
