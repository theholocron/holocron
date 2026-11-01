import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";

import { ADR_DIR, SPEC_DIRS } from "@theholocron/astromech/repo-validation";

import type { SpecsAnnounceIo } from "./specs.type.js";

/** The `specs announce` probe's inputs from the real git and environment of `repoRoot`, writing to `$GITHUB_OUTPUT`. */
export function realSpecsAnnounceIo(repoRoot: string): SpecsAnnounceIo {
	/* v8 ignore start -- runs the real git and writes a real file; the probe is tested with an injected io */
	const git = (args: string[]): string =>
		execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	return {
		env: process.env,
		changedFiles: (before, after) =>
			git(["diff", "--name-only", before, after, "--", ...SPEC_DIRS, ADR_DIR])
				.split("\n")
				.filter(Boolean),
		readAt: (rev, path) => {
			try {
				// A file that did not exist at `rev` is an ordinary answer, so git's complaint about it is not shown.
				return execFileSync("git", ["show", `${rev}:${path}`], {
					cwd: repoRoot,
					encoding: "utf8",
					maxBuffer: 64 * 1024 * 1024,
					stdio: ["ignore", "pipe", "ignore"],
				});
			} catch {
				return undefined;
			}
		},
		setOutput: (name, value) => {
			const file = process.env["GITHUB_OUTPUT"];
			if (!file) return;
			// A random delimiter, so a value can hold any line without ending the output early.
			const delimiter = `EOF_${randomUUID()}`;
			appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
		},
	};
	/* v8 ignore stop */
}
