/**
 * Vitest global setup: make sure `dist/cli.mjs` exists and is newer than the source, so the tests that run the built CLI
 * (`cli-binary.test.ts`) test what is checked out. Builds only when it is missing or stale, so a pipeline that built first
 * (turbo does) pays nothing, and a rebuild never wipes `dist` out from under another package's tests.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CLI_BIN = join(root, "dist", "cli.mjs");

/** The newest modification time of a source file under `dir`, ignoring tests and the test helpers (`testing/`). */
function newestSource(dir: string): number {
	let newest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name !== "testing") newest = Math.max(newest, newestSource(path));
		} else if (!/\.test\.ts$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs);
	}
	return newest;
}

export function isStale(bin: string, srcDir: string): boolean {
	return !existsSync(bin) || statSync(bin).mtimeMs < newestSource(srcDir);
}

export default function setup(): void {
	if (!isStale(CLI_BIN, join(root, "src"))) return;
	execFileSync(join(root, "node_modules", ".bin", "tsdown"), { cwd: root, stdio: "inherit" });
}
