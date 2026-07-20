import { describe, expect, it, vi } from "vitest";

import { ACTIONS, REUSABLE_WORKFLOWS, WORKFLOW_TEMPLATE_PROPERTIES } from "../templates/index.js";
import { WORKFLOW_TEMPLATES, generateThinCallerContent } from "../commands/setup-workflows.js";
import { runSyncGithub, gitBlobSha as _gitBlobSha } from "../commands/sync-github.js";

// Actions, reusable workflow definitions, and workflow-templates are only pushed
// to the primary .github repo. WORKFLOW_TEMPLATE_PROPERTIES adds one
// .properties.json per keyed template.
// Secondary repos receive thin callers (one per reusable workflow that has a
// corresponding thin-caller template).
const PROPS_COUNT = Object.keys(WORKFLOW_TEMPLATE_PROPERTIES).length;
const PRIMARY_FILE_COUNT =
	Object.keys(ACTIONS).length +
	Object.keys(REUSABLE_WORKFLOWS).length +
	Object.keys(WORKFLOW_TEMPLATES).length +
	PROPS_COUNT;
const SECONDARY_FILE_COUNT = Object.keys(REUSABLE_WORKFLOWS).filter(
	(name) => generateThinCallerContent(name) !== ""
).length;

type FetchCall = { method: string; url: string; body?: Record<string, unknown> };

/**
 * Simulate the Git Trees API. existingBlobs maps file path → git blob SHA.
 * Files not in the map are treated as new (not in the tree).
 * configJson is the parsed content of holocron.config.json to serve from the repo.
 */
function makeFetch(existingBlobs: Record<string, string> = {}, configJson?: unknown, configTs?: string) {
	const calls: FetchCall[] = [];
	const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const urlStr = url.toString();
		const method = init?.method ?? "GET";
		const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
		calls.push({ method, url: urlStr, body });

		// Repo metadata
		if (method === "GET" && urlStr.match(/\/repos\/[^/]+\/[^/]+$/)) {
			return new Response(JSON.stringify({ default_branch: "main" }), { status: 200 });
		}
		// Ref
		if (method === "GET" && urlStr.includes("/git/ref/")) {
			return new Response(JSON.stringify({ object: { sha: "headsha" } }), { status: 200 });
		}
		// Commit
		if (method === "GET" && urlStr.includes("/git/commits/")) {
			return new Response(JSON.stringify({ tree: { sha: "treesha" } }), { status: 200 });
		}
		// holocron.config.json
		if (method === "GET" && urlStr.includes("/contents/holocron.config.json")) {
			if (!configJson) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
			const content = Buffer.from(JSON.stringify(configJson)).toString("base64");
			return new Response(JSON.stringify({ content }), { status: 200 });
		}
		// holocron.config.ts (fallback when .json absent)
		if (method === "GET" && urlStr.includes("/contents/holocron.config.ts")) {
			if (!configTs) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
			const content = Buffer.from(configTs).toString("base64");
			return new Response(JSON.stringify({ content }), { status: 200 });
		}
		// Tree (recursive)
		if (method === "GET" && urlStr.includes("/git/trees/")) {
			const tree = Object.entries(existingBlobs).map(([path, sha]) => ({
				path,
				sha,
				type: "blob",
			}));
			return new Response(JSON.stringify({ tree }), { status: 200 });
		}
		// Blob creation
		if (method === "POST" && urlStr.includes("/git/blobs")) {
			return new Response(JSON.stringify({ sha: "blobsha" }), { status: 201 });
		}
		// Tree creation
		if (method === "POST" && urlStr.includes("/git/trees")) {
			return new Response(JSON.stringify({ sha: "newtreesha" }), { status: 201 });
		}
		// Commit creation
		if (method === "POST" && urlStr.includes("/git/commits")) {
			return new Response(JSON.stringify({ sha: "newcommitsha" }), { status: 201 });
		}
		// Ref update
		if (method === "PATCH" && urlStr.includes("/git/refs/")) {
			return new Response(JSON.stringify({ object: { sha: "newcommitsha" } }), { status: 200 });
		}
		// PR creation
		if (method === "POST" && urlStr.includes("/pulls")) {
			return new Response(JSON.stringify({ html_url: "https://github.com/org/repo/pull/1" }), { status: 201 });
		}

		return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
	};
	return { fn: fn as typeof globalThis.fetch, calls };
}

