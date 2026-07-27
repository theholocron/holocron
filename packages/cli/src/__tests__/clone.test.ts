import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { runClone } from "../commands/clone.js";

function makeRepo(name: string, org = "test-org") {
	return {
		name,
		full_name: `${org}/${name}`,
		clone_url: `https://github.com/${org}/${name}.git`,
		archived: false,
	};
}

function authed(repo: ReturnType<typeof makeRepo>, token = "tok") {
	return repo.clone_url.replace("https://", `https://x-access-token:${token}@`);
}

function makeFetch(repos: ReturnType<typeof makeRepo>[]): typeof globalThis.fetch {
	return vi.fn().mockResolvedValue({
		ok: true,
		json: async () => repos,
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
		const report = await runClone({
			org: "test-org",
			dir: tmpDir,
			token: "tok",
			fetch: makeFetch(repos),
			exec,
			print,
		});

		expect(report.status).toBe("ok");
		expect(report.cloned).toBe(2);
		expect(report.skipped).toBe(0);
		expect(report.failed).toBe(0);
		expect(exec).toHaveBeenCalledTimes(2);
		expect(exec).toHaveBeenCalledWith("git", ["clone", authed(repos[0]), join(tmpDir, "alpha")], { cwd: tmpDir });
		expect(exec).toHaveBeenCalledWith("git", ["clone", authed(repos[1]), join(tmpDir, "beta")], { cwd: tmpDir });
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
		expect(exec).toHaveBeenCalledWith("git", ["clone", authed(repos[1]), join(tmpDir, "beta")], { cwd: tmpDir });
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
		expect(exec).toHaveBeenCalledWith("git", ["clone", authed(repos[0]), join(tmpDir, "github")], { cwd: tmpDir });
		expect(exec).toHaveBeenCalledWith("git", ["clone", authed(repos[1]), join(tmpDir, "github-private")], {
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
});
