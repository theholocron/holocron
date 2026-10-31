import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProviderApiError } from "@theholocron/cli";
import { stubFetch } from "@theholocron/http-client/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createGitHubClient } from "../rest.js";
import { GitHubSource } from "./source.js";

const REPO = "theholocron/holocron";

function makeSource(responses: Parameters<typeof stubFetch>[0], repoRoot: string = process.cwd()) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	const source = new GitHubSource(rest, { repo: REPO, repoRoot });
	return { source, calls };
}

const RAW_PR = {
	number: 42,
	title: "fix: something",
	state: "closed" as const,
	merged_at: "2026-08-28T00:00:00Z",
	html_url: "https://github.com/theholocron/holocron/pull/42",
	head: { ref: "fix/something", sha: "abc1234" },
};

describe("GitHubSource.getPullRequest", () => {
	it("GETs /repos/{owner}/{name}/pulls/{number} and maps the result", async () => {
		const { source, calls } = makeSource([{ status: 200, body: RAW_PR }]);
		const pr = await source.getPullRequest(42);
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/pulls/42");
		expect(pr.number).toBe(42);
		expect(pr.title).toBe("fix: something");
		expect(pr.state).toBe("closed");
		expect(pr.merged).toBe(true);
		expect(pr.branch).toBe("fix/something");
		expect(pr.url).toBe("https://github.com/theholocron/holocron/pull/42");
	});

	it("sets merged: false when merged_at is null", async () => {
		const { source } = makeSource([{ status: 200, body: { ...RAW_PR, merged_at: null } }]);
		const pr = await source.getPullRequest(42);
		expect(pr.merged).toBe(false);
	});

	it("accepts a repo override", async () => {
		const { source, calls } = makeSource([{ status: 200, body: RAW_PR }]);
		await source.getPullRequest(42, "theholocron/clients");
		expect(calls[0]?.url).toContain("/repos/theholocron/clients/pulls/42");
	});
});

describe("GitHubSource.listPullRequests", () => {
	it("lists one state and maps each pull request, with its head sha", async () => {
		const { source, calls } = makeSource([
			{ status: 200, body: [RAW_PR, { ...RAW_PR, number: 43, merged_at: null }] },
		]);
		const prs = await source.listPullRequests("closed");
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/pulls?state=closed");
		expect(prs.map((p) => [p.number, p.merged, p.headSha])).toEqual([
			[42, true, "abc1234"],
			[43, false, "abc1234"],
		]);
	});

	it("accepts a repo override", async () => {
		const { source, calls } = makeSource([{ status: 200, body: [] }]);
		await source.listPullRequests("open", "theholocron/clients");
		expect(calls[0]?.url).toContain("/repos/theholocron/clients/pulls?state=open");
	});
});

describe("GitHubSource.listPullRequestCommits", () => {
	it("returns the commit shas of a pull request", async () => {
		const { source, calls } = makeSource([{ status: 200, body: [{ sha: "aaa" }, { sha: "bbb" }] }]);
		expect(await source.listPullRequestCommits(42)).toEqual(["aaa", "bbb"]);
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/pulls/42/commits");
	});

	it("accepts a repo override", async () => {
		const { source, calls } = makeSource([{ status: 200, body: [] }]);
		await source.listPullRequestCommits(7, "theholocron/clients");
		expect(calls[0]?.url).toContain("/repos/theholocron/clients/pulls/7/commits");
	});
});

describe("GitHubSource.listBranches", () => {
	it("maps each branch to its name and sha", async () => {
		const { source, calls } = makeSource([{ status: 200, body: [{ name: "alpha", commit: { sha: "abc" } }] }]);
		expect(await source.listBranches()).toEqual([{ name: "alpha", sha: "abc" }]);
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/branches?per_page=100");
	});

	it("accepts a repo override", async () => {
		const { source, calls } = makeSource([{ status: 200, body: [] }]);
		await source.listBranches("theholocron/clients");
		expect(calls[0]?.url).toContain("/repos/theholocron/clients/branches");
	});
});

