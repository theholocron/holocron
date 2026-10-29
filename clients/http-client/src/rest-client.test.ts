import { describe, expect, it, vi } from "vitest";

import { ProviderApiError } from "./errors.js";
import { createRestClient } from "./rest-client.js";
import { onRetry, type RetryEvent } from "./retry-events.js";

function stubFetch(responses: Array<{ status?: number; body?: unknown; text?: string }>) {
	const calls: Array<{
		url: string;
		method: string;
		headers: Record<string, string>;
		body: unknown;
	}> = [];
	let i = 0;
	const mock = vi.fn(async (input: string | URL, init?: RequestInit) => {
		const url = typeof input === "string" ? input : input.toString();
		const body = typeof init?.body === "string" ? JSON.parse(init.body) : (init?.body ?? null);
		calls.push({
			url,
			method: (init?.method ?? "GET").toUpperCase(),
			headers: (init?.headers as Record<string, string>) ?? {},
			body,
		});
		const next = responses[i++] ?? { status: 200, body: {} };
		const status = next.status ?? 200;
		if (status === 204) return new Response(null, { status });
		const text = next.text ?? JSON.stringify(next.body ?? {});
		return new Response(text, { status });
	});
	return { fetch: mock as unknown as typeof fetch, calls };
}

const TOKEN = "test-token";

describe("createRestClient — bearer auth", () => {
	it("sends Authorization: Bearer header", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
	});

	it("sets accept: application/json by default", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers.accept).toBe("application/json");
	});
});

describe("createRestClient — apikey tokenScheme", () => {
	it("sends token in custom header instead of Authorization", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			tokenScheme: "apikey",
			apiKeyHeader: "x-api-key",
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers["x-api-key"]).toBe(TOKEN);
		expect(calls[0]?.headers.authorization).toBeUndefined();
	});
});

describe("createRestClient — basic tokenScheme", () => {
	it("sends token as Authorization: Basic", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: "dXNlcjpwYXNz",
			tokenScheme: "basic",
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers.authorization).toBe("Basic dXNlcjpwYXNz");
	});
});

describe("createRestClient — extraHeaders", () => {
	it("can override default accept header", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.github.com",
			token: TOKEN,
			extraHeaders: {
				accept: "application/vnd.github+json",
				"x-github-api-version": "2022-11-28",
			},
			fetch,
		}).request("/user");
		expect(calls[0]?.headers.accept).toBe("application/vnd.github+json");
		expect(calls[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
	});
});

describe("createRestClient — defaultQuery", () => {
	it("appends to every request URL", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.vercel.com",
			token: TOKEN,
			defaultQuery: { teamId: "team_abc" },
			fetch,
		}).request("/projects");
		expect(calls[0]?.url).toBe("https://api.vercel.com/projects?teamId=team_abc");
	});
});

describe("createRestClient — 204 / no-content", () => {
	it("returns undefined for 204", async () => {
		const { fetch } = stubFetch([{ status: 204 }]);
		const result = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/del");
		expect(result).toBeUndefined();
	});

	it("returns undefined when expectNoContent is set", async () => {
		const { fetch } = stubFetch([{ status: 200 }]);
		const result = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/put", { expectNoContent: true });
		expect(result).toBeUndefined();
	});
});

describe("createRestClient — error handling", () => {
	it("throws ProviderApiError with status on non-2xx", async () => {
		const { fetch } = stubFetch([{ status: 401, text: "unauthorized" }]);
		const err = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			vendor: "Example",
			fetch,
		})
			.request("/user")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(401);
		expect((err as ProviderApiError).message).toContain("Example GET /user → 401");
	});

	it("wraps transport failure as ProviderApiError with status 0", async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof globalThis.fetch;
		const err = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			vendor: "Example",
			fetch,
		})
			.request("/ping")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(0);
		expect((err as ProviderApiError).message).toContain("Example GET /ping failed");
	});

	it("trims trailing slashes from baseUrl", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com///",
			token: TOKEN,
			fetch,
		}).request("/foo");
		expect(calls[0]?.url).toBe("https://api.example.com/foo");
	});
});

describe("createRestClient — path without leading slash", () => {
	it("prepends slash to path that doesn't start with /", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("no-slash");
		expect(calls[0]?.url).toBe("https://api.example.com/no-slash");
	});
});

describe("createRestClient — per-request query params", () => {
	it("merges opts.query with defaultQuery", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			defaultQuery: { global: "1" },
			fetch,
		}).request("/path", { query: { local: "2" } });
		expect(calls[0]?.url).toContain("global=1");
		expect(calls[0]?.url).toContain("local=2");
	});
});

