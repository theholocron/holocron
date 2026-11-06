import { stringifyJson } from "@theholocron/json-utils";

/**
 * Rewrite the Node.js pins in a `package.json`: `engines.node` (`>=N` / `>=N.0.0`) and an exact
 * `@types/node` range (`^N.0.0`). `catalog:` pins are left alone.
 *
 * @param content - The raw `package.json` text.
 * @param from - The major being replaced.
 * @param to - The major to pin.
 * @returns The new text, or `null` when nothing changed (or the JSON is unparseable).
 */
export function patchPackageJson(content: string, from: number, to: number): string | null {
	let pkg: Record<string, unknown>;
	try {
		pkg = JSON.parse(content) as Record<string, unknown>;
	} catch {
		return null;
	}

	let changed = false;

	const engines = pkg.engines as Record<string, string> | undefined;
	if (engines?.node && /^>=\d+(?:\.0\.0)?$/.test(engines.node)) {
		const major = parseInt(engines.node.match(/\d+/)![0]!, 10);
		if (major === from) {
			engines.node = `>=${to}.0.0`;
			changed = true;
		}
	}

	for (const field of ["devDependencies", "dependencies"] as const) {
		const deps = pkg[field] as Record<string, string> | undefined;
		if (!deps?.["@types/node"]) continue;
		// Only update exact semver ranges; leave catalog: pins alone
		if (deps["@types/node"] === `^${from}.0.0`) {
			deps["@types/node"] = `^${to}.0.0`;
			changed = true;
		}
	}

	return changed ? stringifyJson(pkg, { like: content }) : null;
}
