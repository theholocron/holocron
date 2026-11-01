import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	frozenReusablePaths,
	REUSABLE_ACTIONS,
	REUSABLE_WORKFLOWS,
	reusableTemplates,
	WORKFLOW_TEMPLATE_PROPERTIES,
	WORKFLOW_TEMPLATES,
} from "@theholocron/astromech";
import { fakeLogger } from "@theholocron/observability/testing";
import { describe, expect, it, vi } from "vitest";

import * as telemetry from "../../observability/telemetry/index.js";
import { gitBlobSha as _gitBlobSha, runSyncGithub } from "./sync-github.js";

// Actions, reusable workflow definitions, and workflow-templates are only pushed
// to the primary .github repo. WORKFLOW_TEMPLATE_PROPERTIES adds one
// .properties.json per keyed template. Secondary repos get nothing —
// their thin callers are managed by `holocron repo sync --steps workflows`.
const PROPS_COUNT = Object.keys(WORKFLOW_TEMPLATE_PROPERTIES).length;
// The reusables and actions that moved to holocron are frozen copies, no longer pushed.
const FROZEN = frozenReusablePaths();
const PRIMARY_FILE_COUNT =
	Object.keys(REUSABLE_ACTIONS).length +
	Object.keys(REUSABLE_WORKFLOWS).length +
	Object.keys(WORKFLOW_TEMPLATES).length +
	PROPS_COUNT -
	FROZEN.length;

type FetchCall = { method: string; url: string; body?: Record<string, unknown> };

/**
 * Simulate the Git Trees API. existingBlobs maps file path → git blob SHA.
 * Files not in the map are treated as new (not in the tree).
 * configJson is the parsed content of holocron.config.json to serve from the repo.
 */
