import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { lintDco } from "./lint-dco.js";

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

function commit(
	sha: string,
	message: string,
	options: { authorLogin?: string | null; authorType?: "User" | "Bot"; parents?: string[] } = {}
) {
	const { authorLogin = "ada", authorType = "User", parents = ["parent1"] } = options;
	return {
		sha,
		commit: {
			message,
			author: { name: "Ada Lovelace", email: "ada@example.com" },
			committer: { name: "Ada Lovelace", email: "ada@example.com" },
		},
		author: authorLogin === null ? null : { login: authorLogin, type: authorType },
		parents: parents.map((sha) => ({ sha })),
	};
}

describe("lintDco — a properly signed-off commit", () => {
	it("fetches the PR's commits and reports valid", async () => {
		const { client, calls } = makeClient([
			{
				status: 200,
				body: [commit("abc1234", "feat: add thing\n\nSigned-off-by: Ada Lovelace <ada@example.com>")],
			},
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 42 });

		expect(calls[0]?.method).toBe("GET");
		expect(calls[0]?.url).toContain("/repos/acme/demo/pulls/42/commits");
		expect(result).toEqual({ valid: true, commitCount: 1, violations: [] });
	});

	it("matches case-insensitively", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [commit("abc1234", "feat: add thing\n\nSigned-off-by: ADA LOVELACE <ADA@EXAMPLE.COM>")],
			},
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 42 });

		expect(result.valid).toBe(true);
	});

	it("matches against the committer identity too, not just the author", async () => {
		const c = commit("abc1234", "feat: add thing\n\nSigned-off-by: Grace Hopper <grace@example.com>");
		c.commit.committer = { name: "Grace Hopper", email: "grace@example.com" };
		const { client } = makeClient([{ status: 200, body: [c] }]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 42 });

		expect(result.valid).toBe(true);
	});
});

describe("lintDco — a missing sign-off", () => {
	it("catches a commit with no Signed-off-by trailer at all", async () => {
		const { client } = makeClient([{ status: 200, body: [commit("bad0001", "feat: add thing, no signoff")] }]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 7 });

		expect(result.valid).toBe(false);
		expect(result.commitCount).toBe(1);
		expect(result.violations).toEqual([{ sha: "bad0001", author: "Ada Lovelace <ada@example.com>" }]);
	});

	it("catches a signoff whose name/email doesn't match the commit's own author or committer", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [commit("bad0002", "feat: add thing\n\nSigned-off-by: Someone Else <else@example.com>")],
			},
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 7 });

		expect(result.valid).toBe(false);
		expect(result.violations).toEqual([{ sha: "bad0002", author: "Ada Lovelace <ada@example.com>" }]);
	});

	it("reports violations only for the commit(s) that actually fail, in a mixed PR", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [
					commit("good001", "feat: good\n\nSigned-off-by: Ada Lovelace <ada@example.com>"),
					commit("bad0003", "feat: bad, no signoff"),
				],
			},
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 9 });

		expect(result.valid).toBe(false);
		expect(result.commitCount).toBe(2);
		expect(result.violations).toEqual([{ sha: "bad0003", author: "Ada Lovelace <ada@example.com>" }]);
	});
});

describe("lintDco — exemptions", () => {
	it("exempts a merge commit (more than one parent) entirely, even with no signoff", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [commit("merge01", "Merge pull request #1", { parents: ["parent1", "parent2"] })],
			},
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 1 });

		expect(result).toEqual({ valid: true, commitCount: 0, violations: [] });
	});

	it("exempts a bot-authored commit entirely, even with no signoff", async () => {
		const { client } = makeClient([
			{
				status: 200,
				body: [
					commit("bot0001", "style: apply editorconfig fixes (auto-fix via Sentinel)", { authorType: "Bot" }),
				],
			},
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 1 });

		expect(result).toEqual({ valid: true, commitCount: 0, violations: [] });
	});

	it("still requires a signoff when the commit author has no linked GitHub account at all", async () => {
		const { client } = makeClient([
			{ status: 200, body: [commit("unlinked1", "feat: add thing, no signoff", { authorLogin: null })] },
		]);

		const result = await lintDco({ client, repo: "acme/demo", pullNumber: 1 });

		expect(result.valid).toBe(false);
		expect(result.commitCount).toBe(1);
	});
});
