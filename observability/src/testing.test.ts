import { describe, expect, it } from "vitest";

import { fakeAnalyticsSink, fakeErrorSink, fakeLogger } from "./testing.js";

describe("fakeLogger", () => {
	it("every level method is a spy and records its call", () => {
		const log = fakeLogger();
		log.info({ repo: "holocron" }, "msg");
		log.debug("msg");
		log.warn("msg");
		log.error("msg");
		expect(log.info).toHaveBeenCalledWith({ repo: "holocron" }, "msg");
		expect(log.debug).toHaveBeenCalledWith("msg");
		expect(log.warn).toHaveBeenCalledWith("msg");
		expect(log.error).toHaveBeenCalledWith("msg");
	});

	it("child() is a spy that returns the same fake, so nested bindings are still assertable", () => {
		const log = fakeLogger();
		const child = log.child({ module: "sync" });
		expect(log.child).toHaveBeenCalledWith({ module: "sync" });
		expect(child).toBe(log);
		child.info("from the child");
		expect(log.info).toHaveBeenCalledWith("from the child");
	});
});

describe("fakeErrorSink", () => {
	it("every method is a spy; flush() resolves", async () => {
		const errors = fakeErrorSink();
		errors.init({ dsn: "", release: "app@1.0.0", environment: "local", tags: {} });
		errors.captureException(new Error("boom"));
		errors.endSession();
		expect(errors.init).toHaveBeenCalled();
		expect(errors.captureException).toHaveBeenCalledWith(expect.any(Error));
		expect(errors.endSession).toHaveBeenCalled();
		await expect(errors.flush()).resolves.toBeUndefined();
	});

	it("startSpan() returns the same spy span across calls, so its methods are assertable", () => {
		const errors = fakeErrorSink();
		const spanA = errors.startSpan("setup");
		const spanB = errors.startSpan("deploy");
		expect(spanA).toBe(spanB);
		spanA.setStatus(true);
		spanA.end();
		expect(spanA.setStatus).toHaveBeenCalledWith(true);
		expect(spanA.end).toHaveBeenCalled();
	});
});

describe("fakeAnalyticsSink", () => {
	it("every method is a spy; shutdown() resolves", async () => {
		const analytics = fakeAnalyticsSink();
		analytics.identify("abc123", { ci: true });
		analytics.capture("abc123", "command_started", { command: "setup" });
		expect(analytics.identify).toHaveBeenCalledWith("abc123", { ci: true });
		expect(analytics.capture).toHaveBeenCalledWith("abc123", "command_started", { command: "setup" });
		await expect(analytics.shutdown()).resolves.toBeUndefined();
	});
});
