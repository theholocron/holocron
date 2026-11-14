/**
 * `tooling` capability for Bruno.
 *
 * Bruno has no HTTP API and no account to push to: it reads a folder of files. So this provider works on files only,
 * with no token and no network, and its one real job is `export()`: it writes each of the repo's collection files as
 * an OpenCollection YAML document (with the environments inside it), for `holocron export requests`.
 *
 * `sync()` has nothing to reconcile, so it does nothing and succeeds: `holocron setup` calls it on every `tooling`
 * provider, and the files are written by `export()`, which is the person's call, never a side effect of `setup`.
 * `doctor()` checks the input files exist and parse as JSON.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type {
	Tooling,
	ToolingDoctorReport,
	ToolingExportInput,
	ToolingExportIssue,
	ToolingExportResult,
} from "@theholocron/cli";

import { convertCollection } from "../convert-collection.js";
import { outputNames } from "../output-names.js";

/** Options for the Bruno `tooling` provider: the same two file lists the other tooling providers take. */
export interface BrunoToolingOptions {
	/** Collection JSON files (v2.1), relative to `repoRoot`. */
	collectionFiles?: string[];
	/** Environment JSON files, relative to `repoRoot`; each goes into every exported collection. */
	envFiles?: string[];
	/** Working repo root. Defaults to `process.cwd()`. */
	repoRoot?: string;
}

/** The text of what a read, a parse or a converter threw: always an `Error`. */
const message = (err: unknown): string => (err as Error).message;

/** Reads and parses a JSON file; an unreadable or invalid one throws an error that names the file. */
async function readJson(root: string, file: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(resolve(root, file), "utf8")) as unknown;
	} catch (err) {
		throw new Error(`${file}: ${message(err)}`, { cause: err });
	}
}

/** The Bruno implementation of the `tooling` capability: files only. */
export class BrunoTooling implements Tooling {
	/** The capability this class provides, always `"tooling"`. */
	readonly key = "tooling" as const;
	/** The provider name, `"bruno"`. */
	readonly providerName = "bruno";

	private readonly repoRoot: string;

	constructor(private readonly options: BrunoToolingOptions = {}) {
		this.repoRoot = options.repoRoot ?? process.cwd();
	}

	/** Nothing to reconcile: Bruno keeps no state of its own, and the files are written by {@link export}. */
	async sync(): Promise<void> {}

	async doctor(): Promise<ToolingDoctorReport> {
		const { collectionFiles = [], envFiles = [] } = this.options;
		if (collectionFiles.length === 0) {
			return { ok: false, message: "no `collectionFiles` are set, so there is nothing to export" };
		}
		const problems: string[] = [];
		for (const file of [...collectionFiles, ...envFiles]) {
			try {
				await readJson(this.repoRoot, file);
			} catch (err) {
				problems.push(message(err));
			}
		}
		if (problems.length > 0) return { ok: false, message: problems.join("; ") };
		return { ok: true, message: `${collectionFiles.length + envFiles.length} request file(s) read` };
	}

	async export(input: ToolingExportInput): Promise<ToolingExportResult> {
		const { collectionFiles, envFiles, outDir, repoRoot } = input;
		const environments = await Promise.all(envFiles.map((file) => readJson(repoRoot, file)));
		const names = outputNames(collectionFiles);
		const files: string[] = [];
		const issues: ToolingExportIssue[] = [];
		for (const [index, file] of collectionFiles.entries()) {
			const converted = await convertCollection(await readJson(repoRoot, file), environments).catch(
				(err: unknown) => {
					throw new Error(`${file}: ${message(err)}`, { cause: err });
				}
			);
			for (const issue of converted.issues) issues.push({ file, message: issue });
			const name = names[index] as string;
			if (!input.dryRun) {
				await mkdir(outDir, { recursive: true });
				await writeFile(join(outDir, name), converted.text);
			}
			files.push(name);
		}
		return { files, issues };
	}
}
