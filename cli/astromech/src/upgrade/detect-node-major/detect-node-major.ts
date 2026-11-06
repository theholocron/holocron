import { join } from "node:path";

/**
 * Read the repo's current Node.js major from `.nvmrc`, `.node-version`, then `package.json` `engines.node`.
 *
 * @param cwd - The repo root.
 * @param readFile - Reads a file as text; throws when absent.
 * @returns The major, or `null` when no pin is found.
 */
export function detectNodeMajor(cwd: string, readFile: (path: string) => string): number | null {
	for (const name of [".nvmrc", ".node-version"]) {
		try {
			const major = parseInt(readFile(join(cwd, name)).trim(), 10);
			if (!isNaN(major)) return major;
		} catch {
			/* absent */
		}
	}
	try {
		const pkg = JSON.parse(readFile(join(cwd, "package.json"))) as Record<string, unknown>;
		const node = (pkg.engines as Record<string, string> | undefined)?.node;
		if (node) {
			const m = node.match(/(\d+)/);
			if (m) return parseInt(m[1]!, 10);
		}
	} catch {
		/* absent */
	}
	return null;
}
