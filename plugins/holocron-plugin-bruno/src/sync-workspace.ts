import { mkdir, readdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import type { ToolingWorkspaceFile } from "@theholocron/cli";

import type { CollectionFiles } from "./collection-files.js";

/** The folder at the repo root that holds the workspace Bruno opens. */
export const WORKSPACE_DIR = ".bruno";

/** What {@link syncWorkspace} is given. */
export interface SyncWorkspaceInput {
	/** The name Bruno shows for the workspace. */
	workspaceName: string;
	/** The converted collections, in the order the workspace lists them. */
	collections: CollectionFiles[];
	/** The absolute repo root. */
	repoRoot: string;
	/** Compare only: write and delete nothing. */
	dryRun?: boolean;
}

/** `Sentinel webhook` as `sentinel-webhook`: the folder a collection gets under `collections/`. */
export function collectionFolder(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug === "" ? "collection" : slug;
}

/** The workspace file Bruno reads: its name and the collections it lists, each by a path from the workspace folder. */
export function workspaceYml(name: string, collections: { name: string; path: string }[]): string {
	const listed = collections.map((c) => `  - name: ${JSON.stringify(c.name)}\n    path: ${JSON.stringify(c.path)}`);
	return [
		"opencollection: 1.0.0",
		"info:",
		`  name: ${JSON.stringify(name)}`,
		"  type: workspace",
		"",
		"collections:",
		...listed,
		"",
	].join("\n");
}

/** The text of a file, or `undefined` when it is not there. */
async function readIfThere(path: string): Promise<string | undefined> {
	try {
		return await readFile(path, "utf8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw err;
	}
}

/** Every `.yml` file below `dir` (empty when it is not there), as paths from `dir` with `/` separators. */
async function ymlFilesBelow(dir: string): Promise<string[]> {
	try {
		const entries = await readdir(dir, { recursive: true, withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
			.map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
			.filter((path) => !path.split("/").includes("node_modules"));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw err;
	}
}

/** Removes `dir` and each parent up to `stop` while it is empty; a folder that still holds something stays. */
async function pruneEmpty(dir: string, stop: string): Promise<void> {
	for (let current = dir; current !== stop && current.startsWith(stop); current = dirname(current)) {
		try {
			await rmdir(current);
		} catch {
			return;
		}
	}
}

/**
 * Brings the `.bruno/` workspace in line with the collections: each collection's files under
 * `.bruno/collections/<name>/`, and `.bruno/workspace.yml` listing them. A file is `new`, `changed` or `unchanged`
 * by its text, and a `.yml` file in a collection's folder that is no longer generated is `removed` (and deleted
 * unless this is a dry run). `workspace.yml` is written when it is missing or does not list a collection, and left
 * alone otherwise, because Bruno adds settings of its own to it, such as the active environment.
 */
export async function syncWorkspace(input: SyncWorkspaceInput): Promise<ToolingWorkspaceFile[]> {
	const { workspaceName, collections, repoRoot } = input;
	const generated = new Map<string, string>();
	const listed: { name: string; path: string }[] = [];
	const taken = new Set<string>();
	const folders: string[] = [];
	for (const collection of collections) {
		let folder = collectionFolder(collection.name);
		for (let n = 2; taken.has(folder); n += 1) folder = `${collectionFolder(collection.name)}-${n}`;
		taken.add(folder);
		const path = `collections/${folder}`;
		folders.push(`${WORKSPACE_DIR}/${path}`);
		listed.push({ name: collection.name, path });
		for (const [file, text] of collection.files) generated.set(`${WORKSPACE_DIR}/${path}/${file}`, text);
	}
	const workspacePath = `${WORKSPACE_DIR}/workspace.yml`;
	const workspaceNow = await readIfThere(join(repoRoot, workspacePath));
	const listsAll = workspaceNow !== undefined && listed.every((c) => workspaceNow.includes(JSON.stringify(c.path)));
	if (!listsAll) generated.set(workspacePath, workspaceYml(workspaceName, listed));

	const files: ToolingWorkspaceFile[] = [];
	for (const [path, text] of generated) {
		const now = await readIfThere(join(repoRoot, path));
		files.push({ path, state: now === undefined ? "new" : now === text ? "unchanged" : "changed" });
	}
	if (listsAll) files.push({ path: workspacePath, state: "unchanged" });
	for (const folder of folders) {
		for (const file of await ymlFilesBelow(join(repoRoot, folder))) {
			const path = `${folder}/${file}`;
			if (!generated.has(path)) files.push({ path, state: "removed" });
		}
	}
	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	if (!input.dryRun) {
		for (const { path, state } of files) {
			const absolute = join(repoRoot, path);
			if (state === "new" || state === "changed") {
				await mkdir(dirname(absolute), { recursive: true });
				await writeFile(absolute, generated.get(path) as string);
			} else if (state === "removed") {
				await unlink(absolute);
				await pruneEmpty(dirname(absolute), join(repoRoot, WORKSPACE_DIR));
			}
		}
	}
	return files;
}
