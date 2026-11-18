import { createHash } from "node:crypto";

import { brunoToPostman } from "@usebruno/converters";
import { parseCollection, parseEnvironment, parseFolder, parseRequest } from "@usebruno/filestore";

import { referencedName } from "./secret-references.js";

/** A Bruno item as this reads it: a folder holds `items` and a `root`, a request is Bruno's own object. */
interface Item {
	name?: string;
	type: string;
	seq: number;
	items?: Item[];
	root?: Record<string, unknown>;
	[key: string]: unknown;
}

/** A value in a stable text: object keys sorted, so two equal documents give the same text whatever their key order. */
export function canonicalJson(value: unknown): string {
	const sort = (v: unknown): unknown => {
		if (Array.isArray(v)) return v.map(sort);
		if (v !== null && typeof v === "object") {
			return Object.fromEntries(
				Object.entries(v as Record<string, unknown>)
					.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
					.map(([key, member]) => [key, sort(member)])
			);
		}
		return v;
	};
	return JSON.stringify(sort(value));
}

/** The SHA-256 of a text, in hex. */
export const hashOf = (text: string): string => createHash("sha256").update(text).digest("hex");

/** Names a text as the file it came from, for an error. */
function reading<T>(path: string, read: () => T): T {
	try {
		return read();
	} catch (err) {
		throw new Error(`${path}: ${(err as Error).message}`, { cause: err });
	}
}

/** Lays the files of one folder out as Bruno's items: the folders (each with its `folder.yml`) and the requests. */
function itemsIn(files: Map<string, string>, prefix: string): Item[] {
	const folders = new Set<string>();
	const requests: string[] = [];
	for (const path of files.keys()) {
		if (!path.startsWith(prefix)) continue;
		const rest = path.slice(prefix.length);
		const slash = rest.indexOf("/");
		if (slash >= 0) folders.add(rest.slice(0, slash));
		else if (rest !== "folder.yml" && (prefix !== "" || rest !== "opencollection.yml")) requests.push(path);
	}
	const items: Item[] = [];
	for (const name of [...folders].sort()) {
		const folderPath = `${prefix}${name}/`;
		const text = files.get(`${folderPath}folder.yml`);
		const root =
			text === undefined ? {} : reading(`${folderPath}folder.yml`, () => parseFolder(text, { format: "yml" }));
		const meta = root.meta ?? {};
		items.push({
			type: "folder",
			name: meta.name ?? name,
			seq: meta.seq as number,
			root,
			items: itemsIn(files, folderPath),
		});
	}
	for (const path of requests.sort()) {
		const parsed = reading(path, () => parseRequest(files.get(path) as string, { format: "yml" }));
		for (const key of ["items", "root", "fileContent", "filename", "pathname", "app"]) delete parsed[key];
		items.push({ ...parsed, type: parsed.type as string, seq: parsed.seq as number });
	}
	// A missing position goes after the ones that have one, in the order the files are listed.
	items.sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER));
	items.forEach((item, index) => {
		if (!Number.isInteger(item.seq)) item.seq = index + 1;
	});
	return items;
}

/** The documentation text of each folder, by name, in the order of Bruno's items (a name used twice is taken in turn). */
function folderDocs(items: Item[]): Map<string, string[]> {
	const docs = new Map<string, string[]>();
	for (const item of items.filter((i) => i.type === "folder")) {
		const text = typeof item.root?.docs === "string" ? item.root.docs : "";
		docs.set(item.name ?? "", [...(docs.get(item.name ?? "") ?? []), text]);
	}
	return docs;
}

/** Puts a folder's documentation back as its `description`, which Bruno's own writer leaves out, all the way down. */
function describeFolders(exported: Record<string, unknown>[], items: Item[]): Record<string, unknown>[] {
	const docs = folderDocs(items);
	const children = new Map<string, Item[][]>();
	for (const item of items.filter((i) => i.type === "folder")) {
		children.set(item.name ?? "", [...(children.get(item.name ?? "") ?? []), item.items ?? []]);
	}
	return exported.map((entry) => {
		if (!Array.isArray(entry.item)) return entry;
		const name = String(entry.name);
		const description = docs.get(name)?.shift() ?? "";
		const inner = children.get(name)?.shift() ?? [];
		const { name: _name, description: _description, item: nested, ...rest } = entry;
		return {
			name,
			...(description === "" ? {} : { description }),
			...rest,
			item: describeFolders(nested as Record<string, unknown>[], inner),
		};
	});
}

