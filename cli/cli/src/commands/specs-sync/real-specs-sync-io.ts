import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { SpecsSyncIo } from "./specs-sync.type.js";

/** The `specs sync` command's files, read and written under `repoRoot`. */
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
				const added = execFileSync(
					"git",
					["log", "--follow", "--diff-filter=A", "--format=%at%x09%s", "--", path],
					{ cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
				)
					.split("\n")
					.filter(Boolean)
					.pop();
				if (!added) return undefined;
				const [at = "", subject = ""] = added.split("\t");
				const pr = /\(#(\d+)\)\s*$/.exec(subject)?.[1];
				return { time: Number(at), ...(pr ? { pr: Number(pr) } : {}) };
			} catch {
				return undefined;
			}
		},
	};
	/* v8 ignore stop */
}
