import { execFileSync } from "node:child_process";

import type { RunGit } from "../move-major-tag/move-major-tag.type.js";

/**
 * Runs `git` with `args` in `cwd` and returns its trimmed stdout. Spawns `git` without a shell, so a version or group can
 * never be read as anything but an argument. stderr is piped, not shown: git narrates a push, and a failure is in the
 * thrown error's message.
 *
 * @param args - The arguments after `git`.
 * @param cwd - The directory to run in (the repo root).
 * @returns The command's trimmed standard output; throws when git fails.
 */
export const runGit: RunGit = (args, cwd) =>
	execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