function makeFetch(
	existingBlobs: Record<string, string> = {},
	configJson?: unknown,
	configTs?: string,
	/** The text of files the contents API serves, by path; a path not here is a 404. */
	contents: Record<string, string> = {}
) {
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
		// A file's current text, for the frozen copies
		const contentsPath = /\/contents\/([^?]+)/.exec(urlStr)?.[1];
		if (method === "GET" && contentsPath && contentsPath in contents) {
			const content = Buffer.from(contents[contentsPath]!).toString("base64");
			return new Response(JSON.stringify({ content, encoding: "base64" }), { status: 200 });
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

describe("runSyncGithub: the files that moved to holocron", () => {
	const workflow = ".github/workflows/verification.unitTests.yml";
	const action = ".github/actions/setup/action.yml";
	const live = "# AUTO-GENERATED — do not edit in theholocron/.github directly.\n# Source:  x\n\nname: Test\n";
	const blobsOf = (calls: FetchCall[]) => calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
	const run = (fetch: typeof globalThis.fetch, extra: Partial<Parameters<typeof runSyncGithub>[0]> = {}) =>
		runSyncGithub({ token: "t", branch: "chore/sync", print: () => {}, fetch, logger: fakeLogger(), ...extra });

	it("freezes the moved reusables and actions: they are not in what is pushed", () => {
		expect(FROZEN.length).toBeGreaterThan(30);
		expect(FROZEN).toContain(workflow);
		expect(FROZEN).toContain(action);
		// still pushed: the ones that run where they live, and the starters
		expect(FROZEN).not.toContain(".github/workflows/sync-dispatch.yml");
		expect(FROZEN).not.toContain(".github/workflows/tag.yml");
		expect(FROZEN.some((path) => path.startsWith("workflow-templates/"))).toBe(false);
	});

	it("stamps a frozen copy that is still there with the deprecation notice, once, keeping the rest", async () => {
		const { fn, calls } = makeFetch({ [workflow]: "oldsha" }, undefined, undefined, { [workflow]: live });
		const report = await run(fn);
		expect(report.status).toBe("ok");
		const stamped = blobsOf(calls).map((c) => c.body!["content"] as string);
		const notice = stamped.find((text) => text.includes("# DEPRECATED — frozen copy."));
		expect(notice).toBeDefined();
		expect(notice).toContain("use theholocron/holocron/.github/workflows/verification.unitTests.yml@ci-v1");
		expect(notice!.startsWith(live.split("\n\n")[0]!)).toBe(true);
		expect(notice!.endsWith("name: Test\n")).toBe(true);
	});

	it("points a frozen action at the action's folder in holocron", async () => {
		const { fn, calls } = makeFetch({ [action]: "oldsha" }, undefined, undefined, { [action]: live });
		await run(fn);
		const notice = blobsOf(calls).find((c) => String(c.body!["content"]).includes("DEPRECATED"));
		expect(String(notice!.body!["content"])).toContain("use theholocron/holocron/ci/actions/setup@ci-v1");
	});

	it("leaves a copy that is already stamped exactly as it is", async () => {
		const stamped = `${live.split("\n\n")[0]}\n\n# DEPRECATED — frozen copy.\n# ...\n\nname: Test\n`;
		const { fn, calls } = makeFetch({ [workflow]: "oldsha" }, undefined, undefined, { [workflow]: stamped });
		const lines: string[] = [];
		const report = await run(fn, { print: (line) => lines.push(line) });
		expect(
			blobsOf(calls)
				.map((c) => c.body!["content"] as string)
				.some((t) => t.includes("DEPRECATED"))
		).toBe(false);
		expect(lines.join("\n")).toContain("1 frozen copies already marked deprecated");
		expect(report.status).toBe("ok");
	});

	it("does not read or stamp anything in a repo other than the primary one", async () => {
		const { fn, calls } = makeFetch({ [workflow]: "oldsha" }, undefined, undefined, { [workflow]: live });
		const report = await run(fn, { repo: "acme/other" });
		expect(report.status).toBe("ok");
		expect(calls.some((c) => c.method === "GET" && c.url.includes("/contents/"))).toBe(false);
		expect(calls.some((c) => c.method === "POST" && c.url.includes("/git/blobs"))).toBe(false);
	});

	it("does nothing for a frozen file that is not in the repo", async () => {
		const { fn, calls } = makeFetch();
		await run(fn);
		expect(calls.some((c) => c.method === "GET" && c.url.includes(`/contents/${workflow}`))).toBe(false);
		expect(blobsOf(calls).some((c) => String(c.body!["content"]).includes("DEPRECATED"))).toBe(false);
	});

	it("announces the stamp on a dry run and pushes nothing", async () => {
		const { fn, calls } = makeFetch({ [workflow]: "oldsha" }, undefined, undefined, { [workflow]: live });
		const lines: string[] = [];
		const report = await run(fn, { dryRun: true, print: (line) => lines.push(line) });
		expect(report.status).toBe("dry-run");
		expect(lines.join("\n")).toContain(`deprecated  ${workflow}`);
		expect(calls.some((c) => c.method === "POST")).toBe(false);
	});

	it("fails, without pushing, when a frozen copy cannot be read", async () => {
		const { fn, calls } = makeFetch({ [workflow]: "oldsha" });
		const report = await run(fn);
		expect(report.status).toBe("fail");
		expect(report.message).toContain(`failed to read ${workflow}`);
		expect(calls.some((c) => c.method === "POST")).toBe(false);
	});
});

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

	it("writes nothing to secondary repos — thin callers are managed by holocron repo sync", async () => {
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

	it("skips a file whose existing blob SHA matches and omits it from the commit tree", async () => {
		// The header carries no timestamp, so a template's content is deterministic
		// run-to-run — seed the tree with the real git blob SHA of one file.
		const releaseContent = reusableTemplates().get(".github/workflows/tag.yml")!;
		const releaseSha = _gitBlobSha(releaseContent);

		const { fn, calls } = makeFetch({ ".github/workflows/tag.yml": releaseSha });
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});

		expect(report.unchanged).toBe(1);
		expect(report.created).toBe(PRIMARY_FILE_COUNT - 1);
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(blobs).toHaveLength(PRIMARY_FILE_COUNT - 1);
		expect(blobs.some((c) => (c.body?.content as string)?.includes("name: Tag"))).toBe(false);
	});

	it("reports a file whose blob SHA differs as updated", async () => {
		const { fn, calls } = makeFetch({
			".github/workflows/tag.yml": "0000000000000000000000000000000000000000",
		});
		const report = await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.updated).toBe(1);
		expect(report.created).toBe(PRIMARY_FILE_COUNT - 1);
		expect(report.unchanged).toBe(0);
		const blobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(blobs).toHaveLength(PRIMARY_FILE_COUNT);
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
				(c.body.content as string).includes("name: Tag")
		);
		expect(releaseBlob).toBeDefined();
	});

	it("does not push the release workflow any more, because it moved to holocron", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			branch: "chore/sync",
			print: () => {},
			fetch: fn,
		});
		const allBlobs = calls.filter((c) => c.method === "POST" && c.url.includes("/git/blobs"));
		expect(allBlobs.some((c) => String(c.body?.content).includes("npm install -g npm@11 sigstore"))).toBe(false);
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
			expect(existsSync(join(tmpOut, ".github/workflows/tag.yml"))).toBe(true);
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
			const content = readFileSync(join(tmpOut, ".github/workflows/tag.yml"), "utf8");
			const sha = _gitBlobSha(content);

			const { fn } = makeFetch({ ".github/workflows/tag.yml": sha });
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
