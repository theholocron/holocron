import { describe, expect, it, vi } from "vitest";

import { readClosingIssues } from "./read-closing-issues.js";

const clientReturning = (data: unknown) => {
	const query = vi.fn(async () => data);
	return { graphql: { query } } as unknown as Parameters<typeof readClosingIssues>[0]["client"] & {
		graphql: { query: typeof query };
	};
};

describe("readClosingIssues", () => {
	it("lists the issues GitHub says the pull request closes, with their repositories", async () => {
		const client = clientReturning({
			repository: {
				pullRequest: {
					closingIssuesReferences: {
						nodes: [
							{ number: 5, repository: { nameWithOwner: "acme/widgets" } },
							{ number: 9, repository: { nameWithOwner: "acme/other" } },
						],
					},
				},
			},
		});
		expect(await readClosingIssues({ client, repo: "acme/widgets", number: 12 })).toEqual({
			issues: [
				{ repo: "acme/widgets", number: 5 },
				{ repo: "acme/other", number: 9 },
			],
		});
		expect(client.graphql.query).toHaveBeenCalledWith(expect.stringContaining("closingIssuesReferences"), {
			owner: "acme",
			name: "widgets",
			number: 12,
		});
	});

	it("closes nothing when the pull request or the repository is gone", async () => {
		expect(
			await readClosingIssues({
				client: clientReturning({ repository: { pullRequest: null } }),
				repo: "a/b",
				number: 1,
			})
		).toEqual({ issues: [] });
		expect(
			await readClosingIssues({ client: clientReturning({ repository: null }), repo: "a/b", number: 1 })
		).toEqual({
			issues: [],
		});
	});
});
