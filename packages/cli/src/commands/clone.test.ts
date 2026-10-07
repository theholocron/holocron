import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseCloneTarget, runClone } from "./clone.js";

describe("parseCloneTarget", () => {
	it("returns just the org for a bare org", () => {
		expect(parseCloneTarget("theholocron")).toEqual({ org: "theholocron" });
	});

	it("splits an org/repo coordinate into org and repo — the repo is kept, not discarded", () => {
		expect(parseCloneTarget("theholocron/new-repo")).toEqual({ org: "theholocron", repo: "new-repo" });
	});

	it("treats a trailing slash with nothing after it as a bare org", () => {
		expect(parseCloneTarget("theholocron/")).toEqual({ org: "theholocron" });
	});

	it("trims surrounding whitespace", () => {
		expect(parseCloneTarget("  theholocron  ")).toEqual({ org: "theholocron" });
	});
});

function makeRepo(name: string, org = "test-org") {
	return {
		name,
		full_name: `${org}/${name}`,
		clone_url: `https://github.com/${org}/${name}.git`,
		archived: false,
	};
}

function authed(repo: ReturnType<typeof makeRepo>, token = "tok") {
	return `https://x-access-token:${encodeURIComponent(token)}@github.com/${repo.clone_url.slice("https://github.com/".length)}`;
}

function makeFetch(repos: ReturnType<typeof makeRepo>[]): typeof globalThis.fetch {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: async () => repos,
		headers: { get: () => null },
	}) as unknown as typeof globalThis.fetch;
}

/** Unlike `makeFetch`, resolves to a single repo object — the single-repo GitHub API shape, not a list. */
function makeSingleRepoFetch(repo: ReturnType<typeof makeRepo>): typeof globalThis.fetch {
	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		json: async () => repo,
		headers: { get: () => null },
	}) as unknown as typeof globalThis.fetch;
}

function makeNotFoundFetch(): typeof globalThis.fetch {
	return vi.fn().mockResolvedValue({
		ok: false,
		status: 404,
		statusText: "Not Found",
		json: async () => ({}),
		headers: { get: () => null },
	}) as unknown as typeof globalThis.fetch;
}

