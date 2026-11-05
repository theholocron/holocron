import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import type { EnsureBuiltOptions } from "./ensure-built.type.js";

/** The newest modification time of a source file under `dir`, ignoring tests and the folders named in `ignoreDirs`. */
function newestSource(dir: string, ignoreDirs: readonly string[]): number {
	let newest = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (!ignoreDirs.includes(entry.name)) newest = Math.max(newest, newestSource(path, ignoreDirs));
		} else if (!/\.test\.ts$/.test(entry.name)) newest = Math.max(newest, statSync(path).mtimeMs);
	}
	return newest;
}

/** Whether `bin` is missing or older than the newest source file under `srcDir` (tests and `ignoreDirs` not counted). */
export function isStale(bin: string, srcDir: string, ignoreDirs: readonly string[] = ["testing"]): boolean {
	return !existsSync(bin) || statSync(bin).mtimeMs < newestSource(srcDir, ignoreDirs);
}

/**
 * For a Vitest global setup: make sure the built file the tests run exists and is newer than the source, so tests of the
 * built binary test what is checked out. It builds only when the file is missing or stale, so a pipeline that built first
 * (turbo does) pays nothing, and a rebuild never wipes `dist` out from under another package's tests.
 */
export function ensureBuilt(options: EnsureBuiltOptions): void {
	if (!isStale(options.bin, options.srcDir, options.ignoreDirs)) return;
	if (options.build) return options.build();
	execFileSync(join(options.cwd, "node_modules", ".bin", "tsdown"), { cwd: options.cwd, stdio: "inherit" });
}
