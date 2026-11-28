import { readdirSync } from "node:fs";
import { join } from "node:path";

/** A path segment pattern as a regular expression: `*` is any run of characters and `?` one, neither crossing a `/`. */
function segmentPattern(segment: string): RegExp {
	const source = [...segment]
		.map((char) => (char === "*" ? "[^/]*" : char === "?" ? "[^/]" : char.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
		.join("");
	return new RegExp(`^${source}$`);
}

/** The names in a folder, sorted; a folder that cannot be read has none. */
function names(dir: string): string[] {
	try {
		return readdirSync(dir).sort();
	} catch {
		return [];
	}
}

/** Matches `segments` below `base` (a path relative to `cwd`, `""` for `cwd` itself), pushing each full match. */
function walk(cwd: string, base: string, segments: string[], found: string[]): void {
	const [segment, ...rest] = segments;
	if (segment === undefined) {
		found.push(base);
		return;
	}
	const at = (name: string) => (base === "" ? name : `${base}/${name}`);
	if (segment === "**") {
		// Zero folders, or one folder and then `**` again.
		walk(cwd, base, rest, found);
		for (const name of names(join(cwd, base))) {
			if (!name.startsWith(".") && names(join(cwd, at(name))).length > 0) walk(cwd, at(name), segments, found);
		}
		return;
	}
	if (!/[*?]/.test(segment)) {
		// A literal name: it must exist (a folder when more follows).
		if (names(join(cwd, base)).includes(segment)) walk(cwd, at(segment), rest, found);
		return;
	}
	const pattern = segmentPattern(segment);
	for (const name of names(join(cwd, base))) {
		// As in a shell, a wildcard does not match a name that starts with a dot unless the pattern's segment does too.
		if (pattern.test(name) && (!name.startsWith(".") || segment.startsWith("."))) walk(cwd, at(name), rest, found);
	}
}

/**
 * Expands a glob pattern relative to `cwd` into the matching paths (relative to `cwd`), sorted and without duplicates;
 * no match is an empty list. `*` and `?` stay inside one path segment, a `**` segment crosses folders (a shell's
 * `compgen -G` reads it as `*`, so this is the larger set), and a wildcard skips names that start with a dot. Braces and
 * character classes are not patterns.
 */
export function expandGlob(pattern: string, cwd: string): string[] {
	const found: string[] = [];
	walk(
		cwd,
		"",
		pattern.split("/").filter((segment) => segment !== "" && segment !== "."),
		found
	);
	return [...new Set(found)].filter((path) => path !== "").sort();
}
