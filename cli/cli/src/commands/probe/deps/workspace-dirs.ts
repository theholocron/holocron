import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** The workspace package folders, from the `packages:` globs (`dir` or `dir/*`), plus the root (`""`). */
export function workspaceDirs(root: string, yamlText: string): string[] {
	const packagesBlock = yamlText.split(/^packages:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
	const dirs = [""];
	for (const line of packagesBlock.split("\n")) {
		const glob = line.match(/^\s+-\s+"?([^"\n]+?)"?\s*$/)?.[1];
		if (!glob || glob.startsWith("!")) continue;
		if (glob.endsWith("/*")) {
			const base = glob.slice(0, -2);
			if (!existsSync(join(root, base))) continue;
			for (const entry of readdirSync(join(root, base), { withFileTypes: true })) {
				if (entry.isDirectory() && existsSync(join(root, base, entry.name, "package.json"))) {
					dirs.push(`${base}/${entry.name}`);
				}
			}
		} else if (existsSync(join(root, glob, "package.json"))) {
			dirs.push(glob);
		}
	}
	return dirs;
}