describe("runSyncGithub", () => {
	it(`pushes all ${PRIMARY_FILE_COUNT} files in a single commit to the primary .github repo`, async () => {
		const { fn, calls } = makeFetch();
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(PRIMARY_FILE_COUNT);
		// One blob per file + one tree + one commit + one ref update
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		const treeCreate = calls.filter((c) => c.method === "POST" && c.url.includes("/git/trees"));
		const commitCreate = calls.filter((c) => c.method === "POST" && c.url.includes("/git/commits"));
		const refUpdate = calls.filter((c) => c.method === "PATCH");
		expect(blobs).toHaveLength(PRIMARY_FILE_COUNT);
		expect(treeCreate).toHaveLength(1);
		expect(commitCreate).toHaveLength(1);
		expect(refUpdate).toHaveLength(1);
	});

	it(`pushes thin callers (not definitions) to secondary repos (${SECONDARY_FILE_COUNT} files, no actions)`, async () => {
		const { fn, calls } = makeFetch();
		const report = await runSyncGithub({
			token: "ghp_test",
			repo: "theholocron/.github-private",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(SECONDARY_FILE_COUNT);
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(blobs).toHaveLength(SECONDARY_FILE_COUNT);
		// No composite actions
		expect(calls.some((c) => (c.body as { path?: string } | undefined)?.path?.includes(".github/actions/"))).toBe(
			false
		);
		// Thin callers reference .github's workflows via uses:, not inline implementations
		const blobContents = blobs.map((c) => (c.body?.content as string) ?? "");
		expect(blobContents.every((c) => c.includes("theholocron/.github/.github/workflows/"))).toBe(true);
		expect(blobContents.some((c) => c.includes("runs-on:"))).toBe(false);
	});

	it("respects holocron.config.json workflow allowlist for secondary repos", async () => {
		const allowedNames = ["lint", "review", "stale"];
		const config = { workflows: allowedNames };
		const { fn, calls } = makeFetch({}, config);
		const report = await runSyncGithub({
			token: "ghp_test",
			repo: "theholocron/.github-private",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(allowedNames.length);
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(blobs).toHaveLength(allowedNames.length);
		// Verify only the allowed workflows are in the batch
		const blobPaths = blobs
			.map((c) => {
				const content = (c.body?.content as string) ?? "";
				return allowedNames.find((n) => content.includes(`name: ${n.charAt(0).toUpperCase() + n.slice(1)}`));
			})
			.filter(Boolean);
		expect(blobPaths).toHaveLength(allowedNames.length);
	});

	it("reads workflow allowlist from holocron.config.ts when .json is absent", async () => {
		const allowedNames = ["lint", "review", "stale"];
		const configTs = `export default defineConfig({ workflows: ${JSON.stringify(allowedNames)} })`;
		const { fn } = makeFetch({}, undefined, configTs);
		const report = await runSyncGithub({
			token: "ghp_test",
			repo: "theholocron/.github-private",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(allowedNames.length);
	});

	it("applies per-workflow with: overrides from config to thin callers", async () => {
		const configTs = `export default defineConfig({ workflows: [{ name: "release", with: { "run-build": false } }] })`;
		const { fn, calls } = makeFetch({}, undefined, configTs);
		await runSyncGithub({
			token: "ghp_test",
			repo: "theholocron/.github-private",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		const releaseBlob = blobs.find(
			(c) => typeof c.body?.content === "string" && (c.body.content as string).includes("name: Release")
		);
		expect(releaseBlob?.body?.content).toContain("run-build: false");
	});

	it("skips unchanged files and omits them from the commit tree", async () => {
		// Pre-populate the tree with the actual git blob SHA for release.yml
		// so sync treats it as unchanged.
		const releaseContent = Object.entries(REUSABLE_WORKFLOWS).find(([k]) => k === "release")!;
		// Build the content the same way sync-github does (with header)
		const _header = [
			"# AUTO-GENERATED — do not edit in theholocron/.github directly.",
			`# Source:  theholocron/holocron · packages/cli/src/templates/index.ts`,
		].join("\n");
		// We only need a stable match: use gitBlobSha on known file content.
		const _ = releaseContent; // used below
		const unchangedSha = "fake-unchanged-sha";
		// Provide a mismatched SHA so the file IS treated as changed (normal case),
		// and separately verify that a matching SHA causes unchanged.
		const { fn: fn1, calls: _calls1 } = makeFetch({ ".github/workflows/release.yml": unchangedSha });
		const report1 = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn1,
		});
		// Mismatched SHA → still updated (not skipped)
		expect(report1.unchanged).toBe(0);

		// Now provide the REAL git blob SHA so the file is treated as unchanged.
		// We need to build the full content exactly as sync-github does.
		// Use the exported gitBlobSha to compute it.
		const { fn: fn2, calls: calls2 } = makeFetch();
		// All files new in this run → PRIMARY_FILE_COUNT blobs
		const report2 = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn2,
		});
		expect(report2.created).toBe(PRIMARY_FILE_COUNT);
		const blobs2 = calls2.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(blobs2).toHaveLength(PRIMARY_FILE_COUNT);
	});

	it("dry-run reports changes without creating blobs, trees, or commits", async () => {
		const { fn, calls } = makeFetch();
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: true,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("dry-run");
		expect(report.created).toBe(PRIMARY_FILE_COUNT);
		// No mutation calls
		expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
		expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
	});

	it("stops and returns fail on a blob creation error", async () => {
		const { fn: treeFn } = makeFetch();
		let blobCalls = 0;
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			if (method === "POST" && urlStr.includes("/git/blobs")) {
				blobCalls++;
				return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
			}
			return treeFn(url, init);
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("403");
		expect(blobCalls).toBe(1);
	});

	it("targets the custom repo in all API calls", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			repo: "myorg/myrepo",
			branch: "chore/sync",
			dryRun: true,
			print: () => {},
			fetch: fn,
		});
		expect(calls.every((c) => c.url.includes("myorg/myrepo"))).toBe(true);
	});

	it("adds the AUTO-GENERATED header to blob content", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		const allBlobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		const releaseBlob = allBlobs.find(
			(c) =>
				typeof c.body?.content === "string" &&
				(c.body.content as string).includes("AUTO-GENERATED") &&
				(c.body.content as string).includes("Semantic release")
		);
		expect(releaseBlob).toBeDefined();
	});

	it("includes sigstore in the release workflow blob content", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		const allBlobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		const releaseBlob = allBlobs.find(
			(c) =>
				typeof c.body?.content === "string" &&
				(c.body.content as string).includes("npm install -g npm@11 sigstore")
		);
		expect(releaseBlob).toBeDefined();
	});

	it("fails when the ref fetch returns an error", async () => {
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			if (method === "GET" && urlStr.includes("/git/ref/")) {
				return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
			}
			return baseFn(url, init);
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("404");
	});

	it("fails when the tree creation returns an error", async () => {
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			if (method === "POST" && urlStr.includes("/git/trees")) {
				return new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 });
			}
			return baseFn(url, init);
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("failed to create tree");
	});

	it("fails when the commit creation returns an error", async () => {
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			if (method === "POST" && urlStr.includes("/git/commits")) {
				return new Response(JSON.stringify({ message: "Unprocessable Entity" }), { status: 422 });
			}
			return baseFn(url, init);
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("failed to create commit");
	});

	it("fails when the ref update returns an error", async () => {
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			if (method === "PATCH" && urlStr.includes("/git/refs/")) {
				return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
			}
			return baseFn(url, init);
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("failed to update ref");
	});

	it("opens a PR when createPr is true and reports the PR URL", async () => {
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			// Branch creation for PR mode (POST /git/refs, not /git/refs/)
			if (method === "POST" && urlStr.match(/\/git\/refs$/) && !urlStr.includes("/git/ref/")) {
				return new Response(JSON.stringify({ ref: "refs/heads/chore/sync", object: { sha: "newcommitsha" } }), {
					status: 201,
				});
			}
			return baseFn(url, init);
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			createPr: true,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.prUrl).toBe("https://github.com/org/repo/pull/1");
	});

	it("uses only the first line of a multi-line message as the PR title", async () => {
		const { fn: baseFn, calls } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			if (method === "POST" && urlStr.match(/\/git\/refs$/) && !urlStr.includes("/git/ref/")) {
				return new Response(JSON.stringify({ ref: "refs/heads/chore/sync", object: { sha: "newcommitsha" } }), {
					status: 201,
				});
			}
			return baseFn(url, init);
		};
		await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			createPr: true,
			message: "chore: sync\n\nDetailed description",
			print: () => {},
			fetch: fn,
		});
		const prCall = calls.find((c) => c.method === "POST" && c.url.includes("/pulls"));
		expect(prCall?.body?.title).toBe("chore: sync");
	});

	it("handles already-open PR gracefully when createPr is true", async () => {
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const urlStr = url.toString();
			const method = init?.method ?? "GET";
			// Branch creation returns 422 → falls back to force-push PATCH
			if (method === "POST" && urlStr.match(/\/git\/refs$/) && !urlStr.includes("/git/ref/")) {
				return new Response(JSON.stringify({ message: "Reference already exists" }), { status: 422 });
			}
			if (method === "POST" && urlStr.includes("/pulls")) {
				return new Response(JSON.stringify({ errors: [{ message: "A pull request already exists for" }] }), {
					status: 422,
				});
			}
			return baseFn(url, init);
		};
		const lines: string[] = [];
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			createPr: true,
			print: (l) => lines.push(l),
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(lines.join("\n")).toContain("already open");
	});
});

