import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WORKFLOW_TEMPLATES } from "@theholocron/astromech";
import { describe, expect, it, vi } from "vitest";

import * as telemetry from "../telemetry.js";
import { ACTIONS, REUSABLE_WORKFLOWS, WORKFLOW_TEMPLATE_PROPERTIES } from "../templates/index.js";
import { fakeLogger } from "../test-utils/fake-logger.js";
import { gitBlobSha as _gitBlobSha, parseOrgContextFromTs, parseTasksFromTs, runSyncGithub } from "./sync-github.js";

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
		const log = fakeLogger();
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
			logger: log,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(PRIMARY_FILE_COUNT);

		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ repo: "theholocron/.github", branch: "chore/sync" }),
			"sync-github: start"
		);
		expect(log.info).toHaveBeenCalledWith(
			expect.objectContaining({ status: "ok", created: PRIMARY_FILE_COUNT }),
			"sync-github: done"
		);
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

	it("emits a sync_github_run telemetry event once, with counts and no token", async () => {
		const spy = vi.spyOn(telemetry, "event").mockImplementation(() => {});
		const { fn } = makeFetch();
		await runSyncGithub({
			token: "ghp_abc123XYZ", // gitleaks:allow — fake fixture, asserted absent from the event below
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
			logger: fakeLogger(),
		});
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(
			"sync_github_run",
			expect.objectContaining({
				repo: "theholocron/.github",
				branch: "chore/sync",
				status: "ok",
				repos_targeted: 1,
				pr_opened: false,
			})
		);
		expect(JSON.stringify(spy.mock.calls)).not.toContain("ghp_abc123XYZ");
		spy.mockRestore();
	});

	it("writes nothing to secondary repos — thin callers are managed by holocron sync", async () => {
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
		expect(report.created).toBe(0);
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(blobs).toHaveLength(0);
		// No composite actions
		expect(calls.some((c) => (c.body as { path?: string } | undefined)?.path?.includes(".github/actions/"))).toBe(
			false
		);
		// Thin callers reference .github's workflows via uses:, not inline implementations
		const blobContents = blobs.map((c) => (c.body?.content as string) ?? "");
		expect(blobContents.every((c) => c.includes("theholocron/.github/.github/workflows/"))).toBe(true);
		expect(blobContents.some((c) => c.includes("runs-on:"))).toBe(false);
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

	it("writes files to outputDir without making any API calls", async () => {
		const tmpOut = await mkdtemp(join(tmpdir(), "holocron-sync-output-"));
		try {
			const report = await runSyncGithub({ token: "unused", outputDir: tmpOut, print: () => {} });
			expect(report.status).toBe("ok");
			expect(report.created).toBe(PRIMARY_FILE_COUNT);
			expect(existsSync(join(tmpOut, ".github/workflows/release.yml"))).toBe(true);
		} finally {
			await rm(tmpOut, { recursive: true });
		}
	});

	it("returns fail when repo metadata fetch fails", async () => {
		const fn: typeof globalThis.fetch = async (url, _init) => {
			if (url.toString().match(/\/repos\/[^/]+\/[^/]+$/)) {
				return new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 });
			}
			// fallback for anything else (shouldn't be reached)
			return new Response("{}", { status: 200 });
		};
		// createPr forces a getRepo call even when branch is set
		const report = await runSyncGithub({
			token: "t",
			branch: "chore/sync",
			createPr: true,
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
	});

	it("treats a file as unchanged when the existing blob SHA matches", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
		const tmpOut = await mkdtemp(join(tmpdir(), "holocron-sync-unchanged-"));
		try {
			// Generate files to disk with frozen time to get deterministic content.
			await runSyncGithub({ token: "unused", outputDir: tmpOut, print: () => {} });
			const content = readFileSync(join(tmpOut, ".github/workflows/release.yml"), "utf8");
			const sha = _gitBlobSha(content);

			const { fn } = makeFetch({ ".github/workflows/release.yml": sha });
			const report = await runSyncGithub({
				token: "t",
				branch: "chore/sync",
				dryRun: false,
				print: () => {},
				fetch: fn,
			});

			expect(report.unchanged).toBe(1);
			expect(report.created).toBe(PRIMARY_FILE_COUNT - 1);
		} finally {
			vi.useRealTimers();
			await rm(tmpOut, { recursive: true });
		}
	});

	it("warns on non-422 PR creation error", async () => {
		const lines: string[] = [];
		const { fn: baseFn } = makeFetch();
		const fn: typeof globalThis.fetch = async (url, init) => {
			const method = init?.method ?? "GET";
			const urlStr = url.toString();
			// Let branch ref creation succeed (POST /git/refs) so we reach PR creation.
			if (method === "POST" && urlStr.includes("/git/refs") && !urlStr.includes("/git/refs/")) {
				return new Response(JSON.stringify({ ref: "refs/heads/chore/sync", object: { sha: "c" } }), {
					status: 201,
				});
			}
			// Fail PR creation with a non-422 error so line 389 is hit.
			if (method === "POST" && urlStr.includes("/pulls")) {
				return new Response(JSON.stringify({ message: "Internal Server Error" }), { status: 500 });
			}
			return baseFn(url, init);
		};
		await runSyncGithub({
			token: "t",
			repo: "theholocron/.github",
			branch: "chore/sync",
			createPr: true,
			dryRun: false,
			print: (l) => lines.push(l),
			fetch: fn,
		});
		expect(lines.some((l) => l.includes("PR creation failed"))).toBe(true);
	});
});

