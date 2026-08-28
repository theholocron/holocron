import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "./helpers.js";

const RAW_PR = {
	number: 42,
	title: "fix: something",
	state: "closed" as const,
	merged_at: "2026-08-28T00:00:00Z",
	html_url: "https://github.com/theholocron/test-repo/pull/42",
	head: { ref: "fix/something" },
};

describe("pulls.getPullRequest", () => {
	it("GETs /repos/{owner}/{name}/pulls/{number}", async () => {
		const { fetch, calls } = stubFetch([{ body: RAW_PR }]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		const result = await client.pulls.getPullRequest(REPO, 42);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/pulls/42");
		expect(result.number).toBe(42);
		expect(result.title).toBe("fix: something");
		expect(result.state).toBe("closed");
		expect(result.merged_at).toBe("2026-08-28T00:00:00Z");
		expect(result.head.ref).toBe("fix/something");
	});
});