type Json = Record<string, unknown>;
const isJson = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const asList = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isJson) : []);

/** Drops the entries of `names` from `entry` whose value is `empty` (an empty string, `false`, `{}`, `[]` or `"default"`). */
function dropEmpty(entry: Json, names: string[], empty: (value: unknown) => boolean): Json {
	return Object.fromEntries(Object.entries(entry).filter(([key, value]) => !(names.includes(key) && empty(value))));
}

const isEmptyValue = (value: unknown): boolean =>
	value === "" ||
	value === false ||
	value === "default" ||
	(Array.isArray(value) && value.length === 0) ||
	(isJson(value) && Object.keys(value).length === 0);

/** Puts the keys of `entry` in the order `first` names, then the rest in the order they were. */
function ordered(entry: Json, first: string[]): Json {
	const rest = Object.keys(entry).filter((key) => !first.includes(key));
	return Object.fromEntries([...first.filter((key) => key in entry), ...rest].map((key) => [key, entry[key]]));
}

/**
 * Takes out what Bruno's exporter adds to every entry and a request file never carries (an empty `description`, a
 * header's `disabled: false` and `type: "default"`, an empty `packages` / `requests` on a script, an empty `protocol`,
 * `query` and `variable` on a URL) and puts keys in the order a request file lists them, so a collection Bruno rewrote
 * differs from the one before it only where its content changed.
 */
function tidy(item: Json): Json {
	if (Array.isArray(item.item)) {
		return ordered({ ...item, item: asList(item.item).map(tidy), event: tidyEvents(item.event) }, [
			"name",
			"description",
			"event",
			"item",
		]);
	}
	const request = isJson(item.request) ? item.request : undefined;
	const url =
		request && isJson(request.url)
			? dropEmpty(request.url, ["protocol", "query", "variable"], isEmptyValue)
			: undefined;
	const tidied = request
		? ordered(
				{
					...request,
					header: asList(request.header).map((h) =>
						dropEmpty(h, ["description", "disabled", "type"], isEmptyValue)
					),
					...(url ? { url: ordered(url, ["raw", "host", "path"]) } : {}),
				},
				["method", "description", "header", "body", "auth", "url"]
			)
		: undefined;
	return ordered({ ...item, event: tidyEvents(item.event), ...(tidied ? { request: tidied } : {}) }, [
		"name",
		"event",
		"request",
	]);
}

/** A script's events without the empty `packages` and `requests` Bruno's exporter adds. */
function tidyEvents(events: unknown): unknown {
	if (!Array.isArray(events)) return undefined;
	return asList(events).map((event) =>
		isJson(event.script)
			? { ...event, script: dropEmpty(event.script, ["packages", "requests"], isEmptyValue) }
			: event
	);
}

/**
 * Turns the files of one Bruno collection folder (paths inside the folder, `/` separators, the `environments/` files
 * left out) back into a v2.1 collection: Bruno's own reader for each file, Bruno's own `brunoToPostman` for the whole,
 * and two repairs for what that exporter drops, a folder's documentation and the variables it makes up for a dynamic
 * `{{$guid}}`. The result is a function of what the files hold, so it is also the text two equal collections have in
 * common: the sync generates it from the request file as well and compares the two.
 */
export function workspaceToSource(files: Map<string, string>): Record<string, unknown> {
	const opencollection = files.get("opencollection.yml");
	if (opencollection === undefined) throw new Error("opencollection.yml: not found");
	const { collectionRoot, brunoConfig } = reading("opencollection.yml", () =>
		parseCollection(opencollection, { format: "yml" })
	);
	const items = itemsIn(files, "");
	const exported = brunoToPostman({
		name: brunoConfig.name ?? "Untitled Collection",
		root: collectionRoot,
		items: structuredClone(items),
		environments: [],
	});
	const variable = Array.isArray(exported.variable)
		? asList(exported.variable)
				.filter((entry) => !String(entry.key ?? "").startsWith("$"))
				.map((entry) => dropEmpty(entry, ["type"], isEmptyValue))
		: undefined;
	const { event, ...rest } = exported;
	return {
		...rest,
		...(variable === undefined ? {} : { variable }),
		...(event === undefined ? {} : { event: tidyEvents(event) }),
		item: describeFolders(asList(exported.item), items).map(tidy),
	};
}

