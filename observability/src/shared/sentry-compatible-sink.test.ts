import { describe, expect, it, vi } from "vitest";

import { scrubEvent, SentryCompatibleSink, type SentrySdkLike } from "./sentry-compatible-sink.js";

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

function fakeSdk(overrides: Partial<SentrySdkLike> = {}) {
	const span = { setStatus: vi.fn(), end: vi.fn() };
	const sdk = {
		init: vi.fn(),
		setTag: vi.fn(),
		captureException: vi.fn(),
		startInactiveSpan: vi.fn(() => span),
		flush: vi.fn().mockResolvedValue(true),
		startSession: vi.fn(),
		endSession: vi.fn(),
		...overrides,
	};
	return { sdk, span };
}

const boom = vi.fn(() => {
	throw new Error("boom");
});

const CTX = {
	dsn: "https://key@example.invalid/1",
	release: "app@1",
	environment: "production",
	tags: { a: "1", b: "2" },
};

describe("SentryCompatibleSink.init", () => {
	it("initialises with the context, the default sample rate and scrubbing hooks for errors and transactions", () => {
		const { sdk } = fakeSdk();
		new SentryCompatibleSink(sdk).init(CTX);
		expect(sdk.init).toHaveBeenCalledWith({
			dsn: CTX.dsn,
			release: "app@1",
			environment: "production",
			tracesSampleRate: 0.1,
			beforeSend: scrubEvent,
			beforeSendTransaction: scrubEvent,
		});
	});
	it("uses the sample rate option, starts a session and sets every tag", () => {
		const { sdk } = fakeSdk();
		new SentryCompatibleSink(sdk, { tracesSampleRate: 1 }).init(CTX);
		expect(sdk.init).toHaveBeenCalledWith(expect.objectContaining({ tracesSampleRate: 1 }));
		expect(sdk.startSession).toHaveBeenCalled();
		expect(sdk.setTag).toHaveBeenCalledWith("a", "1");
		expect(sdk.setTag).toHaveBeenCalledWith("b", "2");
	});
	it("scrubs token-shaped tag values", () => {
		const { sdk } = fakeSdk();
		new SentryCompatibleSink(sdk).init({ ...CTX, tags: { build: TOKEN } });
		expect(sdk.setTag).toHaveBeenCalledWith("build", "[REDACTED]");
	});
	it("leaves sessions alone when sessions is false", () => {
		const { sdk } = fakeSdk();
		const sink = new SentryCompatibleSink(sdk, { sessions: false });
		sink.init(CTX);
		sink.endSession();
		expect(sdk.init).toHaveBeenCalled();
		expect(sdk.startSession).not.toHaveBeenCalled();
		expect(sdk.endSession).not.toHaveBeenCalled();
	});
	it("copes with an SDK that has no sessions", () => {
		const { sdk } = fakeSdk({ startSession: undefined, endSession: undefined });
		const sink = new SentryCompatibleSink(sdk);
		expect(() => {
			sink.init(CTX);
			sink.endSession();
		}).not.toThrow();
		expect(sdk.init).toHaveBeenCalled();
	});
	it("swallows SDK throws and reports each with its context", () => {
		boom.mockClear();
		const onError = vi.fn();
		const { sdk } = fakeSdk({ init: boom, startSession: boom, setTag: boom });
		expect(() => new SentryCompatibleSink(sdk, { onError }).init(CTX)).not.toThrow();
		expect(boom).toHaveBeenCalledTimes(4);
		const contexts = onError.mock.calls.map((call) => call[1] as string);
		expect(contexts).toEqual(["sentry.init", "sentry.startSession", "sentry.setTag", "sentry.setTag"]);
	});
});

describe("scrubEvent", () => {
	it("redacts token-shaped strings in an event", () => {
		const out = scrubEvent({ message: `token ${TOKEN}` });
		expect(JSON.stringify(out)).not.toContain(TOKEN);
	});
});

