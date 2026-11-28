import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import type { RepoFile, ScannedRepo } from "./references.type.js";

const SKIP_DIRS = new Set([".git", "node_modules"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Every text file under `dir`: not in `.git` or `node_modules`, under 5 MiB, and without a NUL in its first KiB. */
export function* textFiles(dir: string, root: string = dir): Generator<RepoFile> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* textFiles(path, root);
		} else if (entry.isFile() && statSync(path).size < MAX_FILE_BYTES) {
			const buffer = readFileSync(path);
			if (!buffer.subarray(0, 1024).includes(0))
				yield { path: relative(root, path), text: buffer.toString("utf8") };
		}
	}
}

/**
 * Shallow-clones the default branch of each active (not archived) repository of `org` with `gh`, one at a time, and
 * removes every clone when the scan ends. Cloning, rather than GitHub code search, because search skips repositories
 * that are not indexed and gives no guarantee of completeness.
 */
export function cloneOrg(org: string): ScannedRepo[] {
	/* v8 ignore start -- runs the real gh and git; the probes are tested with injected repositories */
	const list = JSON.parse(
		execFileSync("gh", ["repo", "list", org, "--limit", "200", "--json", "name,isArchived,isTemplate"], {
			encoding: "utf8",
		})
	) as Array<{ name: string; isArchived: boolean; isTemplate: boolean }>;
	return list
		.filter((repo) => !repo.isArchived)
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((repo) => ({
			name: repo.name,
			isTemplate: repo.isTemplate,
			files() {
				const scratch = mkdtempSync(join(tmpdir(), "refs-"));
				const dest = join(scratch, repo.name);
				execFileSync("gh", ["repo", "clone", `${org}/${repo.name}`, dest, "--", "--depth", "1", "--quiet"], {
					stdio: "pipe",
				});
				// Read it all before the clone goes, so the caller never holds a path into a deleted directory.
				try {
					return [...textFiles(dest)];
				} finally {
					rmSync(scratch, { recursive: true, force: true });
				}
			},
		}));
	/* v8 ignore stop */
}
