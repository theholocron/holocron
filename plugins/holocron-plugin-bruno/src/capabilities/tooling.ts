/**
 * `tooling` capability for Bruno.
 *
 * Bruno has no HTTP API and no account to push to: it reads a folder of files. So this provider works on files only,
 * with no token and no network. `export()` writes each of the repo's collection files as a Bruno JSON file with the
 * environments inside it, for `holocron export requests`.
 * `workspace()` keeps the committed `.bruno/` workspace (Bruno's own files, one folder per collection) equal to the
 * repo's request files, for `holocron sync requests`.
 *
 * `sync()` has nothing to reconcile, so it does nothing and succeeds: `holocron setup` calls it on every `tooling`
 * provider, and the files are written by `export()` and `workspace()`, which are the person's call, never a side
 * effect of `setup`.
 * `doctor()` checks the input files exist and parse as JSON.
 */

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import type {
	Tooling,
	ToolingDoctorReport,
	ToolingExportInput,
	ToolingExportIssue,
	ToolingExportResult,
	ToolingWorkspaceInput,
	ToolingWorkspaceResult,
} from "@theholocron/cli";

import { rootVersion } from "../collection-version.js";
import { convertCollection } from "../convert-collection.js";
import { outputNames } from "../output-names.js";
import { type CollectionInput, syncWorkspace } from "../sync-workspace.js";

/** Options for the Bruno `tooling` provider: the same two file lists the other tooling providers take. */
export interface BrunoToolingOptions {
	/** Collection JSON files (v2.1), relative to `repoRoot`. */
	collectionFiles?: string[];
	/** Environment JSON files, relative to `repoRoot`; each goes into every collection it is exported with (`export requests` hands a folder's collections the files beside them). */
	envFiles?: string[];
	/** The name Bruno shows for the `.bruno/` workspace that `workspace()` keeps (default `Workspace`). */
	workspaceName?: string;
	/** The `info.version` of each collection `workspace()` writes. Defaults to the version of the root `package.json`. */
	version?: string;
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

/** Like {@link readJson}, but a file that is not there is `undefined`: the workspace may make it. */
async function readJsonIfThere(root: string, file: string): Promise<unknown> {
	try {
		await access(resolve(root, file));
	} catch {
		return undefined;
	}
	return readJson(root, file);
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
		const names = outputNames(collectionFiles, ".bruno.json");
		const files: string[] = [];
		const issues: ToolingExportIssue[] = [];
		for (const [index, file] of collectionFiles.entries()) {
			const converted = await convertCollection(await readJson(repoRoot, file), environments).catch(
				(err: unknown) => {
					throw new Error(`${file}: ${message(err)}`, { cause: err });
				}
			);
			for (const issue of converted.issues) issues.push({ file, message: issue });
			const name = names[index];
			if (!input.dryRun) {
				await mkdir(outDir, { recursive: true });
				await writeFile(join(outDir, name), converted.json);
			}
			files.push(name);
		}
		return { files, issues };
	}

	async workspace(input: ToolingWorkspaceInput): Promise<ToolingWorkspaceResult> {
		const { collectionFiles, envFiles, repoRoot } = input;
		const collections: CollectionInput[] = [];
		for (const file of collectionFiles) {
			const beside = envFiles.filter((env) => dirname(env) === dirname(file));
			collections.push({
				source: file,
				json: await readJsonIfThere(repoRoot, file),
				environments: await Promise.all(
					(beside.length > 0 ? beside : envFiles).map(async (env) => ({
						source: env,
						json: await readJsonIfThere(repoRoot, env),
					}))
				),
			});
		}
		// Each collection file carries the repo's own version, the root package's, unless the options name one.
		const version = this.options.version ?? (await rootVersion(repoRoot));
		return syncWorkspace({
			workspaceName: this.options.workspaceName ?? "Workspace",
			collections,
			repoRoot,
			...(version === undefined ? {} : { version }),
			...(input.dryRun ? { dryRun: true } : {}),
			...(input.prefer ? { prefer: input.prefer } : {}),
		});
	}
}
