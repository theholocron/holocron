import { afterEach, describe, expect, it, vi } from "vitest";

import { PostHogFetchSink } from "./posthog-fetch-sink.js";

const TOKEN = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";
const HOST = "https://h.example.invalid";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

function body(call: unknown[]): Record<string, unknown> {
	return JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>;
}

function deferred() {
	let resolve: (value: unknown) => void = () => {};
	let reject: (reason: unknown) => void = () => {};
	const promise = new Promise<unknown>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Whether `promise` has settled yet, after the microtask queue drains. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
	let done = false;
	void promise.then(
		() => (done = true),
		() => (done = true)
	);
	await new Promise((resolve) => setTimeout(resolve, 0));
	return done;
}

describe("PostHogFetchSink requests", () => {
	it("posts a capture to <host>/capture/ with the key, event, person and properties", () => {
		const fetch = vi.fn().mockResolvedValue({ ok: true });
		new PostHogFetchSink({ key: "phc_fake", host: "https://us.example.invalid/", fetch }).capture("u1", "viewed", {
			page: "/",
		});
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0]![0]).toBe("https://us.example.invalid/capture/");
		expect((fetch.mock.calls[0]![1] as { method: string }).method).toBe("POST");
		expect(body(fetch.mock.calls[0]!)).toEqual({
			api_key: "phc_fake",
			event: "viewed",
			distinct_id: "u1",
			properties: { page: "/" },
		});
	});
	it("sends identify as a $identify event with $set", () => {
		const fetch = vi.fn().mockResolvedValue({ ok: true });
		new PostHogFetchSink({ key: "k", host: HOST, fetch }).identify("u1", { plan: "pro" });
		const sent = body(fetch.mock.calls[0]!);
		expect(sent).toMatchObject({ event: "$identify", properties: { $set: { plan: "pro" } } });
		expect(JSON.stringify(sent)).not.toContain("$anon_distinct_id");
	});
	it("sends the previous anonymous id as $anon_distinct_id so earlier events merge", () => {
		const fetch = vi.fn().mockResolvedValue({ ok: true });
		new PostHogFetchSink({ key: "k", host: HOST, fetch }).identify("u1", { plan: "pro" }, "anon-9");
		expect(body(fetch.mock.calls[0]!)).toMatchObject({
			distinct_id: "u1",
			properties: { $set: { plan: "pro" }, $anon_distinct_id: "anon-9" },
		});
	});
	it("scrubs token-shaped values in event and person properties", () => {
		const fetch = vi.fn().mockResolvedValue({ ok: true });
		const sink = new PostHogFetchSink({ key: "k", host: HOST, fetch });
		sink.capture("u", "e", { note: `key ${TOKEN}` });
		sink.identify("u", { secret: TOKEN });
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(JSON.stringify(fetch.mock.calls)).not.toContain(TOKEN);
	});
	it("uses the global fetch by default", () => {
		const fetch = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", fetch);
		new PostHogFetchSink({ key: "k", host: HOST }).capture("u", "e", {});
		expect(fetch).toHaveBeenCalledWith(`${HOST}/capture/`, expect.objectContaining({ method: "POST" }));
	});
});

describe("PostHogFetchSink waitUntil", () => {
	it("hands waitUntil a promise that stays pending until the fetch settles", async () => {
		const request = deferred();
		const fetch = vi.fn(() => request.promise);
		const waitUntil = vi.fn();
		new PostHogFetchSink({ key: "k", host: HOST, fetch, waitUntil }).capture("u", "e", {});
		expect(waitUntil).toHaveBeenCalledTimes(1);
		const handed = waitUntil.mock.calls[0]![0] as Promise<unknown>;
		expect(await settled(handed)).toBe(false);
		request.resolve({ ok: true });
		expect(await settled(handed)).toBe(true);
	});
});

