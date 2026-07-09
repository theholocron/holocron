import { describe, expect, it } from "vitest";

import { ACTIONS, REUSABLE_WORKFLOWS, WORKFLOW_TEMPLATE_PROPERTIES } from "../templates/index.js";
import { WORKFLOW_TEMPLATES } from "../commands/setup-workflows.js";
import { runSyncGithub } from "../commands/sync-github.js";

// Actions are only pushed to the primary .github repo, not secondary targets.
// WORKFLOW_TEMPLATE_PROPERTIES adds one .properties.json per keyed template.
const PROPS_COUNT = Object.keys(WORKFLOW_TEMPLATE_PROPERTIES).length;
const PRIMARY_FILE_COUNT = Object.keys(ACTIONS).length + Object.keys(REUSABLE_WORKFLOWS).length + Object.keys(WORKFLOW_TEMPLATES).length + PROPS_COUNT;
const SECONDARY_FILE_COUNT = Object.keys(REUSABLE_WORKFLOWS).length + Object.keys(WORKFLOW_TEMPLATES).length + PROPS_COUNT;

type FetchCall = { method: string; url: string; body?: Record<string, unknown> };

function makeFetch(existingShas: Record<string, string> = {}) {
	const calls: FetchCall[] = [];
	const fn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const urlStr = url.toString();
		const method = init?.method ?? "GET";
		const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined;
		calls.push({ method, url: urlStr, body });

		const path = urlStr.replace("https://api.github.com/repos/theholocron/.github/contents/", "");

		if (method === "GET") {
			const sha = existingShas[path];
			if (!sha) {
				return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
			}
			// Simulate existing content that differs (empty base64 → always triggers update)
			return new Response(JSON.stringify({ sha, content: "" }), { status: 200 });
		}

		// PUT
		return new Response(JSON.stringify({ content: { sha: "newsha" } }), { status: 200 });
	};
	return { fn: fn as typeof globalThis.fetch, calls };
}

describe("runSyncGithub", () => {
	it(`pushes all ${PRIMARY_FILE_COUNT} files to the primary .github repo (actions + workflows + thin callers)`, async () => {
		const { fn, calls } = makeFetch();
		const report = await runSyncGithub({
			token: "ghp_test",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(PRIMARY_FILE_COUNT);
		expect(calls).toHaveLength(PRIMARY_FILE_COUNT * 2);
	});

	it(`skips actions for secondary repos (${SECONDARY_FILE_COUNT} files, no actions)`, async () => {
		const { fn, calls } = makeFetch();
		const report = await runSyncGithub({
			token: "ghp_test",
			repo: "theholocron/.github-private",
			dryRun: false,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		expect(report.created).toBe(SECONDARY_FILE_COUNT);
		expect(calls).toHaveLength(SECONDARY_FILE_COUNT * 2);
		// No action files in the batch
		expect(calls.some((c) => c.url.includes(".github/actions/"))).toBe(false);
	});

	it("skips PUT when content is unchanged (dry-run baseline)", async () => {
		const { fn, calls } = makeFetch();
		const report = await runSyncGithub({
			token: "ghp_test",
			dryRun: true,
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("dry-run");
		// All files new in dry-run (no existing SHAs)
		expect(report.created).toBe(PRIMARY_FILE_COUNT);
		// Dry-run: only GETs, no PUTs
		expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
		expect(calls.filter((c) => c.method === "GET")).toHaveLength(PRIMARY_FILE_COUNT);
	});

	it("issues PUT with sha when file exists (update path)", async () => {
		const existingShas: Record<string, string> = {
			".github/workflows/release.yml": "abc123",
		};
		const { fn, calls } = makeFetch(existingShas);
		const report = await runSyncGithub({
			token: "ghp_test",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("ok");
		const releasePut = calls.find(
			(c) => c.method === "PUT" && c.url.includes("release.yml")
		);
		expect(releasePut?.body?.sha).toBe("abc123");
		expect(report.updated).toBeGreaterThanOrEqual(1);
	});

	it("stops and returns fail on a non-ok PUT response", async () => {
		const fn: typeof globalThis.fetch = async (_url, init) => {
			if ((init?.method ?? "GET") === "GET") {
				return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
			}
			return new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 });
		};
		const report = await runSyncGithub({
			token: "ghp_test",
			print: () => {},
			fetch: fn,
		});
		expect(report.status).toBe("fail");
		expect(report.message).toContain("Forbidden");
	});

	it("targets the custom repo in all API calls", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			repo: "myorg/myrepo",
			dryRun: true,
			print: () => {},
			fetch: fn,
		});
		expect(calls.every((c) => c.url.includes("myorg/myrepo"))).toBe(true);
	});

	it("adds the AUTO-GENERATED header to pushed content", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			print: () => {},
			fetch: fn,
		});
		const releasePut = calls.find(
			(c) => c.method === "PUT" && c.url.includes(".github/workflows/release.yml")
		);
		const content = Buffer.from(releasePut!.body!.content as string, "base64").toString("utf8");
		expect(content).toContain("AUTO-GENERATED");
		expect(content).toContain("holocron sync-github");
	});

	it("includes sigstore in the release workflow npm upgrade step", async () => {
		const { fn, calls } = makeFetch();
		await runSyncGithub({
			token: "ghp_test",
			print: () => {},
			fetch: fn,
		});
		const releasePut = calls.find(
			(c) => c.method === "PUT" && c.url.includes(".github/workflows/release.yml")
		);
		const content = Buffer.from(releasePut!.body!.content as string, "base64").toString("utf8");
		expect(content).toContain("npm install -g npm@11 sigstore");
	});
});