describe("SentryCompatibleSink spans", () => {
	it("starts a forced-transaction span with the Node sink's op and tags the command", () => {
		const { sdk } = fakeSdk();
		new SentryCompatibleSink(sdk).startSpan("checkout");
		expect(sdk.setTag).toHaveBeenCalledWith("command", "checkout");
		expect(sdk.startInactiveSpan).toHaveBeenCalledWith({
			name: "checkout",
			op: "holocron.command",
			forceTransaction: true,
		});
	});
	it("scrubs a token in the span name and the command tag", () => {
		const { sdk } = fakeSdk();
		new SentryCompatibleSink(sdk).startSpan(`deploy ${TOKEN}`);
		expect(sdk.setTag).toHaveBeenCalledWith("command", "deploy [REDACTED]");
		expect(sdk.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ name: "deploy [REDACTED]" }));
	});
	it("honours spanOp and maps status to Sentry codes", () => {
		const { sdk, span } = fakeSdk();
		const s = new SentryCompatibleSink(sdk, { spanOp: "ui.action" }).startSpan("x");
		s.setStatus(true);
		s.setStatus(false);
		s.end();
		expect(sdk.startInactiveSpan).toHaveBeenCalledWith(expect.objectContaining({ op: "ui.action" }));
		expect(span.setStatus).toHaveBeenNthCalledWith(1, { code: 1 });
		expect(span.setStatus).toHaveBeenNthCalledWith(2, { code: 2 });
		expect(span.end).toHaveBeenCalled();
	});
	it("returns a span that does nothing when the SDK cannot start one", () => {
		boom.mockClear();
		const onError = vi.fn();
		const { sdk } = fakeSdk({ startInactiveSpan: boom });
		const s = new SentryCompatibleSink(sdk, { onError }).startSpan("x");
		expect(boom).toHaveBeenCalled();
		expect(() => {
			s.setStatus(true);
			s.end();
		}).not.toThrow();
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "sentry.startInactiveSpan");
	});
	it("swallows throws from the span methods and reports them", () => {
		boom.mockClear();
		const onError = vi.fn();
		const { sdk } = fakeSdk({ startInactiveSpan: () => ({ setStatus: boom, end: boom }) });
		const s = new SentryCompatibleSink(sdk, { onError }).startSpan("x");
		expect(() => {
			s.setStatus(false);
			s.end();
		}).not.toThrow();
		expect(boom).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "sentry.span.setStatus");
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "sentry.span.end");
	});
});

describe("SentryCompatibleSink capture, session and flush", () => {
	it("forwards captureException and endSession", () => {
		const { sdk } = fakeSdk();
		const sink = new SentryCompatibleSink(sdk);
		const err = new Error("x");
		sink.captureException(err);
		sink.endSession();
		expect(sdk.captureException).toHaveBeenCalledWith(err);
		expect(sdk.endSession).toHaveBeenCalled();
	});
	it("swallows SDK throws and reports them", () => {
		boom.mockClear();
		const onError = vi.fn();
		const { sdk } = fakeSdk({ captureException: boom, endSession: boom });
		const sink = new SentryCompatibleSink(sdk, { onError });
		expect(() => {
			sink.captureException(new Error("x"));
			sink.endSession();
		}).not.toThrow();
		expect(boom).toHaveBeenCalledTimes(2);
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "sentry.captureException");
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "sentry.endSession");
	});
	it("flushes with the timeout, default and custom", async () => {
		const a = fakeSdk();
		await new SentryCompatibleSink(a.sdk).flush();
		expect(a.sdk.flush).toHaveBeenCalledWith(2_000);
		const b = fakeSdk();
		await new SentryCompatibleSink(b.sdk, { flushTimeoutMs: 50 }).flush();
		expect(b.sdk.flush).toHaveBeenCalledWith(50);
	});
	it("resolves when flush rejects and reports it", async () => {
		const onError = vi.fn();
		const flush = vi.fn(() => Promise.reject(new Error("offline")));
		const { sdk } = fakeSdk({ flush });
		await expect(new SentryCompatibleSink(sdk, { onError }).flush()).resolves.toBeUndefined();
		expect(flush).toHaveBeenCalled();
		expect(onError).toHaveBeenCalledWith(expect.any(Error), "sentry.flush");
	});
});
