import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { originFromCommit } from "./origin-from-commit.js";
import type { SpecsSyncIo } from "./specs-sync.type.js";

/** The `sync specs` command's files, read and written under `repoRoot`. */
export function realSpecsSyncIo(repoRoot: string): SpecsSyncIo {
	/* v8 ignore start -- reads and writes the real filesystem; the command is tested with an injected io */
	return {
		list: (dir) => {
			try {
				return readdirSync(join(repoRoot, dir));
			} catch {
				return [];
			}
		},
		read: (path) => {
			try {
				return readFileSync(join(repoRoot, path), "utf8");
			} catch {
				return undefined;
			}
		},
		write: (path, text) => writeFileSync(join(repoRoot, path), text),
		origin: (path) => {
			try {
				// The oldest commit that added the file, across a move from one folder to another.
				const git = (args: string[]) =>
					execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
				const added = git(["log", "--follow", "--diff-filter=A", "--format=%H%x09%at%x09%s", "--", path])
					.split("\n")
					.filter(Boolean)
					.pop();
				if (!added) return undefined;
				const [hash = "", ...rest] = added.split("\t");
				// A commit that added many documents is a bulk change, whose pull request is not this document's own.
				const files = git(["show", "--diff-filter=A", "--name-only", "--format=", hash])
					.split("\n")
					.filter(Boolean);
				return originFromCommit(rest.join("\t"), files);
			} catch {
				return undefined;
			}
		},
	};
	/* v8 ignore stop */
}
