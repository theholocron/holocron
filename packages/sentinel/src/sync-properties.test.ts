import { createGitHubClient } from "@theholocron/github-client";
import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { syncPropertiesFromConfig } from "./sync-properties.js";

function b64(content: string): string {
	return Buffer.from(content, "utf8").toString("base64");
}

function pkgJsonResponse(pkg: unknown, status = 200) {
	return { status, body: { content: b64(JSON.stringify(pkg)) } };
}

function makeClient(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return { client: createGitHubClient({ token: "ghp_test", fetch }), calls };
}

describe("syncPropertiesFromConfig — single-package repo", () => {
	it("sets monorepo:false and derives profile/stack/capabilities/compliance from a minimal config", async () => {
		const { client, calls } = makeClient([
			{ status: 404 }, // pnpm-workspace.yaml — not a monorepo
			pkgJsonResponse({ name: "demo", private: true }), // root package.json
			{ status: 204 }, // setProperties
		]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: { providers: {} },
		});

		expect(result.properties).toMatchObject({
			monorepo: "false",
			holocron_profile: "app",
			holocron_stack: [],
			holocron_capabilities: [],
			holocron_compliance: "non-compliant",
		});
		expect(calls[0]?.url).toContain("pnpm-workspace.yaml");
		expect(calls[1]?.url).toContain("/contents/package.json");
		expect(calls[2]?.method).toBe("PATCH");
		expect(calls[2]?.url).toContain("/properties/values");
	});

	it("derives holocron_capabilities and holocron_compliance from providers", async () => {
		const { client } = makeClient([{ status: 404 }, pkgJsonResponse({ name: "demo" }), { status: 204 }]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: { providers: { source: "github", ci: "github" } },
		});

		expect(result.properties["holocron_capabilities"]).toEqual(["ci", "source"]);
		expect(result.properties["holocron_compliance"]).toBe("compliant");
	});

	it("handles a missing root package.json (404) without failing", async () => {
		const { client } = makeClient([{ status: 404 }, { status: 404 }, { status: 204 }]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		});

		expect(result.properties["holocron_stack"]).toEqual([]);
	});

	it("falls back to the full repo string as repoName when it has no owner/name slash", async () => {
		const { client } = makeClient([{ status: 404 }, pkgJsonResponse({ name: "demo" }), { status: 204 }]);

		// deriveProfile's "-template" repo-name check is the only place repoName
		// is read — a malformed repo string still resolves to *some* profile
		// rather than throwing.
		const result = await syncPropertiesFromConfig({
			client,
			repo: "no-slash-here",
			defaultBranch: "main",
			config: {},
		});

		expect(result.properties["holocron_profile"]).toBeDefined();
	});

	it("detects stack dependencies from the root package.json", async () => {
		const { client } = makeClient([
			{ status: 404 },
			pkgJsonResponse({ name: "demo", dependencies: { next: "^15.0.0" }, devDependencies: { vitest: "^4.0.0" } }),
			{ status: 204 },
		]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		});

		expect(result.properties["holocron_stack"]).toEqual(["next", "vitest"]);
	});
});

describe("syncPropertiesFromConfig — manual properties", () => {
	it("sets every manual field when present in config.repo", async () => {
		const { client, calls } = makeClient([{ status: 404 }, { status: 404 }, { status: 204 }]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {
				repo: {
					protection: "strict",
					properties: {
						lifecycle: "active",
						open_source: true,
						runtime_environment: "node",
						uses_external_packages: false,
					},
				},
			},
		});

		expect(result.properties).toMatchObject({
			holocron_branch_protection_level: "strict",
			lifecycle: "active",
			open_source: "true",
			runtime_environment: "node",
			uses_external_packages: "false",
		});
		const patchBody = calls[2]?.body as { properties: Array<{ property_name: string; value: string }> };
		expect(patchBody.properties).toEqual(expect.arrayContaining([{ property_name: "lifecycle", value: "active" }]));
	});

	it("omits holocron_branch_protection_level when protection is 'none'", async () => {
		const { client } = makeClient([{ status: 404 }, { status: 404 }, { status: 204 }]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: { repo: { protection: "none" } },
		});

		expect(result.properties["holocron_branch_protection_level"]).toBeUndefined();
	});

	it("omits holocron_branch_protection_level when protection is absent", async () => {
		const { client } = makeClient([{ status: 404 }, { status: 404 }, { status: 204 }]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		});

		expect(result.properties["holocron_branch_protection_level"]).toBeUndefined();
	});

	it("omits individual manual properties left unset in config.repo.properties", async () => {
		const { client } = makeClient([{ status: 404 }, { status: 404 }, { status: 204 }]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: { repo: { properties: { lifecycle: "experimental" } } },
		});

		expect(result.properties).toMatchObject({ lifecycle: "experimental" });
		expect(result.properties["open_source"]).toBeUndefined();
		expect(result.properties["runtime_environment"]).toBeUndefined();
		expect(result.properties["uses_external_packages"]).toBeUndefined();
	});
});

