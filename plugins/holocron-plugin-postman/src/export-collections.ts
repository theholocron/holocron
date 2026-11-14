import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, relative, resolve } from "node:path";

import type { ToolingExportInput, ToolingExportIssue, ToolingExportResult } from "@theholocron/cli";

import type { PostmanCli } from "./shell.js";

/**
 * The folder each collection is written to, in order: its own file name without the extension (`collection.json`
 * is `collection`). Two files with the same name would write into one folder, so those use the whole path instead,
 * its folders joined with `-` (`apps-a-collection`).
 */
export function exportDirNames(files: string[]): string[] {
	const stem = (file: string) => basename(file, extname(file));
	const counts = new Map<string, number>();
	for (const file of files) counts.set(stem(file), (counts.get(stem(file)) ?? 0) + 1);
	return files.map((file) => {
		if (counts.get(stem(file)) === 1) return stem(file);
		return file
			.slice(0, file.length - extname(file).length)
			.split("/")
			.filter(Boolean)
			.join("-");
	});
}

/** Every file below `dir`, relative to it and sorted; a folder that is not there holds none. */
async function listFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { recursive: true, withFileTypes: true }).catch(() => []);
	return entries
		.filter((entry) => entry.isFile())
		.map((entry) => relative(dir, join(entry.parentPath, entry.name)))
		.sort();
}

/**
 * Writes each collection in Postman's schema 3.0 YAML layout by running `postman collection migrate` on it, one folder
 * per collection under `outDir`. The CLI only migrates collections, so an environment file is reported as an issue and
 * not exported. On a dry run the CLI writes into a temporary folder, which is listed and then removed, so `outDir` is
 * never touched. A collection the CLI cannot migrate throws, naming the file.
 */
export async function exportCollections(input: ToolingExportInput, cli: PostmanCli): Promise<ToolingExportResult> {
	const { collectionFiles, envFiles, outDir, repoRoot } = input;
	const names = exportDirNames(collectionFiles);
	const base = input.dryRun ? await mkdtemp(join(tmpdir(), "holocron-export-")) : outDir;
	const files: string[] = [];
	const issues: ToolingExportIssue[] = [];
	try {
		if (!input.dryRun) await mkdir(outDir, { recursive: true });
		for (const [index, file] of collectionFiles.entries()) {
			const name = names[index] as string;
			cli.migrate(resolve(repoRoot, file), join(base, name));
			const written = await listFiles(join(base, name));
			if (written.length === 0) issues.push({ file, message: "`postman collection migrate` wrote no files" });
			files.push(...written.map((path) => join(name, path)));
		}
	} finally {
		if (input.dryRun) await rm(base, { recursive: true, force: true });
	}
	for (const file of envFiles) {
		issues.push({
			file,
			message:
				"not exported: `postman collection migrate` converts collections only, so there is no 3.0 environment",
		});
	}
	return { files, issues };
}
