import type { PackageJson } from "./package-json.type.ts";

const STRING_FIELDS = ["name", "version", "packageManager"] as const;
const MAP_FIELDS = ["scripts", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

/** A plain object's string-valued entries; `undefined` for anything that isn't a plain object. */
function stringMap(value: unknown): Record<string, string> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	return Object.fromEntries(
		Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")
	);
}

/**
 * Parses `package.json` text. Returns `undefined` for anything that isn't a
 * JSON object — invalid JSON, or valid JSON of another type (an array, `null`,
 * a string) — rather than throwing. A leading byte-order mark is ignored, as
 * npm does.
 *
 * The fields {@link PackageJson} types are checked, so the result honours its
 * type: a recognized field of the wrong type (a numeric `name`, an array
 * `dependencies`) is left out, and the string-map fields keep only their
 * string-valued entries. Every other field passes through untouched.
 */
export function parsePackageJson(text: string): PackageJson | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
	} catch {
		return undefined;
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;

	const raw = value as Record<string, unknown>;
	const pkg: Record<string, unknown> = { ...raw };
	for (const field of STRING_FIELDS) if (typeof raw[field] !== "string") delete pkg[field];
	if (typeof raw["private"] !== "boolean") delete pkg["private"];
	for (const field of MAP_FIELDS) {
		const map = stringMap(raw[field]);
		if (map) pkg[field] = map;
		else delete pkg[field];
	}
	return pkg as PackageJson;
}