/**
 * `derived` with each key whose value is the same as in `carried` (as the workspace carries it) taken from `original`;
 * for a key named in `nested`, the same is done one level down, so a request whose URL changed keeps its own scripts.
 */
function keepKeys(derived: Json, carried: Json, original: Json, nested: string[] = []): Json {
	const merged: Json = {};
	for (const key of [...Object.keys(original), ...Object.keys(derived)]) {
		if (key in merged || !(key in derived)) continue;
		if (key in original && canonicalJson(carried[key]) === canonicalJson(derived[key])) {
			merged[key] = original[key];
		} else if (nested.includes(key) && isJson(derived[key]) && isJson(carried[key]) && isJson(original[key])) {
			merged[key] = keepKeys(derived[key], carried[key], original[key]);
		} else {
			merged[key] = derived[key];
		}
	}
	return merged;
}

/** The items of `derived` with each one that is the same as in `carried` (the original as the workspace carries it) swapped for the original's own text. */
function keepItems(derived: Json[], carried: Json[], original: Json[]): Json[] {
	return derived.map((item) => {
		const same = (candidate: Json) =>
			candidate.name === item.name && Array.isArray(candidate.item) === Array.isArray(item.item);
		const carriedItem = carried.find(same);
		const originalItem = original.find(same);
		if (!carriedItem || !originalItem) return item;
		if (canonicalJson(carriedItem) === canonicalJson(item)) return originalItem;
		if (!Array.isArray(item.item)) return keepKeys(item, carriedItem, originalItem, ["request"]);
		const own = (entry: Json) => canonicalJson({ ...entry, item: undefined });
		const children = keepItems(asList(item.item), asList(carriedItem.item), asList(originalItem.item));
		return own(carriedItem) === own(item) ? { ...originalItem, item: children } : { ...item, item: children };
	});
}

/**
 * `derived` (a collection read back from the workspace) laid over `original` (the request file as it was): every
 * entry the workspace carries the same as before keeps the original's own text, in its own key order, so a change made
 * in the workspace rewrites only what it changed and not every script Bruno writes a little differently. `carried`
 * is the original as the workspace carries it (`workspaceToSource` of the files the original generates).
 */
export function keepOriginal(derived: Json, carried: Json, original: Json): Json {
	const merged: Json = {};
	for (const key of [...Object.keys(original), ...Object.keys(derived)]) {
		if (key in merged || !(key in derived)) continue;
		if (key === "item") {
			merged.item = keepItems(asList(derived.item), asList(carried.item), asList(original.item));
		} else if (key in original && canonicalJson(carried[key]) === canonicalJson(derived[key])) {
			merged[key] = original[key];
		} else if (key === "info" && isJson(original.info) && isJson(derived.info)) {
			merged.info = { ...original.info, ...derived.info };
		} else {
			merged[key] = derived[key];
		}
	}
	return merged;
}

/** What an environment file holds as the request files write it: `{ name, values: [{ key, value, type, enabled }] }`. */
export function environmentToSource(text: string, path: string): { name: string; values: Record<string, unknown>[] } {
	const environment = reading(path, () => parseEnvironment(text, { format: "yml" }));
	return {
		name: environment.name,
		values: (environment.variables ?? []).map((variable) => ({
			key: variable.name,
			// A variable that only refers to a `.env` entry is the workspace's form of a secret: the request file keeps it blank.
			value: variable.secret || referencedName(variable.value) !== undefined ? "" : (variable.value ?? ""),
			type: variable.secret || referencedName(variable.value) !== undefined ? "secret" : "default",
			enabled: variable.enabled ?? true,
		})),
	};
}
