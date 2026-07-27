import { mkdir,mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProviderApiError } from "@theholocron/cli";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GitHubSource } from "../capabilities/source.js";
import { createGitHubClient } from "../rest.js";
import { stubFetch } from "./helpers.js";

const REPO = "theholocron/holocron";

function makeSource(responses: Parameters<typeof stubFetch>[0], repoRoot: string = process.cwd()) {
	const { fetch, calls } = stubFetch(responses);
	const rest = createGitHubClient({ token: "pat", fetch });
	const source = new GitHubSource(rest, { repo: REPO, repoRoot });
	return { source, calls };
}

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
});