describe("createRestClient — empty body response", () => {
	it("returns undefined for 200 with empty text body", async () => {
		const { fetch } = stubFetch([{ text: "" }]);
		const result = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		}).request("/empty");
		expect(result).toBeUndefined();
	});
});

describe("createRestClient — non-Error thrown by fetch", () => {
	it("wraps a string thrown by fetch as ProviderApiError", async () => {
		const fetch = vi.fn(async () => {
			throw "network gone";
		}) as unknown as typeof globalThis.fetch;
		const err = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		})
			.request("/ping")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).message).toContain("network gone");
	});
});

describe("createRestClient — logger seam", () => {
	it("logs a debug line for the request and the response when a logger is provided", async () => {
		const { fetch } = stubFetch([{ body: {} }]);
		const logger = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			child: vi.fn(),
			flush: vi.fn(),
		};
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			vendor: "Example",
			fetch,
			logger,
		}).request("/ping");
		expect(logger.debug).toHaveBeenCalledWith({ vendor: "Example", method: "GET", path: "/ping" }, "request");
		expect(logger.debug).toHaveBeenCalledWith(
			{ vendor: "Example", method: "GET", path: "/ping", status: 200 },
			"response"
		);
	});

	it("does not throw when no logger is provided — the default is a silent no-op", async () => {
		const { fetch } = stubFetch([{ body: {} }]);
		await expect(
			createRestClient({
				baseUrl: "https://api.example.com",
				token: TOKEN,
				fetch,
			}).request("/ping")
		).resolves.toBeDefined();
	});
});

describe("createRestClient — errors seam", () => {
	it("reports a transport failure to the ErrorSink", async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError("fetch failed");
		}) as unknown as typeof globalThis.fetch;
		const errors = {
			init: vi.fn(),
			startSpan: vi.fn(),
			captureException: vi.fn(),
			endSession: vi.fn(),
			flush: vi.fn(),
		};
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
			errors,
		})
			.request("/ping")
			.catch(() => {});
		expect(errors.captureException).toHaveBeenCalledWith(expect.any(ProviderApiError));
		expect((errors.captureException.mock.calls[0]?.[0] as ProviderApiError).status).toBe(0);
	});

	it("reports an unexpected 5xx to the ErrorSink", async () => {
		const { fetch } = stubFetch([{ status: 503, text: "unavailable" }]);
		const errors = {
			init: vi.fn(),
			startSpan: vi.fn(),
			captureException: vi.fn(),
			endSession: vi.fn(),
			flush: vi.fn(),
		};
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
			errors,
		})
			.request("/ping")
			.catch(() => {});
		expect(errors.captureException).toHaveBeenCalledTimes(1);
		expect((errors.captureException.mock.calls[0]?.[0] as ProviderApiError).status).toBe(503);
	});

	it("does NOT report an expected 4xx to the ErrorSink", async () => {
		const { fetch } = stubFetch([{ status: 404, text: "not found" }]);
		const errors = {
			init: vi.fn(),
			startSpan: vi.fn(),
			captureException: vi.fn(),
			endSession: vi.fn(),
			flush: vi.fn(),
		};
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
			errors,
		})
			.request("/ping")
			.catch(() => {});
		expect(errors.captureException).not.toHaveBeenCalled();
	});

	it("does not throw when no ErrorSink is provided — the default is a silent no-op", async () => {
		const { fetch } = stubFetch([{ status: 500 }]);
		const err = await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			fetch,
		})
			.request("/ping")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
	});
});

describe("createRestClient — apikey with default header name", () => {
	it("uses x-api-key when apiKeyHeader is not specified", async () => {
		const { fetch, calls } = stubFetch([{ body: {} }]);
		await createRestClient({
			baseUrl: "https://api.example.com",
			token: TOKEN,
			tokenScheme: "apikey",
			fetch,
		}).request("/ping");
		expect(calls[0]?.headers["x-api-key"]).toBe(TOKEN);
	});
});

