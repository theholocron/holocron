import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The `version:` line of the `info:` block at the top of a collection's `opencollection.yml`. */
const VERSION_LINE = /^(info:\n(?: {2}[^\n]*\n)*?) {2}version: [^\n]*\n/m;

/** The collection file's text without its `info.version`, which is not part of what the sync compares or hashes. */
export const stripVersion = (text: string): string => text.replace(VERSION_LINE, "$1");

/**
 * The collection file's text with `info.version` set to `version`, right after the name. A file whose `info:` block has
 * no name on its second line is returned as it is, because its layout is not one the sync wrote.
 */
export function withVersion(text: string, version: string): string {
	return stripVersion(text).replace(/^(info:\n {2}name: [^\n]*\n)/m, `$1  version: ${JSON.stringify(version)}\n`);
}

/** The `version` of the repo root's `package.json`, or `undefined` when there is no such file or it names none. */
export async function rootVersion(repoRoot: string): Promise<string | undefined> {
	try {
		const { version } = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as { version?: unknown };
		return typeof version === "string" && version !== "" ? version : undefined;
	} catch {
		return undefined;
	}
}
