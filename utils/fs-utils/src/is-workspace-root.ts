import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * `true` when `dir` has a `pnpm-workspace.yaml` regular file — the marker
 * of a pnpm workspace root. Several pnpm CLI commands (`pnpm add` among
 * them) behave differently at a workspace root than in a plain package,
 * so callers shelling out to pnpm need this check before deciding which
 * flags to pass.
 *
 * `dir` is resolved to an absolute path up front — a relative `dir`
 * resolved lazily inside the `stat` call could end up checking a
 * different directory if `process.chdir()` runs on another task while
 * this one is pending. A directory or symlink-to-directory named
 * `pnpm-workspace.yaml` doesn't count (pnpm never creates one of those);
 * only `stat`'s `ENOENT` means "not there" — any other error (`EACCES`,
 * a transient I/O failure) propagates rather than silently reading as
 * "not a workspace."
 */
export async function isWorkspaceRoot(dir: string): Promise<boolean> {
	try {
		return (await stat(join(resolve(dir), "pnpm-workspace.yaml"))).isFile();
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw err;
	}
}
