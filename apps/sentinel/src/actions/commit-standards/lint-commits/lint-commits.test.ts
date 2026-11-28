import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintCommits } from "./lint-commits.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function commit(sha: string, message: string) {
	return { sha, commit: { message } };
}

describe("lintCommits — every commit passes", () => {
	it("fetches the PR's commits and reports valid with no violations", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: [commit("abc1234", "feat: 💥 add thing"), commit("def5678", "fix: 🐛 fix thing")] },
		]);

		const result = await lintCommits({ client, repo: "acme/demo", pullNumber: 42 });

		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/commits");
		expect(result).toEqual({ valid: true, commitCount: 2, violations: [] });
	});
});

describe("lintCommits — a bad commit message", () => {
	it("catches a real violation with the rule name and commitlint's own message", async () => {
		const { client } = makeClient([{ status: 200, body: [commit("bad0001", "not a conventional commit")] }]);

		const result = await lintCommits({ client, repo: "acme/demo", pullNumber: 7 });

		expect(result.valid).toBe(false);
		expect(result.commitCount).toBe(1);
		expect(result.violations).toEqual([
			{ sha: "bad0001", rule: "subject-empty", message: "subject may not be empty" },
			{ sha: "bad0001", rule: "type-empty", message: "type may not be empty" },
		]);
	});

	it("reports violations only for the commit(s) that actually fail, in a mixed PR", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [commit("good001", "feat: 💥 good commit"), commit("bad0002", "also not conventional")],
			},
		]);

		const result = await lintCommits({ client, repo: "acme/demo", pullNumber: 9 });

		expect(result.valid).toBe(false);
		expect(result.commitCount).toBe(2);
		expect(result.violations.every((v) => v.sha === "bad0002")).toBe(true);
	});
});

describe("lintCommits — the shared config's dependabot ignore rule", () => {
	it("doesn't flag a long dependency-bump message the ignore matcher is meant to cover", async () => {
		// Confirmed against real commitlint behavior before writing this
		// assertion: this exact message fails header-max-length + subject-case
		// with the ignore rule stripped out, and passes with it -- proves the
		// loaded config's `ignores` actually gets wired into lint(), not just
		// that the message happens to already be valid on its own.
		const longBump =
			"chore(deps): Bump the all-dependencies group across 1 directory with 42 updates including some genuinely very long package names that push this well past a hundred characters";
		const { client } = makeClient([{ status: 200, body: [commit("dep0001", longBump)] }]);

		const result = await lintCommits({ client, repo: "acme/demo", pullNumber: 11 });

		expect(result).toEqual({ valid: true, commitCount: 1, violations: [] });
	});
});