describe("runClone", () => {
	let tmpDir: string;
	const lines: string[] = [];
	const print = (line: string) => lines.push(line);
	const exec = vi.fn(() => ({ status: 0 }));

	beforeEach(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "holocron-clone-test-"));
		lines.length = 0;
		exec.mockReset();
		exec.mockReturnValue({ status: 0 });
	});

	afterEach(async () => {
		await rm(tmpDir, { recursive: true, force: true });
	});

	it("clones all repos into the target directory", async () => {
		const repos = [makeRepo("alpha"), makeRepo("beta")];
		const log = fakeLogger();
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
			logger: log,
		});

		expect(report.status).toBe("ok");
		expect(report.cloned).toBe(2);
		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ org: "test-org" }), "clone: start");
		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ cloned: 2, status: "ok" }), "clone: done");
		expect(report.skipped).toBe(0);
		expect(report.failed).toBe(0);
		expect(exec).toHaveBeenCalledTimes(2);
		expect(exec).toHaveBeenCalledWith("git", ["clone", "--", authed(repos[0]), join(tmpDir, "alpha")], {
			cwd: tmpDir,
		});
		expect(exec).toHaveBeenCalledWith("git", ["clone", "--", authed(repos[1]), join(tmpDir, "beta")], {
			cwd: tmpDir,
		});
	});

	it("asks confirmWholeOrg before cloning, with accurate already-cloned vs. new counts", async () => {
		await mkdir(join(tmpDir, "alpha"));
		const repos = [makeRepo("alpha"), makeRepo("beta"), makeRepo("gamma")];
		const confirmWholeOrg = vi.fn().mockResolvedValue(true);
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
			confirmWholeOrg,
		});

		expect(confirmWholeOrg).toHaveBeenCalledWith({ total: 3, alreadyCloned: 1, toClone: 2 });
		expect(report.status).toBe("ok");
		expect(report.cloned).toBe(2);
		expect(report.skipped).toBe(1);
	});

	it("aborts without cloning anything when confirmWholeOrg declines", async () => {
		const repos = [makeRepo("alpha"), makeRepo("beta")];
		const confirmWholeOrg = vi.fn().mockResolvedValue(false);
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
			confirmWholeOrg,
		});

		expect(report.status).toBe("aborted");
		expect(report.cloned).toBe(0);
		expect(exec).not.toHaveBeenCalled();
	});

	it("never calls confirmWholeOrg for a single-repo clone", async () => {
		const repo = makeRepo("new-repo", "test-org");
		const confirmWholeOrg = vi.fn().mockResolvedValue(false);
		const report = await runClone({
			org: "test-org",
			repo: "new-repo",
			dir: tmpDir,
			token: "tok",
			fetch: makeSingleRepoFetch(repo),
			exec,
			print,
			confirmWholeOrg,
		});

		expect(confirmWholeOrg).not.toHaveBeenCalled();
		expect(report.status).toBe("ok");
	});

	it("never calls confirmWholeOrg in dry-run mode — nothing destructive happens either way", async () => {
		const repos = [makeRepo("alpha"), makeRepo("beta")];
		const confirmWholeOrg = vi.fn().mockResolvedValue(false);
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			dryRun: true,
			fetch: makeFetch(repos),
			exec,
			print,
			confirmWholeOrg,
		});

		expect(confirmWholeOrg).not.toHaveBeenCalled();
		expect(report.status).toBe("dry-run");
	});

	it("clones just one repo when `repo` is given, instead of listing the whole org", async () => {
		const repo = makeRepo("new-repo", "test-org");
		const fetch = makeSingleRepoFetch(repo);
		const log = fakeLogger();
		const report = await runClone({
			org: "test-org",
			repo: "new-repo",
			dir: tmpDir,
			token: "tok",
			fetch,
			exec,
			print,
			logger: log,
		});

		expect(report.status).toBe("ok");
		expect(report.cloned).toBe(1);
		expect(fetch).toHaveBeenCalledWith(
			"https://api.github.com/repos/test-org/new-repo",
			expect.objectContaining({ headers: expect.anything() })
		);
		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec).toHaveBeenCalledWith("git", ["clone", "--", authed(repo), join(tmpDir, "new-repo")], {
			cwd: tmpDir,
		});
		expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ repo: "new-repo" }), "clone: start");
	});

	it("fails cleanly when the single repo isn't found", async () => {
		const report = await runClone({
			org: "test-org",
			repo: "does-not-exist",
			dir: tmpDir,
			token: "tok",
			fetch: makeNotFoundFetch(),
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/test-org\/does-not-exist not found/);
		expect(exec).not.toHaveBeenCalled();
	});

	it("fails cleanly on a non-404 error fetching the single repo", async () => {
		const fetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			statusText: "Forbidden",
			json: async () => ({}),
			headers: { get: () => null },
		}) as unknown as typeof globalThis.fetch;

		const report = await runClone({
			org: "test-org",
			repo: "private-repo",
			dir: tmpDir,
			token: "tok",
			fetch,
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/GitHub API 403/);
	});

	it("skips repos whose directory already exists", async () => {
		await mkdir(join(tmpDir, "alpha"));
		const repos = [makeRepo("alpha"), makeRepo("beta")];
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.cloned).toBe(1);
		expect(report.skipped).toBe(1);
		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec).toHaveBeenCalledWith("git", ["clone", "--", authed(repos[1]), join(tmpDir, "beta")], {
			cwd: tmpDir,
		});
	});

	it("counts failed clones and returns fail status", async () => {
		exec.mockReturnValue({ status: 128 });
		const repos = [makeRepo("alpha")];
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.failed).toBe(1);
		expect(report.cloned).toBe(0);
	});

	it("dry-run does not call exec and reports cloned count", async () => {
		const repos = [makeRepo("alpha"), makeRepo("beta")];
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			dryRun: true,
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.status).toBe("dry-run");
		expect(report.cloned).toBe(2);
		expect(exec).not.toHaveBeenCalled();
	});

	it("defaults target dir to ~/Code/<org>", async () => {
		const repos: ReturnType<typeof makeRepo>[] = [];
		const report = await runClone({
			org: "my-org",
			token: "tok",
			dryRun: true,
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.status).toBe("dry-run");
		expect(lines[0]).toContain(join(homedir(), "Code", "my-org"));
	});

	it("returns fail when the GitHub API call errors", async () => {
		const badFetch = vi.fn().mockResolvedValue({
			ok: false,
			status: 403,
			statusText: "Forbidden",
			headers: { get: () => null },
		}) as unknown as typeof globalThis.fetch;

		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: badFetch,
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.message).toMatch(/403/);
	});

	it("stringifies a non-Error rejection from the org-repo listing", async () => {
		const badFetch = vi.fn().mockRejectedValue("network exploded") as unknown as typeof globalThis.fetch;
		const log = fakeLogger();

		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: badFetch,
			exec,
			print,
			logger: log,
		});

		expect(report.status).toBe("fail");
		expect(report.message).toBe("network exploded");
		expect(log.warn).toHaveBeenCalledWith(
			expect.objectContaining({ org: "test-org", reason: "network exploded" }),
			"clone: failed to list repos"
		);
	});

	it("strips leading dot from repo name so hidden repos are visible in Finder", async () => {
		const repos = [makeRepo(".github"), makeRepo(".github-private")];
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.cloned).toBe(2);
		expect(exec).toHaveBeenCalledWith("git", ["clone", "--", authed(repos[0]), join(tmpDir, "github")], {
			cwd: tmpDir,
		});
		expect(exec).toHaveBeenCalledWith("git", ["clone", "--", authed(repos[1]), join(tmpDir, "github-private")], {
			cwd: tmpDir,
		});
	});

	it("paginates through multiple pages of repos", async () => {
		const page1 = [makeRepo("alpha")];
		const page2 = [makeRepo("beta")];
		const nextUrl = "https://api.github.com/orgs/test-org/repos?page=2";

		const paginatedFetch = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				json: async () => page1,
				headers: { get: (h: string) => (h === "link" ? `<${nextUrl}>; rel="next"` : null) },
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => page2,
				headers: { get: () => null },
			}) as unknown as typeof globalThis.fetch;

		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: paginatedFetch,
			exec,
			print,
		});

		expect(paginatedFetch).toHaveBeenCalledTimes(2);
		expect(report.cloned).toBe(2);
	});

	it("fails when the token contains control characters", async () => {
		const repos = [makeRepo("alpha")];
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "bad\ntoken",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.failed).toBe(1);
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/invalid token format/);
	});

	it("skips repos with unexpected clone URLs and counts them as failed", async () => {
		const badRepo = { name: "evil", full_name: "test-org/evil", clone_url: "ext::evil-cmd", archived: false };
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch([badRepo]),
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.failed).toBe(1);
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/unexpected clone URL/);
	});

	it("fails when the token is empty", async () => {
		const repos = [makeRepo("alpha")];
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "   ",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.status).toBe("fail");
		expect(report.failed).toBe(1);
		expect(exec).not.toHaveBeenCalled();
		expect(lines.join("\n")).toMatch(/invalid token format/);
	});

	it("creates the target directory when it does not exist", async () => {
		const newDir = join(tmpDir, "new-org");
		const repos = [makeRepo("alpha")];
		await runClone({
			org: "test-org",
			dir: newDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(existsSync(newDir)).toBe(true);
	});
});