describe("GitHubSource.deleteBranch", () => {
	it("DELETEs the branch's ref", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		await source.deleteBranch("feat/x");
		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/git/refs/heads/feat/x");
	});

	it("accepts a repo override", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		await source.deleteBranch("x", "theholocron/clients");
		expect(calls[0]?.url).toContain("/repos/theholocron/clients/git/refs/heads/x");
	});

	it("treats a branch that is already gone as deleted", async () => {
		const { source } = makeSource([{ status: 422, body: { message: "Reference does not exist" } }]);
		await expect(source.deleteBranch("gone")).resolves.toBeUndefined();
	});

	it("rethrows any other 422", async () => {
		const { source } = makeSource([{ status: 422, body: { message: "Something else" } }]);
		await expect(source.deleteBranch("x")).rejects.toBeInstanceOf(ProviderApiError);
	});

	it("rethrows a failure that is not an API error", async () => {
		const { source } = makeSource([{ status: 500, body: {} }]);
		await expect(source.deleteBranch("x")).rejects.toThrow();
	});
});

describe("GitHubSource — REST methods", () => {
	it("whoami → GET /user", async () => {
		const { source, calls } = makeSource([{ status: 200, body: { login: "iamnewton" } }]);
		expect(await source.whoami()).toEqual({ login: "iamnewton" });
		expect(calls[0]?.url).toBe("https://api.github.com/user");
	});

	it("getRepo returns owner + name + default_branch", async () => {
		const { source, calls } = makeSource([{ status: 200, body: { default_branch: "trunk" } }]);
		const result = await source.getRepo();
		expect(result).toEqual({ owner: "theholocron", name: "holocron", defaultBranch: "trunk" });
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}`);
	});

	it("throws ProviderApiError on auth failure", async () => {
		const { source } = makeSource([{ status: 401, text: "bad creds" }]);
		await expect(source.whoami()).rejects.toBeInstanceOf(ProviderApiError);
	});

	it("listRulesets → GET /repos/{repo}/rulesets", async () => {
		const body = [{ id: 1, name: "main", enforcement: "active" }];
		const { source, calls } = makeSource([{ status: 200, body }]);
		expect(await source.listRulesets()).toEqual(body);
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/rulesets`);
	});

	it("createRuleset → POST with payload", async () => {
		const { source, calls } = makeSource([{ status: 201, body: { id: 99, name: "main", enforcement: "active" } }]);
		await source.createRuleset({ name: "main", target: "branch" });
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.body).toEqual({ name: "main", target: "branch" });
	});

	it("updateRuleset → PUT to ruleset id", async () => {
		const { source, calls } = makeSource([{ status: 200, body: { id: 99, name: "main", enforcement: "active" } }]);
		await source.updateRuleset(99, { name: "main" });
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/rulesets/99`);
	});

	it("updateRepoSettings → PATCH /repos/{repo}", async () => {
		const { source, calls } = makeSource([{ status: 200, body: {} }]);
		await source.updateRepoSettings({ allow_squash_merge: true });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}`);
		expect(calls[0]?.body).toEqual({ allow_squash_merge: true });
	});

	it("syncTeams → PUT /orgs/{org}/teams/{slug}/repos/{owner}/{repo}", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		const result = await source.syncTeams(["gatekeepers"]);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(
			`https://api.github.com/orgs/theholocron/teams/gatekeepers/repos/theholocron/holocron`
		);
		expect(calls[0]?.body).toEqual({ permission: "push" });
		expect(result).toBe("1 team synced");
	});

	it("syncDescription → PATCH /repos/{repo} with description", async () => {
		const { source, calls } = makeSource([{ status: 200, body: {} }]);
		const result = await source.syncDescription("A great tool.");
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}`);
		expect(calls[0]?.body).toEqual({ description: "A great tool." });
		expect(result).toBe("description updated");
	});

	it("syncHomepage → PATCH /repos/{repo} with homepage", async () => {
		const { source, calls } = makeSource([{ status: 200, body: {} }]);
		const result = await source.syncHomepage("https://example.com");
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}`);
		expect(calls[0]?.body).toEqual({ homepage: "https://example.com" });
		expect(result).toBe("homepage updated");
	});

	it("enableVulnerabilityAlerts → PUT /vulnerability-alerts", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		await source.enableVulnerabilityAlerts();
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/vulnerability-alerts`);
	});

	it("enableAutomatedSecurityFixes → PUT /automated-security-fixes", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		await source.enableAutomatedSecurityFixes();
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/automated-security-fixes`);
	});

	it("enableSecretScanning → PATCH /repos/{repo} with security_and_analysis", async () => {
		const { source, calls } = makeSource([{ status: 200, body: {} }]);
		await source.enableSecretScanning();
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.body).toEqual({
			security_and_analysis: {
				secret_scanning: { status: "enabled" },
				secret_scanning_push_protection: { status: "enabled" },
				secret_scanning_validity_checks: { status: "enabled" },
				secret_scanning_non_provider_patterns: { status: "enabled" },
			},
		});
	});

	it("enablePrivateVulnerabilityReporting → PUT", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		await source.enablePrivateVulnerabilityReporting();
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/private-vulnerability-reporting`);
	});

	it("protectBranch → PUT /branches/{branch}/protection", async () => {
		const { source, calls } = makeSource([{ status: 200, body: {} }]);
		await source.protectBranch("main", { required_status_checks: null });
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/branches/main/protection`);
		expect(calls[0]?.body).toEqual({ required_status_checks: null });
	});

	it("enableCodeScanning → returns run ID string", async () => {
		const { source } = makeSource([{ status: 201, body: { run_id: 42 } }]);
		expect(await source.enableCodeScanning()).toBe("run 42");
	});

	it("disableDefaultCodeScanning → calls the disable endpoint", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		await source.disableDefaultCodeScanning();
		expect(calls[0]?.url).toMatch(/repos\/.*\/code-scanning\/default-setup/);
	});

	it("enableDependencyGraph calls the GitHub API without throwing", async () => {
		const { source, calls } = makeSource([{ status: 200, body: {} }]);
		await source.enableDependencyGraph();
		expect(calls).toHaveLength(1);
	});

	it("syncProperties → PATCH /repos/{repo}/properties/values", async () => {
		const { source, calls } = makeSource([{ status: 204 }]);
		const result = await source.syncProperties({ team: "infra", env: "prod" });
		expect(calls[0]?.method).toBe("PATCH");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/properties/values`);
		expect(typeof result).toBe("string");
	});

	it("syncTopics → PUT /repos/{repo}/topics", async () => {
		const { source, calls } = makeSource([{ status: 200, body: { names: ["cli", "tool"] } }]);
		const result = await source.syncTopics(["cli", "tool"]);
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`https://api.github.com/repos/${REPO}/topics`);
		expect(calls[0]?.body).toEqual({ names: ["cli", "tool"] });
		expect(typeof result).toBe("string");
	});

	it("syncVariables → reconciles the repository's variables", async () => {
		const { source, calls } = makeSource([
			{ status: 200, body: { total_count: 0, variables: [] } },
			{ status: 201 },
		]);
		expect(await source.syncVariables({ TURBO_TEAM: "iamnewton" })).toBe("1 created, 0 updated, 0 unchanged");
		expect(calls[1]?.url).toBe(`https://api.github.com/repos/${REPO}/actions/variables`);
	});

	it("syncOrgVariables → uses the org client, and says so when there is none", async () => {
		const { fetch, calls } = stubFetch([{ status: 200, body: { total_count: 0, variables: [] } }, { status: 201 }]);
		const orgClient = createGitHubClient({ token: "org-pat", fetch });
		const withOrg = new GitHubSource(createGitHubClient({ token: "pat", fetch: stubFetch([]).fetch }), {
			repo: REPO,
			repoRoot: process.cwd(),
			orgClient,
		});
		await withOrg.syncOrgVariables("theholocron", { A: { value: "1", visibility: "all" } });
		expect(calls[1]?.url).toBe("https://api.github.com/orgs/theholocron/actions/variables");

		const { source } = makeSource([]);
		await expect(source.syncOrgVariables("theholocron", { A: { value: "1", visibility: "all" } })).rejects.toThrow(
			/HOLOCRON_ORG_TOKEN/
		);
	});

	it("syncLabels → syncs canonical labels against the repo", async () => {
		// GET labels, then POST a new one
		const { source, calls } = makeSource([
			{ status: 200, body: [] },
			{ status: 201, body: { id: 1, name: "bug", color: "d73a4a", description: "" } },
		]);
		const result = await source.syncLabels([{ name: "bug", color: "d73a4a", description: "" }], []);
		expect(calls[0]?.url).toMatch(`https://api.github.com/repos/${REPO}/labels`);
		expect(typeof result).toBe("string");
	});
});

