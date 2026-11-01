import { execFileSync } from "node:child_process";

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import type { MoveTagReport, RunGit, RunMoveTagInput } from "./move-tag.type.js";

const STABLE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Spawns `git` without a shell, so a version or group can never be read as anything but an argument. */
const defaultGit: RunGit = (args, cwd) => execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/** Orders stable versions, newest last. */
function compare(a: string, b: string): number {
	const [pa, pb] = [a, b].map((v) => STABLE.exec(v)!.slice(1).map(Number));
	return pa!.reduce((diff, n, i) => diff || n - pb![i]!, 0);
}

/**
 * Moves a version group's major tag (`ci-v1`) to its latest stable release (`ci-v1.4.0`) and force-pushes it, so
 * a caller that pins `ci-v1` follows the group without changing its workflow files. Immutable tags
 * (`ci-v1.4.0`) are never touched. Run by the group's release (`publishCmd`) and by hand for a repair.
 *
 * A prerelease is refused: the major tag follows stable releases only.
 */
export async function runMoveTag(input: RunMoveTagInput): Promise<MoveTagReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const cwd = input.cwd ?? process.cwd();
	const git = input.git ?? defaultGit;
	const { group, dryRun = false, remote = "origin" } = input;

	const fail = (message: string): MoveTagReport => {
		print(`  ✗ ${message}`);
		logger.info({ group, status: "fail" }, "package move-tag: done");
		return { status: "fail", message };
	};

	let version = input.version;
	try {
		if (version === undefined) {
			const stable = git(["tag", "--list", `${group}-v*`], cwd)
				.split("\n")
				.map((tag) => tag.slice(`${group}-v`.length))
				.filter((v) => STABLE.test(v))
				.sort(compare);
			version = stable.at(-1);
			if (version === undefined) return fail(`no stable ${group}-v<version> tag to move ${group}-v<major> to`);
		}
		const parts = STABLE.exec(version);
		if (!parts)
			return fail(`${version} is not a stable version (x.y.z); the major tag follows stable releases only`);

		const target = `${group}-v${version}`;
		const tag = `${group}-v${parts[1]}`;
		print(`Moving ${tag} to ${target}${dryRun ? " (dry-run)" : ""}…`);
		logger.info({ group, tag, target, dryRun: dryRun || undefined }, "package move-tag: start");

		// The release tag must exist locally, so the commit it names is the one the major tag gets.
		const commit = git(["rev-parse", "--verify", `refs/tags/${target}^{commit}`], cwd);
		if (dryRun) {
			print(`  ~ ${tag} → ${commit.slice(0, 9)} (${target}), then push --force ${remote}`);
			return { status: "dry-run", tag, target };
		}
		git(["tag", "--force", tag, commit], cwd);
		git(["push", "--force", remote, `refs/tags/${tag}`], cwd);
		print(`  ✓ ${tag} → ${commit.slice(0, 9)} (${target})`);
		logger.info({ group, tag, target, status: "ok" }, "package move-tag: done");
		return { status: "ok", tag, target };
	} catch (error) {
		return fail(errorMessage(error));
	}
}
