import { describe, expect, it } from "vitest";

import { type AnalyticsSink, type ErrorSink, NoopAnalyticsSink, NoopErrorSink } from "./sinks.js";

describe("NoopErrorSink", () => {
	it("every method is a silent no-op and startSpan yields nothing", async () => {
		const sink: ErrorSink = new NoopErrorSink();
		expect(sink.startSpan("setup")).toBeUndefined();
		sink.init({ dsn: "", release: "app@1.0.0", environment: "local", tags: {} });
		sink.captureException(new Error("ignored"));
		sink.endSession();
		await expect(sink.flush()).resolves.toBeUndefined();
	});
});

describe("NoopAnalyticsSink", () => {
	it("every method is a silent no-op", async () => {
		const sink: AnalyticsSink = new NoopAnalyticsSink();
		sink.identify("abc", { ci: true });
		sink.capture("abc", "command_started", { command: "setup" });
		await expect(sink.shutdown()).resolves.toBeUndefined();
	});
});