describe("GitHubSource — configurePages", () => {
	const PAGES_URL = `https://api.github.com/repos/${REPO}/pages`;

	// configurePages creates its own pagesClient using this.fetchImpl.
	// Pass the same stub fetch to SourceOptions so all calls are intercepted.
	function makeSourceForPages(responses: Parameters<typeof stubFetch>[0]) {
		const { fetch, calls } = stubFetch(responses);
		const rest = createGitHubClient({ token: "admin-pat", fetch });
		const source = new GitHubSource(rest, { repo: REPO, repoRoot: process.cwd(), fetch });
		return { source, calls };
	}

	it("POST then PUT when Pages is not yet enabled", async () => {
		const { source, calls } = makeSourceForPages([
			{ status: 404, body: { message: "Not Found" } },
			{
				status: 201,
				body: { build_type: "workflow", status: "building", https_enforced: false, custom_domain: null },
			},
			{ status: 204 },
		]);
		await source.configurePages!({ build: "workflow" }, "deploy-pat");
		expect(calls[0]?.url).toBe(PAGES_URL);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[1]?.url).toBe(PAGES_URL);
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.body).toMatchObject({ build_type: "workflow" });
		expect(calls[2]?.url).toBe(PAGES_URL);
		expect(calls[2]?.method).toBe("PUT");
		expect(calls[2]?.body).toMatchObject({ build_type: "workflow" });
	});

	it("skips POST when Pages already exists", async () => {
		const { source, calls } = makeSourceForPages([
			{
				status: 200,
				body: { build_type: "workflow", status: "built", https_enforced: false, custom_domain: null },
			},
			{ status: 204 },
		]);
		await source.configurePages!({ build: "workflow" }, "deploy-pat");
		expect(calls).toHaveLength(2);
		expect(calls[0]?.method).toBe("GET");
		expect(calls[1]?.method).toBe("PUT");
	});

	it("includes cname and https_enforced in PUT when provided", async () => {
		const { source, calls } = makeSourceForPages([
			{
				status: 200,
				body: { build_type: "workflow", status: "built", https_enforced: false, custom_domain: null },
			},
			{ status: 204 },
		]);
		await source.configurePages!({ build: "workflow", domain: "docs.theholocron.dev", https: true }, "deploy-pat");
		expect(calls[1]?.body).toMatchObject({
			build_type: "workflow",
			cname: "docs.theholocron.dev",
			https_enforced: true,
		});
	});

	it("omits cname and https_enforced when not provided", async () => {
		const { source, calls } = makeSourceForPages([
			{
				status: 200,
				body: { build_type: "workflow", status: "built", https_enforced: false, custom_domain: null },
			},
			{ status: 204 },
		]);
		await source.configurePages!({ build: "workflow" }, "deploy-pat");
		expect(calls[1]?.body).not.toHaveProperty("cname");
		expect(calls[1]?.body).not.toHaveProperty("https_enforced");
	});

	it("uses legacy build type with gh-pages source for branch", async () => {
		const { source, calls } = makeSourceForPages([
			{ status: 404, body: { message: "Not Found" } },
			{
				status: 201,
				body: { build_type: "legacy", status: "building", https_enforced: false, custom_domain: null },
			},
			{ status: 204 },
		]);
		await source.configurePages!({ build: "branch" }, "deploy-pat");
		expect(calls[1]?.body).toMatchObject({
			build_type: "legacy",
			source: { branch: "gh-pages", path: "/" },
		});
		expect(calls[2]?.body).toMatchObject({
			build_type: "legacy",
			source: { branch: "gh-pages", path: "/" },
		});
	});

	it("uses the deploy token (not the admin token) for Pages API calls", async () => {
		const { source, calls } = makeSourceForPages([
			{
				status: 200,
				body: { build_type: "workflow", status: "built", https_enforced: false, custom_domain: null },
			},
			{ status: 204 },
		]);
		await source.configurePages!({ build: "workflow" }, "deploy-pat-xyz");
		expect(calls[0]?.headers["authorization"]).toBe("Bearer deploy-pat-xyz");
	});
});