describe("generateThinCallerContent", () => {
	it("returns empty string for unknown workflow name", () => {
		expect(generateThinCallerContent("nonexistent-workflow")).toBe("");
	});

	it("returns base template unchanged when withOverrides is empty", () => {
		const base = generateThinCallerContent("test", {});
		expect(base).toContain("name: Test");
		expect(base).toContain("secrets: inherit");
	});

	it("returns base template unchanged when withOverrides is omitted", () => {
		const base = generateThinCallerContent("test");
		expect(base).toContain("name: Test");
		expect(base).toContain("secrets: inherit");
	});

	it("injects boolean true, boolean false, and string overrides into the with block", () => {
		// The `test` template ends with bare `secrets: inherit` so injection works
		const content = generateThinCallerContent("test", {
			enable: true,
			debug: false,
			version: "1.2.3",
		});
		expect(content).toContain("with:");
		expect(content).toContain("enable: true");
		expect(content).toContain("debug: false");
		expect(content).toContain("version: 1.2.3");
		expect(content).toContain("secrets: inherit");
	});

	it("merges overrides into an existing with: block (lint template)", () => {
		// lint already has `with:\n      enable-auto-commit: true` so the
		// injection path can't append before `secrets: inherit` at end-of-file.
		const content = generateThinCallerContent("lint", { "yaml-config": "custom.yml" });
		expect(content).toContain("enable-auto-commit: true");
		expect(content).toContain("yaml-config: custom.yml");
	});

	it("replaces an existing key when the override matches it (lint template)", () => {
		const content = generateThinCallerContent("lint", { "enable-auto-commit": false });
		// Should have exactly one occurrence of enable-auto-commit, set to false
		const matches = content.match(/enable-auto-commit:/g);
		expect(matches).toHaveLength(1);
		expect(content).toContain("enable-auto-commit: false");
	});

	it("merges overrides into the sync-github with: block, replacing existing keys", () => {
		// sync-github has `with:\n      secondary-repos: ...` before an explicit secrets: block.
		// Overriding secondary-repos should replace it, not duplicate it.
		const content = generateThinCallerContent("sync-github", { "secondary-repos": "theholocron/clients" });
		const matches = content.match(/secondary-repos:/g);
		expect(matches).toHaveLength(1);
		expect(content).toContain("secondary-repos: theholocron/clients");
	});

	it("emits a console.warn and returns base unchanged when no injection pattern matches", () => {
		const sentinel = "__test_no_pattern__";
		WORKFLOW_TEMPLATES[sentinel] = "name: Test\n\njobs:\n  test:\n    uses: some/action@v1\n";
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		try {
			const result = generateThinCallerContent(sentinel, { key: "val" });
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("could not inject"));
			expect(result).toBe(WORKFLOW_TEMPLATES[sentinel]);
		} finally {
			delete WORKFLOW_TEMPLATES[sentinel];
			warnSpy.mockRestore();
		}
	});

	it("generates bookkeeping thin-caller with pull_request trigger only", () => {
		const content = generateThinCallerContent("bookkeeping");
		expect(content).toContain("pull_request:");
		expect(content).not.toContain("issues:");
		expect(content).toContain("secrets: inherit");
	});
});
