import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fakeLogger } from "@theholocron/observability/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { runMoveTag } from "./move-tag.js";
import type { RunGit } from "./move-tag.type.js";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";

/** A fake git that knows these tags and records every call. */
function fakeGit(tags: string[], failOn?: string) {
	const calls: string[][] = [];
	const git: RunGit = (args) => {
		calls.push([...args]);
		if (failOn && args[0] === failOn) throw new Error(`git ${failOn} failed`);
		if (args[0] === "tag" && args[1] === "--list") return tags.join("\n");
		if (args[0] === "rev-parse") {
			const tag = String(args[2])
				.replace(/^refs\/tags\//, "")
				.replace(/\^\{commit\}$/, "");
			if (!tags.includes(tag)) throw new Error(`fatal: Needed a single revision: ${tag}`);
			return COMMIT;
		}
		return "";
	};
	return { git, calls };
}

async function run(tags: string[], extra: Partial<Parameters<typeof runMoveTag>[0]> = {}, failOn?: string) {
	const { git, calls } = fakeGit(tags, failOn);
	const lines: string[] = [];
	const report = await runMoveTag({
		group: "ci",
		cwd: "/repo",
		print: (line) => lines.push(line),
		logger: fakeLogger(),
		git,
		...extra,
	});
	return { report, lines, calls };
}

describe("runMoveTag", () => {
	it("moves the major tag to the latest stable release of the group and pushes it", async () => {
		const { report, calls, lines } = await run([
			"ci-v1.2.0",
			"ci-v1.10.0",
			"ci-v1.9.3",
			"ci-v2.0.0-alpha.1",
			"clients-v9.0.0",
		]);
		expect(report).toEqual({ status: "ok", tag: "ci-v1", target: "ci-v1.10.0" });
		expect(calls.slice(1)).toEqual([
			["rev-parse", "--verify", "refs/tags/ci-v1.10.0^{commit}"],
			["tag", "--force", "ci-v1", COMMIT],
			["push", "--force", "origin", "refs/tags/ci-v1"],
		]);
		expect(lines).toEqual(["Moving ci-v1 to ci-v1.10.0…", "  ✓ ci-v1 → 012345678 (ci-v1.10.0)"]);
	});

	it("moves to a version it is given, on a remote it is given, and reads the major from it", async () => {
		const { report, calls } = await run(["ci-v1.4.0", "ci-v2.0.0"], { version: "2.0.0", remote: "upstream" });
		expect(report).toMatchObject({ status: "ok", tag: "ci-v2", target: "ci-v2.0.0" });
		expect(calls.at(-1)).toEqual(["push", "--force", "upstream", "refs/tags/ci-v2"]);
	});

	it("changes nothing on a dry run", async () => {
		const { report, calls, lines } = await run(["ci-v1.4.0"], { dryRun: true });
		expect(report).toEqual({ status: "dry-run", tag: "ci-v1", target: "ci-v1.4.0" });
		expect(calls.some((c) => c[0] === "push" || (c[0] === "tag" && c[1] === "--force"))).toBe(false);
		expect(lines[1]).toContain("~ ci-v1 →");
	});

	it("refuses a prerelease, so the major tag never follows an alpha", async () => {
		const { report, lines } = await run(["ci-v1.4.0"], { version: "1.5.0-alpha.1" });
		expect(report.status).toBe("fail");
		expect(lines.at(-1)).toContain("is not a stable version");
	});

	it("fails when the group has no stable tag yet", async () => {
		const { report } = await run(["ci-v1.0.0-alpha.1", "clients-v1.0.0"]);
		expect(report).toMatchObject({ status: "fail", message: "no stable ci-v<version> tag to move ci-v<major> to" });
	});

	it("fails when the release tag is not there, without tagging", async () => {
		const { report, calls } = await run(["ci-v1.4.0"], { version: "1.9.0" });
		expect(report).toMatchObject({ status: "fail", message: expect.stringContaining("no tag ci-v1.9.0") });
		expect(calls.some((c) => c[0] === "tag" && c[1] === "--force")).toBe(false);
	});

	it("reports a failed push as a failure", async () => {
		const { report } = await run(["ci-v1.4.0"], {}, "push");
		expect(report).toMatchObject({ status: "fail", message: "git push failed" });
	});
});

describe("runMoveTag with the real git", () => {
	const dirs: string[] = [];
	afterEach(() => {
		vi.restoreAllMocks();
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	const git = (cwd: string, ...args: string[]) =>
		execFileSync(
			"git",
			["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
			{
				cwd,
				encoding: "utf8",
			}
		).trim();

	/** A clone with one commit tagged ci-v1.2.0, whose `origin` is a bare repo. */
	function clone(): { work: string; remote: string } {
		const base = mkdtempSync(join(tmpdir(), "move-tag-"));
		dirs.push(base);
		const remote = join(base, "remote.git");
		const work = join(base, "work");
		execFileSync("git", ["init", "-q", "--bare", remote]);
		execFileSync("git", ["init", "-q", work]);
		git(work, "remote", "add", "origin", remote);
		writeFileSync(join(work, "a.txt"), "a");
		git(work, "add", ".");
		git(work, "commit", "-q", "-m", "one");
		git(work, "tag", "ci-v1.2.0");
		return { work, remote };
	}

	it("tags and pushes with git, printing and logging by default, from the working directory it is given", async () => {
		const { work, remote } = clone();
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runMoveTag({ group: "ci", cwd: work });
		expect(report).toEqual({ status: "ok", tag: "ci-v1", target: "ci-v1.2.0" });
		expect(git(work, "rev-parse", "ci-v1^{commit}")).toBe(git(work, "rev-parse", "ci-v1.2.0^{commit}"));
		expect(git(remote, "rev-parse", "ci-v1^{commit}")).toBe(git(work, "rev-parse", "ci-v1.2.0^{commit}"));
		expect(log.mock.calls.flat().join("\n")).toContain("✓ ci-v1 →");
	});

	it("uses the process's working directory when it is not given one", async () => {
		// Run where the tests run: a git checkout with no tags for this group, so it fails before touching anything.
		vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runMoveTag({ group: "no-such-group", dryRun: true });
		expect(report).toMatchObject({
			status: "fail",
			message: "no stable no-such-group-v<version> tag to move no-such-group-v<major> to",
		});
	});

	it("fails when the real git cannot find the tag", async () => {
		const { work } = clone();
		vi.spyOn(console, "log").mockImplementation(() => {});
		const report = await runMoveTag({ group: "ci", cwd: work, version: "1.9.0" });
		expect(report).toMatchObject({ status: "fail", message: expect.stringContaining("no tag ci-v1.9.0") });
	});
});
