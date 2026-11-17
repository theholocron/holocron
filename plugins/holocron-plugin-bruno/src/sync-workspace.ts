import { mkdir, readdir, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

import type { ToolingExportIssue, ToolingWorkspaceFile, ToolingWorkspaceSide } from "@theholocron/cli";
import { postmanToBrunoEnvironment } from "@usebruno/converters";
import { stringifyEnvironment } from "@usebruno/filestore";

import { type Baseline, BASELINE_FILE, type BaselinePair, readBaseline, serializeBaseline } from "./baseline.js";
import { collectionFiles } from "./collection-files.js";
import { formatJson } from "./format-json.js";
import { comparableDocs, DOCS_FILE, normalizeDocs, readDocs, withDocs } from "./workspace-docs.js";
import { canonicalJson, environmentToSource, hashOf, keepOriginal, workspaceToSource } from "./workspace-to-source.js";

/** The folder at the repo root that holds the workspace Bruno opens. */
export const WORKSPACE_DIR = ".bruno";

/** One environment file of a collection, as the request file holds it (`json` is `undefined` when it is not there). */
export interface EnvironmentInput {
	/** The environment file, relative to the repo root. */
	source: string;
	json: unknown;
}

/** One request collection and the environments that go with it. */
export interface CollectionInput {
	/** The collection file, relative to the repo root. */
	source: string;
	/** Its parsed content, or `undefined` when the file is not there (the workspace then makes it, when it has a baseline). */
	json: unknown;
	environments: EnvironmentInput[];
}

/** What {@link syncWorkspace} is given. */
export interface SyncWorkspaceInput {
	/** The name Bruno shows for the workspace. */
	workspaceName: string;
	/** The collections, in the order the workspace lists them. */
	collections: CollectionInput[];
	/** The absolute repo root. */
	repoRoot: string;
	/** Compare only: write and delete nothing. */
	dryRun?: boolean;
	/** Settles a pair whose two sides both changed. */
	prefer?: ToolingWorkspaceSide;
}

/** What {@link syncWorkspace} found. */
export interface SyncWorkspaceResult {
	files: ToolingWorkspaceFile[];
	issues: ToolingExportIssue[];
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

/**
 * The workspace file with `collections` added to its `collections:` list and every other byte kept: the entries are
 * inserted after the last one, or in place of a `collections: []`. Returns `undefined` when the file has no
 * `collections:` key, so the caller makes the file whole.
 */
export function addCollections(text: string, collections: { name: string; path: string }[]): string | undefined {
	const entries = collections.map((c) => `  - name: ${JSON.stringify(c.name)}\n    path: ${JSON.stringify(c.path)}`);
	const lines = text.split("\n");
	const at = lines.findIndex((line) => /^collections:(\s|$)/.test(line));
	if (at === -1) return undefined;
	const value = lines[at]!.slice("collections:".length)
		.replace(/\s+#.*$/, "")
		.trim();
	if (value === "[]" || value === "null" || value === "~") {
		lines.splice(at, 1, "collections:", ...entries);
		return lines.join("\n");
	}
	if (value !== "") return undefined;
	// The list runs while a line is blank, indented or a `- ` item at the key's own column; it ends at the last of those with text.
	let last = at;
	for (let i = at + 1; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (line.trim() === "") continue;
		if (/^\s/.test(line) || line.startsWith("- ")) last = i;
		else break;
	}
	lines.splice(last + 1, 0, ...entries);
	return lines.join("\n");
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

/** Every `.yml` file below `dir` (empty when it is not there) with its text, by path from `dir` with `/` separators. */
async function ymlFilesBelow(dir: string): Promise<Map<string, string>> {
	const files = new Map<string, string>();
	let entries;
	try {
		entries = await readdir(dir, { recursive: true, withFileTypes: true });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return files;
		throw err;
	}
	const paths = entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
		.map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
		.filter((path) => !path.split("/").includes("node_modules"))
		.sort();
	for (const path of paths) files.set(path, await readFile(join(dir, path), "utf8"));
	return files;
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

/** What to do about one pair of files. */
type Direction = "toWorkspace" | "toSource" | "agree" | "conflict";

/** What {@link decide} looks at. */
interface DecideInput {
	sourcePresent: boolean;
	workspacePresent: boolean;
	prior: BaselinePair | undefined;
	sourceHash: string;
	workspaceHash: string;
	/** Whether the two sides hold the same thing, asked only when it is needed. */
	agree: () => boolean;
	prefer: ToolingWorkspaceSide | undefined;
}

/**
 * Which way one pair goes. A side that is not there is made from the other. With a baseline, only the side that
 * differs from it has changed: the other is regenerated from it. A pair with no baseline, or with both sides
 * changed, is in step when the two already hold the same thing and otherwise a conflict, which `prefer` settles.
 */
function decide(input: DecideInput): Direction {
	if (!input.workspacePresent) return "toWorkspace";
	if (!input.sourcePresent) return "toSource";
	const { prior } = input;
	if (prior) {
		const sourceChanged = prior.sourceHash !== input.sourceHash;
		const workspaceChanged = prior.workspaceHash !== input.workspaceHash;
		if (!sourceChanged && !workspaceChanged) return "agree";
		if (!workspaceChanged) return "toWorkspace";
		if (!sourceChanged) return "toSource";
	}
	if (input.agree()) return "agree";
	if (input.prefer === "source") return "toWorkspace";
	if (input.prefer === "workspace") return "toSource";
	return "conflict";
}

/** The hash of a folder's request files: every path and text, in path order. */
const folderHash = (files: Map<string, string>): string =>
	hashOf(
		[...files.entries()]
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([path, text]) => `${path}\0${text}`)
			.join("\0\0")
	);

/** A collection with nothing in it, to name and convert environments when the collection file is not there. */
const EMPTY_COLLECTION = {
	info: { name: "Collection", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
	item: [],
};

/** Whether two sets of files have the same paths and the same texts. */
const sameFiles = (a: Map<string, string>, b: Map<string, string>): boolean =>
	a.size === b.size && [...a].every(([path, text]) => b.get(path) === text);

/** A request file as the workspace can carry it: what its own conversion gives back, as a stable text. */
async function carriedCollection(json: unknown): Promise<{ canon: string }> {
	const files = await collectionFiles(json, []);
	return { canon: canonicalJson(workspaceToSource(requestFiles(files.files))) };
}

/** The files of a collection folder that are requests and folders, not environments. */
function requestFiles(files: Map<string, string>): Map<string, string> {
	return new Map([...files].filter(([path]) => !path.startsWith("environments/")));
}

/** An environment's file text and the `{ name, values }` it carries, from the request file's side. */
async function carriedEnvironment(json: unknown): Promise<{ text: string; canon: string }> {
	const text = stringifyEnvironment(await postmanToBrunoEnvironment(json), { format: "yml" });
	return { text, canon: canonicalJson(environmentToSource(text, "the environment")) };
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Everything a run decided, applied only when it is not a dry run and nothing is in conflict. */
class Plan {
	readonly files: ToolingWorkspaceFile[] = [];
	readonly issues: ToolingExportIssue[] = [];
	readonly writes = new Map<string, string>();
	readonly deletes: string[] = [];
	readonly pairs: BaselinePair[] = [];
	conflicts = 0;

	/** Plans a write; a second, different text for the same path is a conflict of its own. */
	write(path: string, text: string): void {
		const earlier = this.writes.get(path);
		if (earlier !== undefined && earlier !== text) {
			this.conflicts += 1;
			this.files.push({
				path,
				state: "conflict",
				note: "two pairs would write different content to this file; edit one environment file and sync again",
			});
			return;
		}
		this.writes.set(path, text);
	}
}

/** Reports what a pair in conflict holds and keeps its baseline as it was. */
function conflictNote(what: string): string {
	return `${what} changed on both sides since the last sync; pass --prefer source (the request file wins) or --prefer workspace (the workspace wins)`;
}

/**
 * Keeps the `.bruno/` workspace and the request files in step, both ways. Each collection and each environment is a
 * pair; `.bruno/.sync.json` holds what both sides looked like at the last sync, so a run can tell which side changed
 * (see {@link decide}). The request file's hash is the hash of what the workspace can carry of it, so a setting that
 * only the workspace holds (a request's timeout) never looks like a change to the request file; the workspace's hash is
 * that of its own files, so such an edit is still seen as a change to the workspace and is never overwritten by a
 * request-file change without a conflict. `workspace.yml` is made when it is missing, left alone while it lists every
 * collection, and otherwise only gets the missing entries ({@link addCollections}), because Bruno keeps settings of
 * its own in it: the active environment, the `docs` and the `specs`.
 *
 * A file is `new`, `changed` or `unchanged` by its text; a workspace file that is no longer generated is `removed`;
 * a pair that both sides changed is a `conflict`, and with a conflict (and no `prefer`) nothing at all is written.
 */
export async function syncWorkspace(input: SyncWorkspaceInput): Promise<SyncWorkspaceResult> {
	const { repoRoot, prefer } = input;
	const prior = await readBaseline(repoRoot);
	const plan = new Plan();
	const workspaceDir = join(repoRoot, WORKSPACE_DIR);

	// Folders: a collection keeps the one its baseline gave it, the rest are named from the collection.
	const taken = new Set<string>();
	const folders = new Map<string, string>();
	for (const c of input.collections) {
		const known = priorPair(prior?.baseline, "collection", c.source);
		if (known) {
			folders.set(c.source, known.workspace);
			taken.add(known.workspace);
		}
	}

	const listed: { name: string; path: string }[] = [];
	for (const c of input.collections) {
		const environmentsPresent = c.environments.filter((env) => env.json !== undefined);
		const generated =
			c.json === undefined
				? undefined
				: await collectionFiles(
						c.json,
						environmentsPresent.map((env) => env.json)
					).catch((err: unknown) => {
						throw new Error(`${c.source}: ${(err as Error).message}`, { cause: err });
					});
		const known = priorPair(prior?.baseline, "collection", c.source);
		if (c.json === undefined && !known) throw new Error(`${c.source}: not found`);
		let folderPath = folders.get(c.source);
		if (folderPath === undefined) {
			const base = collectionFolder(generated?.name ?? "collection");
			let slug = `collections/${base}`;
			for (let n = 2; taken.has(slug); n += 1) slug = `collections/${base}-${n}`;
			taken.add(slug);
			folderPath = slug;
		}
		const folder = folderPath;
		const folderAbsolute = join(workspaceDir, folder);
		const current = await ymlFilesBelow(folderAbsolute);
		const currentRequests = requestFiles(current);
		const generatedRequests = generated ? requestFiles(generated.files) : new Map<string, string>();

		// The collection pair.
		const sourceCanon = generated ? canonicalJson(workspaceToSource(generatedRequests)) : "";
		const sourceHash = generated ? hashOf(sourceCanon) : "";
		const workspaceHash = folderHash(currentRequests);
		let derived: Record<string, unknown> | undefined;
		const derive = () => (derived ??= workspaceToSource(currentRequests));
		const direction = decide({
			sourcePresent: c.json !== undefined,
			workspacePresent: currentRequests.size > 0,
			prior: known,
			sourceHash,
			workspaceHash,
			agree: () => sameFiles(generatedRequests, currentRequests) || canonicalJson(derive()) === sourceCanon,
			prefer,
		});

		let name = generated?.name ?? "";
		let finalWorkspace = currentRequests;
		let finalSourceHash = sourceHash;
		if (direction === "toWorkspace") {
			for (const [path, text] of generatedRequests) {
				const now = currentRequests.get(path);
				plan.files.push({
					path: `${WORKSPACE_DIR}/${folder}/${path}`,
					state: now === undefined ? "new" : now === text ? "unchanged" : "changed",
				});
				if (now !== text) plan.write(`${WORKSPACE_DIR}/${folder}/${path}`, text);
			}
			for (const path of currentRequests.keys()) {
				if (generatedRequests.has(path)) continue;
				plan.files.push({ path: `${WORKSPACE_DIR}/${folder}/${path}`, state: "removed" });
				plan.deletes.push(`${WORKSPACE_DIR}/${folder}/${path}`);
			}
			finalWorkspace = generatedRequests;
			for (const issue of generated?.issues ?? []) plan.issues.push({ file: c.source, message: issue });
		} else {
			for (const path of currentRequests.keys()) {
				plan.files.push({ path: `${WORKSPACE_DIR}/${folder}/${path}`, state: "unchanged" });
			}
			if (direction === "conflict") {
				plan.conflicts += 1;
				plan.files.push({ path: c.source, state: "conflict", note: conflictNote("The collection") });
			} else if (direction === "toSource") {
				const fromWorkspace = derive();
				name = String((fromWorkspace.info as { name?: unknown } | undefined)?.name ?? name);
				if (c.json === undefined || canonicalJson(fromWorkspace) !== sourceCanon) {
					const text = formatJson(
						isObject(c.json)
							? keepOriginal(fromWorkspace, workspaceToSource(generatedRequests), c.json)
							: fromWorkspace
					);
					plan.files.push({ path: c.source, state: c.json === undefined ? "new" : "changed" });
					plan.write(c.source, text);
					const written = JSON.parse(text) as unknown;
					finalSourceHash = hashOf((await carriedCollection(written)).canon);
					const regenerated = requestFiles((await collectionFiles(written, [])).files);
					for (const [path, text] of currentRequests) {
						if (regenerated.get(path) !== text) {
							plan.issues.push({
								file: c.source,
								message: `${WORKSPACE_DIR}/${folder}/${path} holds settings the request file cannot carry; they stay in the workspace`,
							});
						}
					}
				}
			}
		}
		listed.push({ name, path: folder });
		if (direction === "conflict") {
			if (known) plan.pairs.push(known);
		} else {
			plan.pairs.push({
				kind: "collection",
				source: c.source,
				workspace: folder,
				sourceHash: finalSourceHash,
				workspaceHash: folderHash(finalWorkspace),
			});
		}

		// The environment pairs of this collection.
		const envFiles =
			generated ??
			(await collectionFiles(
				EMPTY_COLLECTION,
				environmentsPresent.map((env) => env.json)
			));
		const mapped = new Set<string>();
		let index = 0;
		for (const env of c.environments) {
			const knownEnv = prior?.baseline.pairs.find(
				(p) =>
					p.kind === "environment" &&
					p.source === env.source &&
					p.workspace.startsWith(`${folder}/environments/`)
			);
			const generatedFile = env.json === undefined ? undefined : envFiles.environmentFiles[index++];
			const file = generatedFile ?? knownEnv?.workspace.slice(folder.length + 1);
			if (file === undefined) throw new Error(`${env.source}: not found`);
			mapped.add(file);
			const workspacePath = `${folder}/${file}`;
			const now = current.get(file);
			const carried = env.json === undefined ? undefined : await carriedEnvironment(env.json);
			const envSourceHash = carried ? hashOf(carried.canon) : "";
			const envDirection = decide({
				sourcePresent: carried !== undefined,
				workspacePresent: now !== undefined,
				prior: knownEnv,
				sourceHash: envSourceHash,
				workspaceHash: now === undefined ? "" : hashOf(now),
				agree: () =>
					carried !== undefined &&
					now !== undefined &&
					(carried.text === now || canonicalJson(environmentToSource(now, workspacePath)) === carried.canon),
				prefer,
			});
			const path = `${WORKSPACE_DIR}/${workspacePath}`;
			let finalText = now;
			let finalEnvHash = envSourceHash;
			if (envDirection === "toWorkspace") {
				const text = (carried as { text: string }).text;
				plan.files.push({ path, state: now === undefined ? "new" : now === text ? "unchanged" : "changed" });
				if (now !== text) plan.write(path, text);
				finalText = text;
			} else if (envDirection === "conflict") {
				plan.conflicts += 1;
				plan.files.push({ path: env.source, state: "conflict", note: conflictNote("The environment") });
			} else {
				plan.files.push({ path, state: "unchanged" });
				if (envDirection === "toSource") {
					const fromWorkspace = environmentToSource(now as string, workspacePath);
					if (carried === undefined || canonicalJson(fromWorkspace) !== carried.canon) {
						const text = formatJson({ ...(isObject(env.json) ? env.json : {}), ...fromWorkspace });
						plan.files.push({ path: env.source, state: env.json === undefined ? "new" : "changed" });
						plan.write(env.source, text);
						const rewritten = await carriedEnvironment(JSON.parse(text) as unknown);
						finalEnvHash = hashOf(rewritten.canon);
						if (rewritten.text !== now) {
							plan.issues.push({
								file: env.source,
								message: `${path} holds settings the environment file cannot carry; they stay in the workspace`,
							});
						}
					}
				}
			}
			if (envDirection === "conflict") {
				if (knownEnv) plan.pairs.push(knownEnv);
			} else {
				plan.pairs.push({
					kind: "environment",
					source: env.source,
					workspace: workspacePath,
					sourceHash: finalEnvHash,
					workspaceHash: hashOf(finalText as string),
				});
			}
		}
		for (const file of current.keys()) {
			if (file.startsWith("environments/") && !mapped.has(file)) {
				plan.issues.push({
					file: c.source,
					message: `${WORKSPACE_DIR}/${folder}/${file} is only in the workspace: no environment file of the request files names it, so it is not synced`,
				});
			}
		}
	}

	// The workspace file lists every collection; Bruno's own additions to it are left alone.
	const workspacePath = `${WORKSPACE_DIR}/workspace.yml`;
	const workspaceNow = await readIfThere(join(repoRoot, workspacePath));
	const listsAll = workspaceNow !== undefined && listed.every((c) => workspaceNow.includes(JSON.stringify(c.path)));
	let workspaceText = workspaceNow ?? "";
	if (!listsAll) {
		const missing = listed.filter(
			(c) => workspaceNow === undefined || !workspaceNow.includes(JSON.stringify(c.path))
		);
		const kept = workspaceNow === undefined ? undefined : addCollections(workspaceNow, missing);
		workspaceText = kept ?? workspaceYml(input.workspaceName, listed);
	}

	// The docs pair: `.bruno/README.md` (the source side) and the `docs` value of `workspace.yml` (Bruno's side).
	const readmeNow = await readIfThere(join(repoRoot, DOCS_FILE));
	const docsNow = workspaceNow === undefined ? undefined : readDocs(workspaceNow);
	const readmeDocs = readmeNow === undefined ? undefined : normalizeDocs(readmeNow);
	const workspaceDocs = docsNow === undefined || docsNow === "" ? undefined : docsNow;
	const knownDocs = priorPair(prior?.baseline, "docs", DOCS_FILE);
	if (readmeDocs !== undefined || workspaceDocs !== undefined) {
		const direction = decide({
			sourcePresent: readmeDocs !== undefined,
			workspacePresent: workspaceDocs !== undefined,
			prior: knownDocs,
			// Compared and hashed without a markdown table's padding, which a formatter adds and Bruno does not.
			sourceHash: readmeDocs === undefined ? "" : hashOf(comparableDocs(readmeDocs)),
			workspaceHash: workspaceDocs === undefined ? "" : hashOf(comparableDocs(workspaceDocs)),
			// Asked only when both sides are there.
			agree: () => comparableDocs(readmeDocs as string) === comparableDocs(workspaceDocs as string),
			prefer,
		});
		if (direction === "conflict") {
			plan.conflicts += 1;
			plan.files.push({ path: DOCS_FILE, state: "conflict", note: conflictNote("The docs") });
			if (knownDocs) plan.pairs.push(knownDocs);
		} else {
			// The side that wins; a README is written only from the workspace's docs, and is otherwise left as it is.
			const finalDocs = (direction === "toSource" ? workspaceDocs : readmeDocs) as string;
			if (direction === "toWorkspace") workspaceText = withDocs(workspaceText, finalDocs);
			if (direction === "toSource") plan.write(DOCS_FILE, `${finalDocs}\n`);
			plan.files.push({
				path: DOCS_FILE,
				state: direction !== "toSource" ? "unchanged" : readmeNow === undefined ? "new" : "changed",
			});
			plan.pairs.push({
				kind: "docs",
				source: DOCS_FILE,
				workspace: "workspace.yml",
				sourceHash: hashOf(comparableDocs(finalDocs)),
				workspaceHash: hashOf(comparableDocs(finalDocs)),
			});
		}
	}

	plan.files.push({
		path: workspacePath,
		state: workspaceNow === undefined ? "new" : workspaceNow === workspaceText ? "unchanged" : "changed",
	});
	if (workspaceNow !== workspaceText) plan.write(workspacePath, workspaceText);

	// The baseline records both sides as they are once this run's writes are done.
	const baselineText = serializeBaseline(plan.pairs);
	const baselineNow = prior?.text;
	plan.files.push({
		path: BASELINE_FILE,
		state: baselineNow === undefined ? "new" : baselineNow === baselineText ? "unchanged" : "changed",
	});
	if (baselineNow !== baselineText) plan.write(BASELINE_FILE, baselineText);

	plan.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.state < b.state ? -1 : 1));

	if (!input.dryRun && plan.conflicts === 0) {
		for (const [path, text] of plan.writes) {
			const absolute = join(repoRoot, path);
			await mkdir(dirname(absolute), { recursive: true });
			await writeFile(absolute, text);
		}
		for (const path of plan.deletes) {
			const absolute = join(repoRoot, path);
			await unlink(absolute);
			await pruneEmpty(dirname(absolute), workspaceDir);
		}
	}
	return { files: plan.files, issues: plan.issues };
}

/** The baseline's pair of a kind for a request file, if the baseline has one. */
function priorPair(
	baseline: Baseline | undefined,
	kind: BaselinePair["kind"],
	source: string
): BaselinePair | undefined {
	return baseline?.pairs.find((pair) => pair.kind === kind && pair.source === source);
}
