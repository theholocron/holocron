import { describe, expect, it } from "vitest";

import type { MonitoringCheckInput } from "../capabilities/index.js";
import { runCheckAgainstUrl } from "./run-check.js";

function fakeFetch(status: number, body = "", headers: Record<string, string> = {}): typeof fetch {
	return (async () => new Response(body, { status, headers })) as unknown as typeof fetch;
}

const BASE: MonitoringCheckInput = {
	name: "test check",
	url: "https://example.com/original",
};

describe("runCheckAgainstUrl", () => {
	it("passes when status is healthy and every assertion matches", async () => {
		const result = await runCheckAgainstUrl(
			{ ...BASE, assertions: [{ source: "status_code", comparison: "equals", target: "200" }] },
			{ fetch: fakeFetch(200, "ok") }
		);
		expect(result).toMatchObject({ passed: true, status: 200, failures: [] });
	});

	describe("url override", () => {
		it("swaps in the override origin but keeps input.url's own path and query", async () => {
			let requestedUrl = "";
			const fetchSpy = (async (url: string | URL) => {
				requestedUrl = String(url);
				return new Response("ok", { status: 200 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl(
				{ ...BASE, url: "https://prod.example.com/api/webhook?x=1" },
				{ fetch: fetchSpy, url: "https://pr-preview.example.com" }
			);
			expect(requestedUrl).toBe("https://pr-preview.example.com/api/webhook?x=1");
		});

		it("discards any path/query the override itself carries", async () => {
			let requestedUrl = "";
			const fetchSpy = (async (url: string | URL) => {
				requestedUrl = String(url);
				return new Response("ok", { status: 200 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl(
				{ ...BASE, url: "https://prod.example.com/api/webhook" },
				{ fetch: fetchSpy, url: "https://pr-preview.example.com/some/other/path" }
			);
			expect(requestedUrl).toBe("https://pr-preview.example.com/api/webhook");
		});

		it("uses input.url unmodified when no override is given", async () => {
			let requestedUrl = "";
			const fetchSpy = (async (url: string | URL) => {
				requestedUrl = String(url);
				return new Response("ok", { status: 200 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl(BASE, { fetch: fetchSpy });
			expect(requestedUrl).toBe(BASE.url);
		});
	});

	it("merges opts.headers into the request", async () => {
		let requestedHeaders: Record<string, string> | undefined;
		const fetchSpy = (async (_url: string | URL, init?: { headers?: Record<string, string> }) => {
			requestedHeaders = init?.headers;
			return new Response("ok", { status: 200 });
		}) as unknown as typeof fetch;

		await runCheckAgainstUrl(BASE, { fetch: fetchSpy, headers: { "x-vercel-protection-bypass": "secret" } });
		expect(requestedHeaders).toEqual({ "x-vercel-protection-bypass": "secret" });
	});

	it("omits the headers field entirely when opts.headers isn't given", async () => {
		let sawHeadersKey = true;
		const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
			sawHeadersKey = init !== undefined && "headers" in init;
			return new Response("ok", { status: 200 });
		}) as unknown as typeof fetch;

		await runCheckAgainstUrl(BASE, { fetch: fetchSpy });
		expect(sawHeadersKey).toBe(false);
	});

	it("uses the real global fetch when none is injected", async () => {
		// 127.0.0.1 refusing a connection is immediate and has no network/DNS
		// dependency — enough to prove the default `?? fetch` branch is the
		// one making the request, without a real external call.
		const result = await runCheckAgainstUrl({ ...BASE, url: "http://127.0.0.1:1/" });
		expect(result.passed).toBe(false);
		expect(result.requestError).toBeTruthy();
	});

	it("never follows a redirect — passes redirect: manual to fetch", async () => {
		let seenRedirect: string | undefined;
		const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
			seenRedirect = init?.redirect;
			return new Response("", { status: 302, headers: { location: "https://elsewhere.example.com" } });
		}) as unknown as typeof fetch;

		await runCheckAgainstUrl(BASE, { fetch: fetchSpy });
		expect(seenRedirect).toBe("manual");
	});

	it("passes a timeout signal to fetch", async () => {
		let seenSignal: AbortSignal | undefined;
		const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
			seenSignal = init?.signal ?? undefined;
			return new Response("", { status: 200 });
		}) as unknown as typeof fetch;

		await runCheckAgainstUrl(BASE, { fetch: fetchSpy, timeoutMs: 5000 });
		expect(seenSignal).toBeInstanceOf(AbortSignal);
	});

	it("reports a clearer message when the request times out", async () => {
		const fetchSpy = (async () => {
			const err = new Error("The operation was aborted");
			err.name = "TimeoutError";
			throw err;
		}) as unknown as typeof fetch;

		const result = await runCheckAgainstUrl(BASE, { fetch: fetchSpy });
		expect(result.passed).toBe(false);
		expect(result.requestError).toContain("timed out");
	});

	describe("method and body", () => {
		it("sends the configured method and body for POST", async () => {
			let seenMethod = "";
			let seenBody: unknown;
			const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
				seenMethod = init?.method ?? "";
				seenBody = init?.body;
				return new Response("", { status: 401 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl({ ...BASE, method: "POST", body: "{}", shouldFail: true }, { fetch: fetchSpy });
			expect(seenMethod).toBe("POST");
			expect(seenBody).toBe("{}");
		});

		it("defaults to GET when no method is given", async () => {
			let seenMethod = "";
			const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
				seenMethod = init?.method ?? "";
				return new Response("", { status: 200 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl(BASE, { fetch: fetchSpy });
			expect(seenMethod).toBe("GET");
		});

		it("never sends a body on GET, even when one is configured (fetch throws on GET+body)", async () => {
			let seenBody: unknown = "unset";
			const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
				seenBody = init?.body;
				return new Response("", { status: 200 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl({ ...BASE, method: "GET", body: "{}" }, { fetch: fetchSpy });
			expect(seenBody).toBeUndefined();
		});

		it("never sends a body on HEAD either", async () => {
			let seenBody: unknown = "unset";
			const fetchSpy = (async (_url: string | URL, init?: RequestInit) => {
				seenBody = init?.body;
				return new Response("", { status: 200 });
			}) as unknown as typeof fetch;

			await runCheckAgainstUrl({ ...BASE, method: "HEAD", body: "{}" }, { fetch: fetchSpy });
			expect(seenBody).toBeUndefined();
		});
	});

	describe("the implicit >=400 classification", () => {
		it("fails a >=400 response when shouldFail is not set", async () => {
			const result = await runCheckAgainstUrl(BASE, { fetch: fakeFetch(500) });
			expect(result.passed).toBe(false);
			expect(result.failures[0]).toContain("HTTP 500");
		});

		it("does not fail a >=400 response when shouldFail is true", async () => {
			const result = await runCheckAgainstUrl(
				{
					...BASE,
					shouldFail: true,
					assertions: [{ source: "status_code", comparison: "equals", target: "405" }],
				},
				{ fetch: fakeFetch(405) }
			);
			expect(result.passed).toBe(true);
		});

		it("does not fail a healthy response even without shouldFail", async () => {
			const result = await runCheckAgainstUrl(BASE, { fetch: fakeFetch(200) });
			expect(result.passed).toBe(true);
		});
	});

	describe("body reading", () => {
		it("does not read the body at all when no assertion needs it", async () => {
			let bodyAccessed = false;
			const fetchSpy = (async () => {
				const real = new Response("huge body that should never be read", { status: 200 });
				return new Proxy(real, {
					get(target, prop, receiver) {
						if (prop === "body") bodyAccessed = true;
						return Reflect.get(target, prop, receiver);
					},
				});
			}) as unknown as typeof fetch;

			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "status_code", comparison: "equals", target: "200" }] },
				{ fetch: fetchSpy }
			);
			expect(result.passed).toBe(true);
			expect(bodyAccessed).toBe(false);
		});

		it("reads the body when a body assertion is configured", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "contains", target: "hello" }] },
				{ fetch: fakeFetch(200, "say hello world") }
			);
			expect(result.passed).toBe(true);
		});

		it("caps the body at maxBodyBytes instead of buffering it all", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "equals", target: "ab" }] },
				{ fetch: fakeFetch(200, "abcdefghij"), maxBodyBytes: 2 }
			);
			// The capped body is "ab", which equals the target exactly.
			expect(result.passed).toBe(true);
		});

		it("stops reading once the cap is hit, even when it only crosses on a later chunk", async () => {
			// A hand-rolled reader (not a real ReadableStream/Readable.toWeb —
			// both are blocked by this repo's n/no-unsupported-features/
			// node-builtins lint rule for the declared engines.node range)
			// delivering the body across two chunks, so the cap is only
			// exceeded on the second read() rather than the first.
			const encoded = [new TextEncoder().encode("ab"), new TextEncoder().encode("cdef")];
			let i = 0;
			const fakeBody = {
				getReader: () => ({
					read: async () => (i < encoded.length ? { done: false, value: encoded[i++] } : { done: true }),
					// A cancel() rejection is swallowed (best-effort cleanup) --
					// this also exercises that swallow path.
					cancel: async () => {
						throw new Error("cancel failed");
					},
				}),
			};
			const fetchSpy = (async () =>
				({
					status: 200,
					headers: new Headers(),
					body: fakeBody,
				}) as unknown as Response) as unknown as typeof fetch;

			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "equals", target: "ab" }] },
				{ fetch: fetchSpy, maxBodyBytes: 2 }
			);
			expect(result.passed).toBe(true);
		});

		it("handles a null response body gracefully", async () => {
			const fetchSpy = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "equals", target: "" }] },
				{ fetch: fetchSpy }
			);
			expect(result.passed).toBe(true);
		});
	});

	describe("assertion sources", () => {
		it("evaluates status_code", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "status_code", comparison: "equals", target: "201" }] },
				{ fetch: fakeFetch(201) }
			);
			expect(result.passed).toBe(true);
		});

		it("evaluates header, reading `property` as the header name", async () => {
			const result = await runCheckAgainstUrl(
				{
					...BASE,
					assertions: [
						{
							source: "header",
							comparison: "equals",
							property: "content-type",
							target: "application/json",
						},
					],
				},
				{ fetch: fakeFetch(200, "{}", { "content-type": "application/json" }) }
			);
			expect(result.passed).toBe(true);
		});

		it("evaluates response_time as a numeric comparison", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "response_time", comparison: "less_than", target: "100000" }] },
				{ fetch: fakeFetch(200) }
			);
			expect(result.passed).toBe(true);
			expect(result.responseTimeMs).toBeTypeOf("number");
		});
	});

	describe("comparisons", () => {
		const cases: Array<[MonitoringCheckInput["assertions"], boolean]> = [
			[[{ source: "body", comparison: "equals", target: "exact" }], true],
			[[{ source: "body", comparison: "not_equals", target: "other" }], true],
			[[{ source: "body", comparison: "contains", target: "xa" }], true],
			[[{ source: "body", comparison: "not_contains", target: "zzz" }], true],
			[[{ source: "status_code", comparison: "greater_than", target: "100" }], true],
			[[{ source: "status_code", comparison: "less_than", target: "300" }], true],
		];

		it.each(cases)("evaluates %#", async (assertions, expected) => {
			const result = await runCheckAgainstUrl({ ...BASE, assertions }, { fetch: fakeFetch(200, "exact") });
			expect(result.passed).toBe(expected);
		});

		it("treats a missing target as an empty string, including in the failure message", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "equals" }] },
				{ fetch: fakeFetch(200, "not empty") }
			);
			expect(result.passed).toBe(false);
			expect(result.failures[0]).toContain('""');
		});

		it("treats a missing header property as an empty header name", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "header", comparison: "equals", target: "" }] },
				{ fetch: fakeFetch(200) }
			);
			expect(result.passed).toBe(true);
		});

		it("treats a header that isn't present in the response as an empty string", async () => {
			const result = await runCheckAgainstUrl(
				{
					...BASE,
					assertions: [{ source: "header", comparison: "equals", property: "x-not-present", target: "" }],
				},
				{ fetch: fakeFetch(200) }
			);
			expect(result.passed).toBe(true);
		});

		it("truncates a long actual value in the failure message", async () => {
			const longBody = "x".repeat(500);
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "equals", target: "short" }] },
				{ fetch: fakeFetch(200, longBody) }
			);
			expect(result.failures[0]).toContain("…");
			expect(result.failures[0]!.length).toBeLessThan(longBody.length);
		});

		it("reports a mismatch as a failure with a readable reason", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "equals", target: "expected" }] },
				{ fetch: fakeFetch(200, "actual") }
			);
			expect(result.passed).toBe(false);
			expect(result.failures[0]).toContain("expected");
			expect(result.failures[0]).toContain("actual");
		});
	});

	describe("request-level failures", () => {
		it("never passes on a thrown fetch error, regardless of shouldFail", async () => {
			const fetchSpy = (async () => {
				throw new Error("ECONNREFUSED");
			}) as unknown as typeof fetch;

			const result = await runCheckAgainstUrl({ ...BASE, shouldFail: true }, { fetch: fetchSpy });
			expect(result.passed).toBe(false);
			expect(result.requestError).toBe("ECONNREFUSED");
			expect(result.failures).toEqual([]);
		});

		it("stringifies a non-Error throw", async () => {
			const fetchSpy = (async () => {
				throw "weird failure";
			}) as unknown as typeof fetch;

			const result = await runCheckAgainstUrl(BASE, { fetch: fetchSpy });
			expect(result.requestError).toBe("weird failure");
		});
	});
});
