import { describe, expect, it, vi } from "vitest";

import { SentryReactNativeSink } from "./sentry-react-native-sink.js";

function fakeSdk() {
	return {
		init: vi.fn(),
		setTag: vi.fn(),
		captureException: vi.fn(),
		startInactiveSpan: vi.fn(() => ({ setStatus: vi.fn(), end: vi.fn() })),
		flush: vi.fn().mockResolvedValue(true),
		startSession: vi.fn(),
		endSession: vi.fn(),
	};
}

describe("SentryReactNativeSink", () => {
	it("initialises through the injected SDK and leaves sessions to the native layer", () => {
		const sdk = fakeSdk();
		const sink = new SentryReactNativeSink({ sdk, tracesSampleRate: 0.5 });
		sink.init({
			dsn: "https://key@example.invalid/1",
			release: "app@1",
			environment: "production",
			tags: { os: "ios" },
		});
		sink.endSession();
		expect(sdk.init).toHaveBeenCalledWith(
			expect.objectContaining({ tracesSampleRate: 0.5, environment: "production" })
		);
		expect(sdk.setTag).toHaveBeenCalledWith("os", "ios");
		expect(sdk.startSession).not.toHaveBeenCalled();
		expect(sdk.endSession).not.toHaveBeenCalled();
	});
	it("lets the caller turn JS sessions back on", () => {
		const sdk = fakeSdk();
		const sink = new SentryReactNativeSink({ sdk, sessions: true });
		sink.init({ dsn: "d", release: "r", environment: "e", tags: {} });
		sink.endSession();
		expect(sdk.startSession).toHaveBeenCalled();
		expect(sdk.endSession).toHaveBeenCalled();
	});
	it("captures, traces and flushes, and never throws into the app", async () => {
		const sdk = fakeSdk();
		const sink = new SentryReactNativeSink({ sdk });
		const err = new Error("x");
		sink.captureException(err);
		sink.startSpan("screen").end();
		await sink.flush();
		expect(sdk.captureException).toHaveBeenCalledWith(err);
		expect(sdk.flush).toHaveBeenCalledWith(2_000);

		const boom = () => {
			throw new Error("boom");
		};
		const broken = new SentryReactNativeSink({
			sdk: { ...fakeSdk(), captureException: boom, flush: () => Promise.reject(new Error("offline")) },
		});
		expect(() => broken.captureException(err)).not.toThrow();
		await expect(broken.flush()).resolves.toBeUndefined();
	});
});
