import { describe, expect, it, vi } from "vitest";

import { describeGitHubDelivery, runWithGitHubCalls } from "../github-delivery-calls/index.js";
import { GITHUB_CALL_LOG_MSG, GITHUB_CALL_MESSAGE_CHARS, githubRoute, loggedFetch } from "./github-call-log.js";

const SHA = "a".repeat(40);

function loggers() {
	return { info: vi.fn(), warn: vi.fn() };
}

const answering = (status: number, body = "{}", headers: Record<string, string> = {}) =>
	vi.fn(async () => new Response(body, { status, headers })) as unknown as typeof fetch;

describe("githubRoute", () => {
	it("keeps the kind of call and drops what varies", () => {
		expect(githubRoute("https://api.github.com/repos/acme/demo/pulls/12/files?per_page=100&page=2")).toBe(
			"/repos/:owner/:repo/pulls/:n/files"
		);
		expect(githubRoute(`https://api.github.com/repos/acme/demo/commits/${SHA}/check-runs`)).toBe(
			"/repos/:owner/:repo/commits/:sha/check-runs"
		);
		expect(githubRoute("https://api.github.com/app/installations/42/access_tokens")).toBe(
			"/app/installations/:n/access_tokens"
		);
		expect(githubRoute("https://api.github.com/rate_limit")).toBe("/rate_limit");
	});

	it("does not throw for a URL it cannot read", () => {
		expect(githubRoute("not a url")).toBe("unparseable");
	});
});

describe("loggedFetch", () => {
	it("logs a successful call once with its route, status and GitHub's quota headers, and returns the response", async () => {
		const log = loggers();
		const base = answering(200, "{}", {
			"x-ratelimit-remaining": "4210",
			"x-ratelimit-limit": "5000",
			"x-ratelimit-reset": "1795000000",
			"x-ratelimit-resource": "core",
		});
		const res = await loggedFetch(log, base)("https://api.github.com/repos/acme/demo/pulls/7", { method: "PATCH" });
		expect(res.status).toBe(200);
		expect(log.info).toHaveBeenCalledWith(
			{
				method: "PATCH",
				route: "/repos/:owner/:repo/pulls/:n",
				status: 200,
				remaining: 4210,
				limit: 5000,
				reset: 1795000000,
				resource: "core",
				retryAfter: undefined,
			},
			GITHUB_CALL_LOG_MSG
		);
		expect(log.warn).not.toHaveBeenCalled();
	});

	it("logs a refused call at warn with GitHub's own message, so a rate limit can be told from a permission", async () => {
		const log = loggers();
		const base = answering(403, '{"message":"API rate limit exceeded for installation","documentation_url":"u"}', {
			"x-ratelimit-remaining": "0",
			"retry-after": "60",
		});
		const res = await loggedFetch(log, base)(new URL("https://api.github.com/repos/acme/demo/pulls/7"));
		expect(res.status).toBe(403);
		expect(await res.text()).toContain("rate limit");
		expect(log.warn).toHaveBeenCalledWith(
			expect.objectContaining({
				method: "GET",
				status: 403,
				remaining: 0,
				retryAfter: 60,
				message: "API rate limit exceeded for installation",
			}),
			GITHUB_CALL_LOG_MSG
		);
	});

	it("takes a request object, and a refusal whose body has no message", async () => {
		const log = loggers();
		const base = answering(429, "plain text");
		await loggedFetch(log, base)(new Request("https://api.github.com/rate_limit"));
		expect(log.warn).toHaveBeenCalledWith(
			expect.objectContaining({ route: "/rate_limit", status: 429, message: "" }),
			GITHUB_CALL_LOG_MSG
		);
	});

	it("keeps only a text message, cut short", async () => {
		const log = loggers();
		await loggedFetch(log, answering(403, '{"message":42}'))("https://api.github.com/x");
		await loggedFetch(
			log,
			answering(403, JSON.stringify({ message: "m".repeat(GITHUB_CALL_MESSAGE_CHARS + 40) }))
		)("https://api.github.com/x");
		const messages = log.warn.mock.calls.map((call) => (call[0] as { message: string }).message);
		expect(messages).toEqual(["", "m".repeat(GITHUB_CALL_MESSAGE_CHARS)]);
	});

	it("never changes the call when logging fails", async () => {
		const log = {
			info: vi.fn(() => {
				throw new Error("transport down");
			}),
			warn: vi.fn(),
		};
		const res = await loggedFetch(log, answering(200))("https://api.github.com/rate_limit");
		expect(res.status).toBe(200);
	});

	it("uses the global fetch by default", async () => {
		const log = loggers();
		const original = globalThis.fetch;
		globalThis.fetch = answering(200);
		try {
			await loggedFetch(log)("https://api.github.com/rate_limit");
		} finally {
			globalThis.fetch = original;
		}
		expect(log.info).toHaveBeenCalledTimes(1);
	});

	it("says which delivery a call belongs to, and counts it there, when it is made inside one", async () => {
		const log = loggers();
		const base = answering(200);
		await runWithGitHubCalls(async () => {
			describeGitHubDelivery({ event: "pull_request.opened", repo: "acme/demo", delivery: "d-9" });
			await loggedFetch(log, base)("https://api.github.com/repos/acme/demo/contents/.holocron/org.ts");
			await loggedFetch(log, base)("https://api.github.com/repos/acme/demo/pulls/7");
		});
		expect(log.info).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				event: "pull_request.opened",
				repo: "acme/demo",
				delivery: "d-9",
				route: "/repos/:owner/:repo/contents/.holocron/org.ts",
			}),
			GITHUB_CALL_LOG_MSG
		);
	});
});