describe("PostHogFetchSink errors", () => {
	it("reports an HTTP error status through onError and does not retry", async () => {
		const onError = vi.fn();
		const fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 });
		const sink = new PostHogFetchSink({ key: "k", host: HOST, fetch, onError });
		sink.capture("u", "e", {});
		await sink.shutdown();
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "PostHog responded 401" }),
			"posthog.fetch.response"
		);
	});
	it("does not report a 2xx response or a response without a status", async () => {
		const onError = vi.fn();
		const ok = new PostHogFetchSink({ key: "k", host: HOST, fetch: () => Promise.resolve({ ok: true }), onError });
		const bare = new PostHogFetchSink({ key: "k", host: HOST, fetch: () => Promise.resolve(undefined), onError });
		ok.capture("u", "e", {});
		bare.capture("u", "e", {});
		await Promise.all([ok.shutdown(), bare.shutdown()]);
		expect(onError).not.toHaveBeenCalled();
	});
	it("reports a rejected and a synchronously throwing fetch, and a throwing waitUntil, and never throws", async () => {
		const onError = vi.fn();
		const syncThrow = vi.fn(() => {
			throw new Error("sync");
		});
		const wait = vi.fn(() => {
			throw new Error("frozen");
		});
		const rejecting = new PostHogFetchSink({
			key: "k",
			host: HOST,
			fetch: () => Promise.reject(new Error("offline")),
			onError,
		});
		const throwing = new PostHogFetchSink({ key: "k", host: HOST, fetch: syncThrow, onError });
		const badWait = new PostHogFetchSink({
			key: "k",
			host: HOST,
			fetch: () => Promise.resolve({ ok: true }),
			waitUntil: wait,
			onError,
		});
		expect(() => {
			rejecting.capture("u", "e", {});
			throwing.capture("u", "e", {});
			badWait.identify("u", {});
		}).not.toThrow();
		await Promise.all([rejecting.shutdown(), throwing.shutdown(), badWait.shutdown()]);
		expect(syncThrow).toHaveBeenCalled();
		expect(wait).toHaveBeenCalled();
		expect(onError.mock.calls.map((call) => call[1]).sort()).toEqual([
			"posthog.fetch",
			"posthog.fetch.send",
			"posthog.fetch.waitUntil",
		]);
	});
	it("survives an onError that throws", async () => {
		const onError = vi.fn(() => {
			throw new Error("reporter broke");
		});
		const sink = new PostHogFetchSink({
			key: "k",
			host: HOST,
			fetch: () => Promise.reject(new Error("x")),
			onError,
		});
		sink.capture("u", "e", {});
		await expect(sink.shutdown()).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledTimes(1);
	});
});

describe("PostHogFetchSink timeouts", () => {
	it("aborts a request after requestTimeoutMs", async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		const onError = vi.fn();
		const fetch = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
			signal = init.signal;
			return new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
			});
		});
		const sink = new PostHogFetchSink({ key: "k", host: HOST, fetch, requestTimeoutMs: 100, onError });
		sink.capture("u", "e", {});
		expect(signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(100);
		expect(signal?.aborted).toBe(true);
		expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: "aborted" }), "posthog.fetch");
	});
	it("defaults the request timeout to 5000 ms", async () => {
		vi.useFakeTimers();
		let signal: AbortSignal | undefined;
		const fetch = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
			signal = init.signal;
			return new Promise(() => {});
		});
		new PostHogFetchSink({ key: "k", host: HOST, fetch }).capture("u", "e", {});
		await vi.advanceTimersByTimeAsync(4_999);
		expect(signal?.aborted).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		expect(signal?.aborted).toBe(true);
	});
});

describe("PostHogFetchSink shutdown", () => {
	it("resolves at once with nothing in flight", async () => {
		const sink = new PostHogFetchSink({ key: "k", host: HOST, fetch: () => Promise.resolve({ ok: true }) });
		await expect(sink.shutdown()).resolves.toBeUndefined();
	});
	it("waits for the requests in flight", async () => {
		const request = deferred();
		const sink = new PostHogFetchSink({ key: "k", host: HOST, fetch: () => request.promise });
		sink.capture("u", "e", {});
		const shutdown = sink.shutdown();
		expect(await settled(shutdown)).toBe(false);
		request.resolve({ ok: true });
		expect(await settled(shutdown)).toBe(true);
	});
	it("gives up after timeoutMs when a request stalls, and says so", async () => {
		vi.useFakeTimers();
		const onError = vi.fn();
		const sink = new PostHogFetchSink({
			key: "k",
			host: HOST,
			fetch: () => new Promise(() => {}),
			requestTimeoutMs: 60_000,
			onError,
		});
		sink.capture("u", "e", {});
		const shutdown = sink.shutdown(250);
		await vi.advanceTimersByTimeAsync(250);
		await expect(shutdown).resolves.toBeUndefined();
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "shutdown timed out" }),
			"posthog.fetch.shutdown"
		);
	});
	it("refuses events that start during shutdown and reports them, while still draining accepted ones", async () => {
		const first = deferred();
		const fetch = vi.fn(() => first.promise);
		const onError = vi.fn();
		const sink = new PostHogFetchSink({ key: "k", host: HOST, fetch, onError });
		sink.capture("u", "accepted", {});
		const shutdown = sink.shutdown();
		sink.capture("u", "late", {});
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({ message: 'dropped "late": the sink is shut down' }),
			"posthog.fetch.closed"
		);
		expect(await settled(shutdown)).toBe(false);
		first.resolve({ ok: true });
		expect(await settled(shutdown)).toBe(true);
	});
});
