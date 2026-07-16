import { describe, expect, it } from "vitest";
import { createGitHubClient } from "../index.js";
import { stubFetch, TOKEN } from "./helpers.js";

describe("createGitHubClient", () => {
	it("exposes all namespaces", () => {
		const { fetch } = stubFetch([]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		expect(typeof client.branches.protectBranch).toBe("function");
		expect(typeof client.environments.listEnvironments).toBe("function");
		expect(typeof client.git.getRef).toBe("function");
		expect(typeof client.issues.listIssues).toBe("function");
		expect(typeof client.labels.listLabels).toBe("function");
		expect(typeof client.properties.setProperties).toBe("function");
		expect(typeof client.repos.getRepo).toBe("function");
		expect(typeof client.rulesets.listRulesets).toBe("function");
		expect(typeof client.secrets.listSecrets).toBe("function");
		expect(typeof client.security.enableVulnerabilityAlerts).toBe(
			"function",
		);
		expect(typeof client.topics.setTopics).toBe("function");
		expect(typeof client.user.getCurrentUser).toBe("function");
		expect(typeof client.workflows.listRuns).toBe("function");
	});

	it("sends Bearer token and GitHub headers on every request", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { login: "newton", name: null, email: null } },
		]);
		const client = createGitHubClient({ token: TOKEN, fetch });
		await client.user.getCurrentUser();
		expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
		expect(calls[0]?.headers.accept).toBe("application/vnd.github+json");
		expect(calls[0]?.headers["x-github-api-version"]).toBe("2022-11-28");
	});

	it("uses a custom baseUrl when provided", async () => {
		const { fetch, calls } = stubFetch([
			{ body: { login: "gh-emu", name: null, email: null } },
		]);
		const client = createGitHubClient({
			token: TOKEN,
			baseUrl: "https://ghes.example.com",
			fetch,
		});
		await client.user.getCurrentUser();
		expect(calls[0]?.url).toContain("ghes.example.com");
	});
});
