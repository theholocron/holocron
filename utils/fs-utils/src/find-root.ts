import { realpathSync, statSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { findUpward } from "./find-upward.ts";

export interface FindRootOptions {
	/**
	 * `"start"` returns the start directory instead of `undefined` when no
	 * marker is found anywhere up the tree — a soft-skip for callers that
	 * treat the start dir as the root anyway. The returned path is always
	 * absolute (a relative `startDir` is resolved against the working
	 * directory), and symlink-resolved when `realpath` is on and the start
	 * exists.
	 */
	fallback?: "start";
	/**
	 * Resolve symlinks of `startDir` before walking, so a symlinked start
	 * dir walks the physical tree instead of the link's own lexical
	 * ancestors. A start path that doesn't exist on disk counts as "not
	 * found". Any other failure resolving it (e.g. `EACCES`) is thrown.
	 */
	realpath?: boolean;
}

/** Only "nothing there" means the marker is absent; every other fs error is real. */
const isAbsent = (err: unknown): boolean => {
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
};

/**
 * Markers are bare names, joined onto each ancestor. Anything that could
 * address a path outside that ancestor (`..`, a separator) or the ancestor
 * itself (`""`, `.`) is rejected rather than probed.
 */
function asMarkers(marker: string | readonly string[]): readonly string[] {
	const list = typeof marker === "string" ? [marker] : marker;
	if (list.length === 0) throw new TypeError("findRoot: at least one marker is required");
	for (const m of list) {
		if (m === "" || m === "." || m === ".." || /[\\/]/.test(m) || m.includes("\0")) {
			throw new TypeError(`findRoot: marker must be a single file or directory name, got ${JSON.stringify(m)}`);
		}
	}
	return list;
}

async function hasAny(dir: string, markers: readonly string[]): Promise<boolean> {
	for (const marker of markers) {
		try {
			await stat(join(dir, marker));
			return true;
		} catch (err) {
			if (!isAbsent(err)) throw err;
		}
	}
	return false;
}

function hasAnySync(dir: string, markers: readonly string[]): boolean {
	for (const marker of markers) {
		try {
			statSync(join(dir, marker));
			return true;
		} catch (err) {
			if (!isAbsent(err)) throw err;
		}
	}
	return false;
}

/**
 * The nearest ancestor of `startDir` (itself first) that contains `marker` —
 * a file or directory name, or a list of names where any one counts. For
 * example `".git"`, `"pnpm-workspace.yaml"`, or `["turbo.json", "nx.json"]`.
 *
 * Each marker must be a bare name (no separators, `.`, `..` or empty) or a
 * `TypeError` is thrown; so is any filesystem error other than "not there".
 * Resolves to `undefined` when nothing is found, unless `options.fallback` is
 * `"start"`. See {@link FindRootOptions}; {@link findRootSync} is the
 * synchronous twin. Built on {@link findUpward}.
 */
export async function findRoot(
	startDir: string,
	marker: string | readonly string[],
	options: FindRootOptions = {}
): Promise<string | undefined> {
	const markers = asMarkers(marker);
	// Absolute before the first await, so a concurrent `process.chdir()` can't
	// move a relative search to another tree mid-walk.
	let start = resolve(startDir);
	if (options.realpath) {
		try {
			start = await realpath(start);
		} catch (err) {
			if (!isAbsent(err)) throw err;
			return options.fallback === "start" ? start : undefined;
		}
	}
	const found = await findUpward(start, async (dir) => ((await hasAny(dir, markers)) ? dir : undefined));
	return found ?? (options.fallback === "start" ? start : undefined);
}

/** Synchronous {@link findRoot}. */
export function findRootSync(
	startDir: string,
	marker: string | readonly string[],
	options: FindRootOptions = {}
): string | undefined {
	const markers = asMarkers(marker);
	let start = resolve(startDir);
	if (options.realpath) {
		try {
			start = realpathSync(start);
		} catch (err) {
			if (!isAbsent(err)) throw err;
			return options.fallback === "start" ? start : undefined;
		}
	}
	let dir = start;
	for (;;) {
		if (hasAnySync(dir, markers)) return dir;
		const parent = dirname(dir);
		// `dirname` of the filesystem root is itself — nowhere left to climb.
		if (parent === dir) return options.fallback === "start" ? start : undefined;
		dir = parent;
	}
}
