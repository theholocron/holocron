import { postmanToBruno, postmanToBrunoEnvironment } from "@usebruno/converters";
import { stringifyCollection, stringifyEnvironment, stringifyFolder, stringifyRequest } from "@usebruno/filestore";

import { describeIssue } from "./describe-issue.js";
import { repairSigningBody } from "./repair-signing-body.js";
import { type SecretWiring, withSecretReferences } from "./secret-references.js";

/** What {@link collectionFiles} made of one collection. */
export interface CollectionFiles {
	/** The collection's name, as its `opencollection.yml` and the workspace list it. */
	name: string;
	/** Every file of the collection's folder, by path inside that folder, with `/` separators. */
	files: Map<string, string>;
	/** The path inside the folder of each environment, in the order the environments were given. */
	environmentFiles: string[];
	/** What the converter reported it could not carry across, one line each. */
	issues: string[];
}

/** The part of one of Bruno's items this reads: a folder holds `items`, a request is written whole. */
interface BrunoItem {
	name?: string;
	type?: string;
	seq?: number;
	items?: BrunoItem[];
	root?: Record<string, unknown>;
}

/** A name safe to use as a file or folder name on any platform, as Bruno itself makes one from a request's name. */
export function safeName(name: string): string {
	const cleaned = name
		.replace(/[\\/:*?"<>|]/g, "-")
		.trim()
		.replace(/[. ]+$/, "");
	return cleaned === "" ? "untitled" : cleaned;
}

/** The first of `name`, `name (2)`, `name (3)`… that `taken` does not hold, compared without regard to case. */
function uniqueName(name: string, taken: Set<string>): string {
	let candidate = name;
	for (let n = 2; taken.has(candidate.toLowerCase()); n += 1) candidate = `${name} (${n})`;
	taken.add(candidate.toLowerCase());
	return candidate;
}

/** Lays one folder's items out under `dir`: a folder as `<name>/folder.yml` plus its items, a request as `<name>.yml`. */
function writeItems(items: BrunoItem[], dir: string, files: Map<string, string>): void {
	const taken = new Set<string>();
	for (const item of items) {
		const name = uniqueName(safeName(item.name ?? "untitled"), taken);
		if (item.type === "folder") {
			const folder = `${dir}${name}/`;
			const meta = { name: item.name, ...(item.seq === undefined ? {} : { seq: item.seq }) };
			files.set(`${folder}folder.yml`, stringifyFolder({ ...item.root, meta }, { format: "yml" }));
			writeItems(item.items ?? [], folder, files);
		} else {
			files.set(`${dir}${name}.yml`, stringifyRequest(item, { format: "yml" }));
		}
	}
}

/**
 * Converts one v2.1 collection (and the environments that go with it) to the files Bruno itself writes for a
 * collection folder: `opencollection.yml`, a `folder.yml` for each folder, one YAML file for each request and one
 * for each environment under `environments/`. Bruno's reader turns the collection into Bruno's own model and
 * rewrites its `pm.*` scripts to `bru.*` / `req.*`; Bruno's file writer then lays that model out, so the files are
 * what the app would have saved. A secret-type variable is written without its value, unless `secretRefs` names it:
 * it is then a plain variable that refers to its entry in the collection's `.env` (see `secret-references.ts`).
 */
export async function collectionFiles(
	collection: unknown,
	environments: unknown[],
	secretRefs?: SecretWiring
): Promise<CollectionFiles> {
	const read = await postmanToBruno(collection, { preserveScripts: false });
	const bruno = read.collection;
	repairSigningBody(bruno);
	const name = bruno.name ?? "Untitled Collection";
	const files = new Map<string, string>();
	files.set(
		"opencollection.yml",
		stringifyCollection(
			bruno.root ?? {},
			{ name, type: "collection", ignore: ["node_modules", ".git"] },
			{ format: "yml" }
		)
	);
	writeItems((bruno.items ?? []) as BrunoItem[], "", files);
	const taken = new Set<string>();
	const environmentFiles: string[] = [];
	for (const source of environments) {
		const environment = withSecretReferences(await postmanToBrunoEnvironment(source), secretRefs);
		const file = `environments/${uniqueName(safeName(environment.name), taken)}.yml`;
		environmentFiles.push(file);
		files.set(file, stringifyEnvironment(environment, { format: "yml" }));
	}
	return { name, files, environmentFiles, issues: (read.issues ?? []).map(describeIssue) };
}
