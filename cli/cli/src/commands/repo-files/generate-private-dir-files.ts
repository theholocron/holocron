import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { upsertManagedBlock } from "@theholocron/git-utils";

import { PRIVATE_IGNORE_BLOCK, PRIVATE_KEEP_FILE } from "../../private-dir/index.js";
import type { GeneratedRepoFile, RepoFilesInput } from "./repo-files.type.js";

/**
 * The private directory for files that hold secrets (`.holocron/.private/`): an empty tracked `.gitkeep` that keeps it
 * in the checkout, and the managed block in `.gitignore` that ignores everything else in it. The block is merged into
 * the `.gitignore` already on disk, so the rest of the file (and the skills blocks `repo setup` keeps) is untouched.
 * `repo setup` and `sync` both write what this returns, so the bytes are the same from either.
 */
export async function generatePrivateDirFiles(input: RepoFilesInput): Promise<GeneratedRepoFile[]> {
	const existing = await readFile(join(input.repoRoot, ".gitignore"), "utf8").catch(() => "");
	return [
		{
			kind: "file",
			path: PRIVATE_KEEP_FILE,
			content: "",
			step: `write ${PRIVATE_KEEP_FILE}`,
			syncStep: `write ${PRIVATE_KEEP_FILE}`,
			note: "keeps the private directory in the checkout",
		},
		{
			kind: "file",
			path: ".gitignore",
			content: upsertManagedBlock(existing, { ...PRIVATE_IGNORE_BLOCK, lines: PRIVATE_IGNORE_BLOCK.lines }),
			step: "write .gitignore",
			syncStep: "write .gitignore",
			note: "private directory block",
		},
	];
}