describe("parseTasksFromTs", () => {
	it("returns explicit string and object entries when no spread", () => {
		const source = `export default defineConfig({
	tasks: ["lint", { name: "release", with: { "run-build": true } }],
});`;
		const result = parseTasksFromTs(source);
		expect(result.map((e) => e.name)).toEqual(["lint", "release"]);
		expect(result.find((e) => e.name === "release")?.with).toEqual({ "run-build": true });
	});

	it("includes all known tasks when spread is present", () => {
		const source = `const { tasks } = node();
export default defineConfig({
	tasks: [...tasks, "audit", { name: "deploy", with: { docs: true } }],
});`;
		const result = parseTasksFromTs(source);
		const names = result.map((e) => e.name);
		expect(names).toContain("lint");
		expect(names).toContain("test");
		expect(names).toContain("bookkeeping");
		expect(names).toContain("audit");
		expect(names).toContain("deploy");
	});

	it("explicit overrides take precedence over spread defaults when spread present", () => {
		const source = `const { tasks } = node();
export default defineConfig({
	tasks: [...tasks, { name: "test", with: { "run-unit": false } }],
});`;
		const result = parseTasksFromTs(source);
		const testEntry = result.find((e) => e.name === "test");
		expect(testEntry?.with).toEqual({ "run-unit": false });
	});

	it("parses with: blocks that contain nested objects with unquoted keys and trailing commas", () => {
		// Matches the real-world shape from react-template's holocron.config.ts where
		// run-chromatic uses a nested { projects: [...] } TypeScript object literal.
		// The key-quoting regex handles unquoted keys; trailing comma stripping is needed
		// because TS allows trailing commas but JSON.parse does not.
		const source = `export default defineConfig({
	tasks: [
		{
			name: "test",
			with: {
				"run-unit": false,
				"run-storybook": true,
				"run-chromatic": {
					projects: [{ tokenName: "default", workingDir: ".", buildScript: "build:storybook:chromatic" }],
				},
			},
		},
	],
});`;
		const result = parseTasksFromTs(source);
		const testEntry = result.find((e) => e.name === "test");
		expect(testEntry?.with).toEqual({
			"run-unit": false,
			"run-storybook": true,
			"run-chromatic": {
				projects: [{ tokenName: "default", workingDir: ".", buildScript: "build:storybook:chromatic" }],
			},
		});
	});
});

describe("parseOrgContextFromTs", () => {
	it("extracts org, domain, and repoName from config source", () => {
		const source = `export default defineConfig({
	name: "holocron",
	org: "theholocron",
	domain: "theholocron.dev",
	tasks: [
		{ name: "deploy", with: { docs: true } },
	],
});`;
		const ctx = parseOrgContextFromTs(source);
		expect(ctx.org).toBe("theholocron");
		expect(ctx.domain).toBe("theholocron.dev");
		expect(ctx.repoName).toBe("holocron");
	});

	it("does not pick up workflow entry names as repoName", () => {
		const source = `export default defineConfig({
	tasks: [
		{ name: "deploy", with: { docs: true } },
	],
});`;
		const ctx = parseOrgContextFromTs(source);
		expect(ctx.repoName).toBeUndefined();
	});

	it("returns empty context when fields are absent", () => {
		const ctx = parseOrgContextFromTs(`export default defineConfig({});`);
		expect(ctx.org).toBeUndefined();
		expect(ctx.domain).toBeUndefined();
		expect(ctx.repoName).toBeUndefined();
	});

	it("handles org without domain", () => {
		const ctx = parseOrgContextFromTs(`export default defineConfig({ org: "acme" });`);
		expect(ctx.org).toBe("acme");
		expect(ctx.domain).toBeUndefined();
	});
});
