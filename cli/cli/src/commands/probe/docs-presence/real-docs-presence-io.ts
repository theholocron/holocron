import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { DocsPresenceIo } from "./docs-presence.type.js";

/** The docs-presence probe's inputs from the real git, filesystem and environment of `repoRoot`. */
export function realDocsPresenceIo(repoRoot: string): DocsPresenceIo {
	/* v8 ignore start -- runs the real git and reads real files; the probe is tested with an injected io */
	const git = (args: string[]): string =>
		execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
	const lines = (text: string): string[] => text.split("\n").filter(Boolean);
	const quietly = (args: string[]): string => {
		try {
			return git(args);
		} catch {
			return "";
		}
	};
	return {
		env: process.env,
		addedFiles: (base) => lines(git(["diff", "--name-only", "--diff-filter=A", base, "HEAD"])),
		changedFiles: (base) => lines(git(["diff", "--name-only", base, "HEAD"])),
		subjects: (base) => lines(quietly(["log", `${base}..HEAD`, "--format=%s"])),
		messages: (base) => quietly(["log", `${base}..HEAD`, "--format=%B"]),
		diffOf: (base, dir) => quietly(["diff", "-U0", base, "HEAD", "--", `${dir}/src`, `${dir}/index.ts`]),
		readPackage: (dir) => {
			const path = join(repoRoot, dir, "package.json");
			if (!existsSync(path)) return undefined;
			try {
				return JSON.parse(readFileSync(path, "utf8")) as { private?: boolean };
			} catch {
				return undefined;
			}
		},
	};
	/* v8 ignore stop */
}
