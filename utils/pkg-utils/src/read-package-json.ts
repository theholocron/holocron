import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { PackageJson } from "./package-json.type.ts";
import { parsePackageJson } from "./parse-package-json.ts";

export interface ReadPackageJsonOptions {
	/** Replaces the file read — for callers with an injected or in-memory filesystem. */
	readFile?: (path: string) => string;
}

/**
 * The parsed `<dir>/package.json`, or `undefined` when it is missing,
 * unreadable or not a JSON object.
 */
export async function readPackageJson(dir: string): Promise<PackageJson | undefined> {
	try {
		return parsePackageJson(await readFile(join(dir, "package.json"), "utf8"));
	} catch {
		return undefined;
	}
}

/** Synchronous twin of {@link readPackageJson}, with an injectable `readFile`. */
export function readPackageJsonSync(dir: string, options: ReadPackageJsonOptions = {}): PackageJson | undefined {
	const read = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
	try {
		return parsePackageJson(read(join(dir, "package.json")));
	} catch {
		return undefined;
	}
}