describe("GitHubSource — workflow files (local fs)", () => {
	let repoRoot: string;

	beforeEach(async () => {
		repoRoot = await mkdtemp(join(tmpdir(), "holocron-source-"));
	});

	afterEach(async () => {
		await rm(repoRoot, { recursive: true, force: true });
	});

	it("listWorkflowFiles returns [] when .github/workflows is missing", async () => {
		const { source } = makeSource([], repoRoot);
		expect(await source.listWorkflowFiles()).toEqual([]);
	});

	it("listWorkflowFiles returns only .yml/.yaml files, sorted", async () => {
		const dir = join(repoRoot, ".github", "workflows");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "unit-tests.yml"), "name: unit");
		await writeFile(join(dir, "lint.yaml"), "name: lint");
		await writeFile(join(dir, "README.md"), "docs");

		const { source } = makeSource([], repoRoot);
		expect(await source.listWorkflowFiles()).toEqual(["lint.yaml", "unit-tests.yml"]);
	});

	it("readWorkflowFile returns the file contents", async () => {
		const dir = join(repoRoot, ".github", "workflows");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "unit.yml"), "name: unit tests");

		const { source } = makeSource([], repoRoot);
		expect(await source.readWorkflowFile("unit.yml")).toBe("name: unit tests");
	});

	it("readWorkflowFile returns null when the file does not exist", async () => {
		const { source } = makeSource([], repoRoot);
		expect(await source.readWorkflowFile("missing.yml")).toBeNull();
	});

	it("writeWorkflowFile creates .github/workflows if missing", async () => {
		const { source } = makeSource([], repoRoot);
		await source.writeWorkflowFile("lint.yml", "name: lint");
		const written = await readFile(join(repoRoot, ".github", "workflows", "lint.yml"), "utf8");
		expect(written).toBe("name: lint");
	});

	it("removeWorkflowFile deletes an existing file", async () => {
		const dir = join(repoRoot, ".github", "workflows");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "old.yml"), "name: old");

		const { source } = makeSource([], repoRoot);
		await source.removeWorkflowFile("old.yml");
		expect(await source.readWorkflowFile("old.yml")).toBeNull();
	});

	it("removeWorkflowFile is a noop when the file is missing", async () => {
		const { source } = makeSource([], repoRoot);
		await expect(source.removeWorkflowFile("phantom.yml")).resolves.toBeUndefined();
	});

	it("writeRepoFile creates nested directories and writes the file", async () => {
		const { source } = makeSource([], repoRoot);
		await source.writeRepoFile("docs/api/README.md", "# API");
		const written = await readFile(join(repoRoot, "docs/api/README.md"), "utf8");
		expect(written).toBe("# API");
	});

	it("writeWorkflowFile throws when .github/workflows path is occupied by a file", async () => {
		await mkdir(join(repoRoot, ".github"), { recursive: true });
		await writeFile(join(repoRoot, ".github", "workflows"), "I am a file");
		const { source } = makeSource([], repoRoot);
		await expect(source.writeWorkflowFile("lint.yml", "name: lint")).rejects.toThrow(
			/exists but is not a directory/
		);
	});

	it("listWorkflowFiles rethrows non-ENOENT errors", async () => {
		// Putting a file at the workflows path makes readdir throw ENOTDIR, not ENOENT.
		await mkdir(join(repoRoot, ".github"), { recursive: true });
		await writeFile(join(repoRoot, ".github", "workflows"), "not a directory");
		const { source } = makeSource([], repoRoot);
		await expect(source.listWorkflowFiles()).rejects.toThrow();
	});

	it("resolves workflow/repo files against the real git root, not a --cwd subpackage directory (holocron#1072)", async () => {
		// Simulates `holocron repo setup --cwd apps/sentinel` -- the
		// constructor's own opts.repoRoot is the subpackage directory, not
		// the repo root .github/ actually lives at.
		await mkdir(join(repoRoot, ".git"));
		const subpackage = join(repoRoot, "apps", "sentinel");
		await mkdir(subpackage, { recursive: true });

		const { source } = makeSource([], subpackage);

		await source.writeWorkflowFile("delivery.previewDeploy.yml", "name: preview deploy");
		const written = await readFile(join(repoRoot, ".github", "workflows", "delivery.previewDeploy.yml"), "utf8");
		expect(written).toBe("name: preview deploy");
		expect(await source.readWorkflowFile("delivery.previewDeploy.yml")).toBe("name: preview deploy");
		// Not written into the subpackage's own, GitHub-invisible .github/.
		expect(existsSync(join(subpackage, ".github"))).toBe(false);

		await source.writeRepoFile("docs/sentinel.md", "# Sentinel");
		expect(await readFile(join(repoRoot, "docs", "sentinel.md"), "utf8")).toBe("# Sentinel");
	});

	it("readWorkflowFile rethrows non-ENOENT errors", async () => {
		await mkdir(join(repoRoot, ".github"), { recursive: true });
		await writeFile(join(repoRoot, ".github", "workflows"), "not a directory");
		const { source } = makeSource([], repoRoot);
		await expect(source.readWorkflowFile("lint.yml")).rejects.toThrow();
	});

	it("removeWorkflowFile rethrows non-ENOENT errors", async () => {
		await mkdir(join(repoRoot, ".github"), { recursive: true });
		await writeFile(join(repoRoot, ".github", "workflows"), "not a directory");
		const { source } = makeSource([], repoRoot);
		await expect(source.removeWorkflowFile("lint.yml")).rejects.toThrow();
	});
});

