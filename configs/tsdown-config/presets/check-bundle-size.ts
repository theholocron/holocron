import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** ~12x the largest real output seen in a thin client wrapper (github-client, ~41KB). */
export const MAX_BUNDLE_BYTES = 512_000;

const BUNDLE_FILE = /\.[cm]?js$/;

/**
 * Defense in depth (holocron#762): if a dependency ever fails to externalize
 * (`deps.neverBundle` misconfigured, a future tsdown/rolldown regression),
 * the whole tree gets inlined instead. Nothing legitimate in a library built
 * with the `library` preset should approach the threshold.
 *
 * Not this function's job to verify `outDir` exists at all: a missing
 * directory is not a failure here. Treating it as one caused real false
 * positives in CI, where under heavy parallel I/O a stat() from a new
 * process could start before the just-finished build's writes were visible.
 */
export function checkBundleSize(outDir: string, maxBytes = MAX_BUNDLE_BYTES): void {
	let names: string[];
	try {
		names = readdirSync(outDir);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
		throw error;
	}

	const oversized = names
		.filter((name) => BUNDLE_FILE.test(name))
		.map((name) => ({ path: join(outDir, name), size: statSync(join(outDir, name)).size }))
		.filter(({ size }) => size > maxBytes);

	if (oversized.length === 0) return;

	const limit = `${(maxBytes / 1000).toFixed(0)}KB`;
	const lines = oversized.map(({ path, size }) => `${path} is ${(size / 1_000_000).toFixed(2)}MB`);
	throw new Error(
		`check-bundle-size: ${lines.join("; ")}, exceeding the ${limit} threshold -- ` +
			`a dependency likely failed to externalize (deps.neverBundle) and got inlined instead. Refs: holocron#762`
	);
}
