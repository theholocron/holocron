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

vi.mock("@theholocron/observability/errors", () => ({ SentrySink: SentrySinkMock }));
vi.mock("@theholocron/observability/analytics", () => ({ PostHogSink: PostHogSinkMock }));
vi.mock("../resolve-telemetry/resolve-telemetry.js", () => ({
	resolveDsn: resolveDsnMock,
	resolvePostHogKey: resolveKeyMock,
	resolvePostHogHost: vi.fn(() => "https://us.i.posthog.com"),
}));

import * as loggerMod from "../logger/index.js";
import {
	applyConfig,
	captureException,
	endSession,
	event,
	flush,
	init,
	resetTelemetry,
	startCommand,
} from "./telemetry.js";

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

describe("Holocron binding", () => {
	it("gates on HOLOCRON_TELEMETRY=false and the legacy NO_HOLOCRON_TELEMETRY", () => {
		process.env["HOLOCRON_TELEMETRY"] = "false";
		init("1.0.0");
		expect(SentrySinkMock).not.toHaveBeenCalled();
		process.env["HOLOCRON_TELEMETRY"] = undefined;
		process.env["NO_HOLOCRON_TELEMETRY"] = "1";
		init("1.0.0");
		expect(PostHogSinkMock).not.toHaveBeenCalled();
	});

	it("passes the resolved DSN, key and host, with a holocron@ release", () => {
		resolveDsnMock.mockReturnValue("https://key@o9.ingest.sentry.io/9");
		resolveKeyMock.mockReturnValue("phc_resolved");
		init("1.2.3");
		expect(errorSink.init).toHaveBeenCalledWith(
			expect.objectContaining({ dsn: "https://key@o9.ingest.sentry.io/9", release: "holocron@1.2.3" })
		);
		expect(PostHogSinkMock).toHaveBeenCalledWith({ key: "phc_resolved", host: "https://us.i.posthog.com" });
	});

	it("identifies with HOLOCRON_ORG", () => {
		process.env["HOLOCRON_ORG"] = "theholocron";
		init("1.0.0");
		expect(analyticsSink.identify.mock.calls[0]![1]).toEqual(expect.objectContaining({ org: "theholocron" }));
	});

	it("carries the logger's runId", () => {
		init("1.0.0");
		const spy = vi.spyOn(loggerMod, "getRunId").mockReturnValue("run-id-1");
		event("x");
		expect((analyticsSink.capture.mock.calls.at(-1) as never)[2]).toEqual(
			expect.objectContaining({ runId: "run-id-1" })
		);
		spy.mockRestore();
	});

	it("applyConfig and the rest are the bound functions", async () => {
		init("1.0.0");
		applyConfig({ enabled: false });
		expect(errorSink.flush).toHaveBeenCalled();
		await flush();
		startCommand("x")(true);
		captureException(new Error("x"));
		endSession();
		resetTelemetry();
	});
});
