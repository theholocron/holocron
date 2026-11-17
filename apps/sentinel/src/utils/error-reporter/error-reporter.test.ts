import type { ErrorSink } from "@theholocron/observability/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createErrorReporter } from "./error-reporter.js";

function fakeSink(overrides: Partial<ErrorSink> = {}): ErrorSink {
	return {
		init: vi.fn(),
		startSpan: vi.fn(),
		captureException: vi.fn(),
		endSession: vi.fn(),
		flush: vi.fn().mockResolvedValue(undefined),
		...overrides,
	};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createErrorReporter", () => {
	it("makes no sink for a delivery that raises no error, and flushes nothing", async () => {
		const makeSink = vi.fn(() => fakeSink());
		await createErrorReporter(makeSink).flush();
		expect(makeSink).not.toHaveBeenCalled();
	});

	it("reports an error to the sink, making it once for several errors", () => {
		const sink = fakeSink();
		const makeSink = vi.fn(() => sink);
		const reporter = createErrorReporter(makeSink);
		const first = new Error("one");
		const second = new Error("two");
		reporter.capture(first);
		reporter.capture(second);
		expect(makeSink).toHaveBeenCalledTimes(1);
		expect(sink.captureException).toHaveBeenNthCalledWith(1, first);
		expect(sink.captureException).toHaveBeenNthCalledWith(2, second);
	});

	it("flushes the sink, and makes a new one for an error after the flush", async () => {
		const first = fakeSink();
		const second = fakeSink();
		const sinks = [first, second];
		const makeSink = vi.fn(() => sinks.shift() as ErrorSink);
		const reporter = createErrorReporter(makeSink);
		const later = new Error("b");
		reporter.capture(new Error("a"));
		await reporter.flush();
		reporter.capture(later);
		expect(makeSink).toHaveBeenCalledTimes(2);
		expect(second.captureException).toHaveBeenCalledWith(later);
		expect(first.captureException).not.toHaveBeenCalledWith(later);
	});

	it("ends the session before it flushes", async () => {
		const sink = fakeSink();
		const reporter = createErrorReporter(() => sink);
		reporter.capture(new Error("a"));
		await reporter.flush();
		expect(sink.endSession).toHaveBeenCalledTimes(1);
		expect(vi.mocked(sink.endSession).mock.invocationCallOrder[0]).toBeLessThan(
			vi.mocked(sink.flush).mock.invocationCallOrder[0]!
		);
	});

	it("closes the sink only when the last of several overlapping deliveries finishes", async () => {
		const sink = fakeSink();
		const reporter = createErrorReporter(() => sink);
		reporter.begin();
		reporter.begin();
		reporter.capture(new Error("a"));
		await reporter.flush();
		expect(sink.flush).not.toHaveBeenCalled();
		reporter.capture(new Error("b"));
		await reporter.flush();
		expect(sink.flush).toHaveBeenCalledTimes(1);
		expect(sink.captureException).toHaveBeenCalledTimes(2);
	});

	it("calls the sink's flush", async () => {
		const sink = fakeSink();
		const reporter = createErrorReporter(() => sink);
		reporter.capture(new Error("a"));
		await reporter.flush();
		expect(sink.flush).toHaveBeenCalledTimes(1);
	});

	it("swallows a sink that cannot be made", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const reporter = createErrorReporter(() => {
			throw new Error("bad dsn");
		});
		expect(() => reporter.capture(new Error("a"))).not.toThrow();
		expect(spy).toHaveBeenCalled();
	});

	it("swallows a sink that throws on capture", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const reporter = createErrorReporter(() =>
			fakeSink({
				captureException: () => {
					throw new Error("boom");
				},
			})
		);
		expect(() => reporter.capture(new Error("a"))).not.toThrow();
		expect(spy).toHaveBeenCalled();
	});

	it("swallows a flush that rejects", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const reporter = createErrorReporter(() => fakeSink({ flush: vi.fn().mockRejectedValue(new Error("late")) }));
		reporter.capture(new Error("a"));
		await expect(reporter.flush()).resolves.toBeUndefined();
		expect(spy).toHaveBeenCalled();
	});
});
