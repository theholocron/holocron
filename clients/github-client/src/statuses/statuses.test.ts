import { describe, expect, it } from "vitest";

import { createGitHubClient } from "../index.js";
import { REPO, stubFetch, TOKEN } from "../test-helpers.js";

const status = (id: number, context: string, state = "success") => ({
	id,
	context,
	state,
	target_url: null,
	created_at: "2026-11-22T10:00:00Z",
});

describe("statuses.listCommitStatuses", () => {
	it("GETs /repos/{owner}/{name}/commits/{ref}/statuses and returns the statuses newest first", async () => {
		const { fetch, calls } = stubFetch([
			{ status: 200, body: [status(2, "codecov/patch"), status(1, "codecov/patch", "pending")] },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.statuses.listCommitStatuses(REPO, "abc123");

		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/theholocron/test-repo/commits/abc123/statuses?per_page=100&page=1");
		expect(result.map((s) => s.id)).toEqual([2, 1]);
	});

	it("reads the next page while a page comes back full, and stops at a short one", async () => {
		const full = Array.from({ length: 100 }, (_, i) => status(i + 1, `c${i}`));
		const { fetch, calls } = stubFetch([
			{ status: 200, body: full },
			{ status: 200, body: [status(101, "last")] },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });

		const result = await client.statuses.listCommitStatuses(REPO, "abc123");

		expect(result).toHaveLength(101);
		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toContain("page=2");
	});

	it("stops after ten pages", async () => {
		const full = Array.from({ length: 100 }, (_, i) => status(i + 1, `c${i}`));
		const { fetch, calls } = stubFetch(Array.from({ length: 10 }, () => ({ status: 200, body: full })));
		const client = createGitHubClient({ token: TOKEN, fetch });

		expect(await client.statuses.listCommitStatuses(REPO, "abc123")).toHaveLength(1000);
		expect(calls).toHaveLength(10);
	});
});