describe("syncPropertiesFromConfig — monorepo", () => {
	it("walks the default branch's tree to find workspace package.json files and derives 'platform' for a published CLI", async () => {
		const { client, calls } = makeClient([
			{ status: 200, body: { content: b64("") } }, // pnpm-workspace.yaml — present, is a monorepo
			pkgJsonResponse({ name: "root", private: true }), // root package.json
			{ status: 200, body: { ref: "refs/heads/main", object: { sha: "commit-sha" } } }, // getRef
			{ status: 200, body: { sha: "commit-sha", tree: { sha: "tree-sha" } } }, // getCommit
			{
				status: 200,
				body: {
					sha: "tree-sha",
					truncated: false,
					tree: [
						{ path: "packages/cli/package.json", sha: "a", type: "blob" },
						{ path: "packages/lib/package.json", sha: "b", type: "blob" },
						{ path: "packages/cli", sha: "c", type: "tree" }, // directory entry — filtered out
						{ path: "README.md", sha: "d", type: "blob" }, // non-package.json — filtered out
						{ path: "not-packages/x/package.json", sha: "e", type: "blob" }, // wrong root dir — filtered out
					],
				},
			},
			pkgJsonResponse({ name: "@acme/cli", bin: "./dist/cli.js", private: false }), // packages/cli
			pkgJsonResponse({ name: "@acme/lib", private: false }), // packages/lib
			{ status: 204 }, // setProperties
		]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		});

		expect(result.properties["monorepo"]).toBe("true");
		expect(result.properties["holocron_profile"]).toBe("platform");
		expect(calls[4]?.url).toContain("recursive=1");
		expect(calls[5]?.url).toContain("/contents/packages/cli/package.json");
		expect(calls[6]?.url).toContain("/contents/packages/lib/package.json");
	});

	it("resolves 'library' for a monorepo with no published CLI", async () => {
		const { client } = makeClient([
			{ status: 200, body: { content: b64("") } },
			pkgJsonResponse({ name: "root", private: true }),
			{ status: 200, body: { ref: "refs/heads/main", object: { sha: "commit-sha" } } },
			{ status: 200, body: { sha: "commit-sha", tree: { sha: "tree-sha" } } },
			{
				status: 200,
				body: {
					sha: "tree-sha",
					truncated: false,
					tree: [{ path: "packages/lib/package.json", sha: "a", type: "blob" }],
				},
			},
			pkgJsonResponse({ name: "@acme/lib", private: false }),
			{ status: 204 },
		]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		});

		expect(result.properties["holocron_profile"]).toBe("library");
	});

	it("skips a workspace package.json that 404s without failing the whole sync", async () => {
		const { client } = makeClient([
			{ status: 200, body: { content: b64("") } },
			pkgJsonResponse({ name: "root", private: true }),
			{ status: 200, body: { ref: "refs/heads/main", object: { sha: "commit-sha" } } },
			{ status: 200, body: { sha: "commit-sha", tree: { sha: "tree-sha" } } },
			{
				status: 200,
				body: {
					sha: "tree-sha",
					truncated: false,
					tree: [{ path: "packages/ghost/package.json", sha: "a", type: "blob" }],
				},
			},
			{ status: 404 }, // packages/ghost/package.json — gone by the time we fetch it
			{ status: 204 },
		]);

		const result = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		});

		// No published (non-private) workspace package found → falls through to root-package branch.
		expect(result.properties["holocron_profile"]).toBe("app");
	});
});

describe("syncPropertiesFromConfig — error propagation", () => {
	it("propagates a non-404 error while checking for pnpm-workspace.yaml", async () => {
		const { client } = makeClient([{ status: 500, body: { message: "boom" } }]);

		const err = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
	});

	it("propagates a non-404 error while fetching the root package.json", async () => {
		const { client } = makeClient([{ status: 404 }, { status: 500, body: { message: "boom" } }]);

		const err = await syncPropertiesFromConfig({
			client,
			repo: "acme/demo",
			defaultBranch: "main",
			config: {},
		}).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(Error);
	});
});
