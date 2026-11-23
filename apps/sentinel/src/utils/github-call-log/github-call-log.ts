import { githubDeliveryFields, recordGitHubCall } from "../github-delivery-calls/index.js";
import type { GitHubCallLogger } from "./github-call-log.type.js";

/** The message every call is logged under, so a query can count them. */
export const GITHUB_CALL_LOG_MSG = "githubCall";

/** How much of GitHub's own message a refused call keeps. */
export const GITHUB_CALL_MESSAGE_CHARS = 160;

/**
 * A request URL as a route with few distinct values, so calls can be counted by kind: numbers become `:n`, commit ids
 * `:sha`, and the owner and repository of `/repos/...` `:owner` and `:repo`. The query string is dropped.
 */
export function githubRoute(url: string): string {
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return "unparseable";
	}
	const parts = pathname
		.split("/")
		.filter((part) => part !== "")
		.map((part) => (/^\d+$/.test(part) ? ":n" : /^[0-9a-f]{40}$/.test(part) ? ":sha" : part));
	if (parts[0] === "repos" && parts.length >= 3) parts.splice(1, 2, ":owner", ":repo");
	return `/${parts.join("/")}`;
}

/** A header as a number, `undefined` when GitHub did not send it. */
function numeric(res: Response, name: string): number | undefined {
	const raw = res.headers.get(name);
	return raw === null ? undefined : Number(raw);
}

/** GitHub's own `message` for a refused call, cut short; empty when the body is not JSON with one. */
async function refusalMessage(res: Response): Promise<string> {
	const text = await res.clone().text();
	try {
		const message = (JSON.parse(text) as { message?: unknown }).message;
		return typeof message === "string" ? message.slice(0, GITHUB_CALL_MESSAGE_CHARS) : "";
	} catch {
		return "";
	}
}

/**
 * Wraps `fetch` so that every call to GitHub is logged once: the method, the route (see {@link githubRoute}), the status
 * and GitHub's own quota headers (`x-ratelimit-remaining`, `-limit`, `-reset`, `-resource`, and `retry-after`), which
 * is how a run out of quota is told from a missing permission and how many calls a day really costs. A 403 or 429 is
 * logged at `warn` with GitHub's message. No credential is ever logged, and a failure to log never changes the call.
 */
export function loggedFetch(logger: GitHubCallLogger, base: typeof fetch = globalThis.fetch): typeof fetch {
	return async (input, init) => {
		const res = await base(input, init);
		try {
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
			const refused = res.status === 403 || res.status === 429;
			const route = githubRoute(url);
			recordGitHubCall(route.startsWith("/repos/:owner/:repo/contents"));
			const fields = {
				...githubDeliveryFields(),
				method: init?.method ?? "GET",
				route,
				status: res.status,
				remaining: numeric(res, "x-ratelimit-remaining"),
				limit: numeric(res, "x-ratelimit-limit"),
				reset: numeric(res, "x-ratelimit-reset"),
				resource: res.headers.get("x-ratelimit-resource") ?? undefined,
				retryAfter: numeric(res, "retry-after"),
			};
			if (refused) logger.warn({ ...fields, message: await refusalMessage(res) }, GITHUB_CALL_LOG_MSG);
			else logger.info(fields, GITHUB_CALL_LOG_MSG);
		} catch {
			// Logging must never change what the caller sees.
		}
		return res;
	};
}