describe("createRestClient — transport retries", () => {
	const failing = (code: string) => Object.assign(new TypeError("fetch failed"), { cause: { code } });
	const flaky = (failures: unknown[]) => {
		let calls = 0;
		const fetch = vi.fn(async () => {
			if (calls < failures.length) throw failures[calls++];
			calls++;
			return new Response("{}", { status: 200 });
		});
		return {
			fetch: fetch as unknown as typeof globalThis.fetch,
			count: () => fetch.mock.calls.length,
		};
	};
	const client = (f: typeof globalThis.fetch, extra: { retries?: number } = {}) =>
		createRestClient({
			baseUrl: "https://api.test",
			token: "t",
			vendor: "Test",
			fetch: f,
			retryDelayMs: 0,
			...extra,
		});

	it("sends a request again after a connect timeout and succeeds", async () => {
		const f = flaky([failing("UND_ERR_CONNECT_TIMEOUT")]);
		await expect(client(f.fetch).request("/x")).resolves.toEqual({});
		expect(f.count()).toBe(2);
	});

	it("repeats a write that never left, but not one that may have arrived", async () => {
		const never = flaky([failing("ENOTFOUND")]);
		await client(never.fetch).request("/x", { method: "POST", body: {} });
		expect(never.count()).toBe(2);
		const dropped = flaky([failing("ECONNRESET")]);
		await expect(client(dropped.fetch).request("/x", { method: "POST", body: {} })).rejects.toThrow(/ECONNRESET/);
		expect(dropped.count()).toBe(1);
	});

	it("repeats a read whose connection dropped", async () => {
		const f = flaky([failing("ECONNRESET")]);
		await client(f.fetch).request("/x");
		expect(f.count()).toBe(2);
	});

	it("gives up after the retries and names the cause", async () => {
		const f = flaky([
			failing("UND_ERR_CONNECT_TIMEOUT"),
			failing("UND_ERR_CONNECT_TIMEOUT"),
			failing("UND_ERR_CONNECT_TIMEOUT"),
		]);
		const err = await client(f.fetch)
			.request("/x")
			.catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as Error).message).toBe("Test GET /x failed: TypeError: fetch failed (UND_ERR_CONNECT_TIMEOUT)");
		expect(f.count()).toBe(3);
	});

	it("tells a listener about each retry with the attempt it is about to make, until it stops listening", async () => {
		const events: RetryEvent[] = [];
		const stop = onRetry((e) => events.push(e));
		const f = flaky([failing("ECONNRESET"), failing("ECONNRESET")]);
		await client(f.fetch).request("/x");
		expect(events).toEqual([
			{ vendor: "Test", method: "GET", path: "/x", code: "ECONNRESET", attempt: 2, of: 3, delayMs: 0 },
			{ vendor: "Test", method: "GET", path: "/x", code: "ECONNRESET", attempt: 3, of: 3, delayMs: 0 },
		]);
		stop();
		await client(flaky([failing("ECONNRESET")]).fetch).request("/x");
		expect(events).toHaveLength(2);
	});

	it("leaves out a vendor it does not have, and survives a listener that throws", async () => {
		const events: RetryEvent[] = [];
		const stopBad = onRetry(() => {
			throw new Error("display broke");
		});
		const stop = onRetry((e) => events.push(e));
		try {
			const f = flaky([failing("ENOTFOUND")]);
			await createRestClient({
				baseUrl: "https://api.test",
				token: "t",
				fetch: f.fetch,
				retryDelayMs: 0,
			}).request("/y");
			expect(events[0]).toEqual({ method: "GET", path: "/y", code: "ENOTFOUND", attempt: 2, of: 3, delayMs: 0 });
			expect(f.count()).toBe(2);
		} finally {
			stopBad();
			stop();
		}
	});

	it("can be turned off, and leaves a failure with no known cause alone", async () => {
		const off = flaky([failing("ENOTFOUND")]);
		await expect(client(off.fetch, { retries: 0 }).request("/x")).rejects.toThrow(ProviderApiError);
		expect(off.count()).toBe(1);
		const bare = flaky([new TypeError("fetch failed")]);
		await expect(client(bare.fetch).request("/x")).rejects.toThrow(/fetch failed/);
		expect(bare.count()).toBe(1);
	});
});

describe("createRestClient defaults and unreadable bodies", () => {
	it("falls back to the global fetch when none is given", async () => {
		const spy = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		vi.stubGlobal("fetch", spy);
		try {
			const rest = createRestClient({ baseUrl: "https://api.example.com", token: "t", vendor: "Example" });
			await rest.request("/ping");
			expect(spy).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it("still throws a ProviderApiError when an error body cannot be read", async () => {
		const failing = new Response("x", { status: 404 });
		Object.defineProperty(failing, "text", { value: () => Promise.reject(new Error("read failed")) });
		const rest = createRestClient({
			baseUrl: "https://api.example.com",
			token: "t",
			vendor: "Example",
			fetch: (async () => failing) as unknown as typeof globalThis.fetch,
		});
		const err = await rest.request("/missing").catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ProviderApiError);
		expect((err as ProviderApiError).status).toBe(404);
		expect((err as ProviderApiError).details).toBe("");
	});
});
