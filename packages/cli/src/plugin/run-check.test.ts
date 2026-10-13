import { describe, expect, it } from "vitest";

import type { MonitoringCheckInput } from "./capabilities.js";
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

	it("overrides url with opts.url, leaving input.url untouched", async () => {
		let requestedUrl = "";
		const fetchSpy = (async (url: string | URL) => {
			requestedUrl = String(url);
			return new Response("ok", { status: 200 });
		}) as unknown as typeof fetch;

		await runCheckAgainstUrl(BASE, { fetch: fetchSpy, url: "https://pr-preview.example.com" });
		expect(requestedUrl).toBe("https://pr-preview.example.com");
	});

	it("sends the configured method and body", async () => {
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

	describe("assertion sources", () => {
		it("evaluates status_code", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "status_code", comparison: "equals", target: "201" }] },
				{ fetch: fakeFetch(201) }
			);
			expect(result.passed).toBe(true);
		});

		it("evaluates body", async () => {
			const result = await runCheckAgainstUrl(
				{ ...BASE, assertions: [{ source: "body", comparison: "contains", target: "hello" }] },
				{ fetch: fakeFetch(200, "say hello world") }
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