describe("GitHubSource — team members and files", () => {
	it("teamMembers maps GitHub's members to string ids and logins", async () => {
		const { source, calls } = makeSource([{ body: [{ id: 5, login: "luke", type: "User" }] }]);
		expect(await source.teamMembers("gatekeepers")).toEqual([{ id: "5", login: "luke" }]);
		expect(calls[0]?.url).toContain("/orgs/theholocron/teams/gatekeepers/members");
	});

	it("readFile decodes the content and returns the sha as the version", async () => {
		const { source, calls } = makeSource([
			{
				body: {
					content: Buffer.from("hello ✓").toString("base64"),
					encoding: "base64",
					sha: "abc",
					name: "a",
					path: "a",
				},
			},
		]);
		expect(await source.readFile("notifications/x.json", "theholocron/.github-private")).toEqual({
			content: "hello ✓",
			version: "abc",
		});
		expect(calls[0]?.url).toContain("/repos/theholocron/.github-private/contents/notifications/x.json");
	});

	it("readFile reads this repo by default and returns null for a file that does not exist", async () => {
		const { source, calls } = makeSource([
			{ status: 404, body: { message: "Not Found" } },
			{ body: { full_name: "theholocron/holocron" } },
		]);
		expect(await source.readFile("x.json")).toBeNull();
		expect(calls[0]?.url).toContain("/repos/theholocron/holocron/contents/x.json");
	});

	it("readFile and writeFile use the user-sync client first, then the org client, then the repo client", async () => {
		const tokens: string[] = [];
		const client = (token: string) =>
			createGitHubClient({
				token,
				fetch: (async (_url: string, init?: RequestInit) => {
					tokens.push(new Headers(init?.headers).get("authorization") ?? "");
					return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
				}) as unknown as typeof fetch,
			});
		const make = (over: { org?: boolean; sync?: boolean }) =>
			new GitHubSource(client("repo"), {
				repo: REPO,
				repoRoot: process.cwd(),
				...(over.org ? { orgClient: client("org") } : {}),
				...(over.sync ? { userSyncClient: client("sync") } : {}),
			});
		for (const [over, expected] of [
			[{ org: true, sync: true }, "sync"],
			[{ org: true }, "org"],
			[{}, "repo"],
		] as const) {
			tokens.length = 0;
			await make(over)
				.readFile("x.json", "theholocron/.github-private")
				.catch(() => undefined);
			await make(over)
				.writeFile("x.json", "{}", { message: "m", repo: "theholocron/.github-private" })
				.catch(() => undefined);
			expect(tokens.length).toBeGreaterThan(0);
			expect(new Set(tokens)).toEqual(new Set([expect.stringContaining(expected)]));
		}
	});

	it("readFile and writeFile say which token permission is missing on a 403", async () => {
		const read = makeSource([{ status: 403, body: {} }]);
		await expect(read.source.readFile("x.json", "theholocron/.github-private")).rejects.toThrow(
			/cannot read files in theholocron\/\.github-private.*Contents: read/
		);
		const write = makeSource([{ status: 403, body: {} }]);
		await expect(
			write.source.writeFile("x.json", "{}", { message: "m", repo: "theholocron/.github-private" })
		).rejects.toThrow(/cannot write files.*read and write/);
		const other = makeSource([{ status: 500, body: {} }]);
		await expect(other.source.writeFile("x.json", "{}", { message: "m" })).rejects.toMatchObject({ status: 500 });
	});

	it("readFile does not mistake a repo the token cannot see for a missing file", async () => {
		const hidden = makeSource([
			{ status: 404, body: {} },
			{ status: 404, body: {} },
		]);
		await expect(hidden.source.readFile("x.json", "theholocron/.github-private")).rejects.toThrow(
			/was not found: it does not exist, or the token cannot see it/
		);
		const broken = makeSource([
			{ status: 404, body: {} },
			{ status: 500, body: {} },
		]);
		await expect(broken.source.readFile("x.json")).rejects.toMatchObject({ status: 500 });
	});

	it("teamMembers asks the organisation it is given, not the repo's owner", async () => {
		const { source, calls } = makeSource([{ body: [] }]);
		await source.teamMembers("gatekeepers", "other-org");
		expect(calls[0]?.url).toContain("/orgs/other-org/teams/gatekeepers/members");
	});

	it("readFile passes any other failure through, and refuses an encoding it cannot decode", async () => {
		const failing = makeSource([{ status: 500, body: {} }]);
		await expect(failing.source.readFile("x.json")).rejects.toMatchObject({ status: 500 });
		const odd = makeSource([{ body: { content: "x", encoding: "none", sha: "s", name: "a", path: "a" } }]);
		await expect(odd.source.readFile("x.json")).rejects.toThrow(/unexpected encoding/);
	});

	it("writeFile sends the text, the message and the version it replaces", async () => {
		const { source, calls } = makeSource([{ body: { content: { sha: "n", path: "p" }, commit: { sha: "c" } } }]);
		await source.writeFile("notifications/x.json", "data", {
			message: "m",
			version: "abc",
			repo: "theholocron/.github-private",
		});
		expect(calls[0]).toMatchObject({ method: "PUT" });
		expect(calls[0]?.url).toContain("/repos/theholocron/.github-private/contents/notifications/x.json");
		expect(calls[0]?.body).toEqual({ message: "m", content: Buffer.from("data").toString("base64"), sha: "abc" });
	});

	it("writeFile creates in this repo when no version or repo is given, and a stale version is refused", async () => {
		const created = makeSource([{ body: { content: { sha: "n", path: "p" }, commit: { sha: "c" } } }]);
		await created.source.writeFile("x.json", "d", { message: "m" });
		expect(created.calls[0]?.body).not.toHaveProperty("sha");
		expect(created.calls[0]?.url).toContain("/repos/theholocron/holocron/contents/x.json");
		const stale = makeSource([{ status: 409, body: {} }]);
		await expect(stale.source.writeFile("x.json", "d", { message: "m", version: "old" })).rejects.toMatchObject({
			status: 409,
		});
	});
});
