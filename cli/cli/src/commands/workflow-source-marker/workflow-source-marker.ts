import { realpathSync } from "node:fs";
import { dirname, relative, sep } from "node:path";

/** `# Source package: <path>` line at the head of a generated thin-caller workflow — see {@link resolvePkgRelPath}. */
export const SOURCE_PACKAGE_MARKER = /^# Source package: (.+)$/m;

/** Strip control characters (including ANSI escapes) before a value reaches a printed error message. */
export function sanitizeForDisplay(value: string): string {
	// eslint-disable-next-line no-control-regex -- deliberately matching control chars to strip them
	return value.replace(/[\x00-\x1f\x7f]/g, "");
}

/**
 * Repo-root-relative path of the PACKAGE a workflow-writing command run is
 * scoped to — the directory holding the discovered `holocron.config.*`
 * (`configFilepath`), not necessarily `--cwd` itself. `loadConfig()` walks
 * up to find the config from any subdirectory ("every command is usable
 * from any subdirectory of a repo, not only its exact root"), so a `--cwd`
 * one level too deep would otherwise stamp a different marker than a later
 * run from the package's own root and misfire the collision check this
 * feeds (holocron#1026).
 *
 * "." for a root invocation, "apps/sentinel" for a subpackage. Normalized
 * to forward slashes so the same package produces the same marker on
 * Windows and POSIX. Throws if the result contains a line break — a path
 * containing one could otherwise break out of the `# Source package: `
 * comment line and inject arbitrary workflow YAML when the generated
 * content is later written. Not reachable through this CLI's own flows
 * (no code path writes a config file whose directory name contains a line
 * break), but cheap to reject outright rather than trust the filesystem.
 */
export function resolvePkgRelPath(gitRoot: string, configFilepath: string): string {
	// Both sides realpath'd independently -- a caller's gitRoot may already
	// be resolved (sync.ts's own findRootSync(..., { realpath: true })) or
	// may not be; relying on that discipline would silently produce a
	// garbage `../../..`-laden result if a symlinked ancestor (e.g. macOS's
	// /tmp -> /private/tmp) resolves on only one side.
	let root: string;
	try {
		root = realpathSync(gitRoot);
	} catch {
		root = gitRoot;
	}
	let configDir: string;
	try {
		configDir = realpathSync(dirname(configFilepath));
	} catch {
		configDir = dirname(configFilepath);
	}
	const pkgRelPath = (relative(root, configDir) || ".").split(sep).join("/");
	if (/[\r\n]/.test(pkgRelPath)) {
		throw new Error(`refusing to use a package path containing a line break: ${JSON.stringify(pkgRelPath)}`);
	}
	return pkgRelPath;
}

/**
 * Two different monorepo packages opting into the same generic task name
 * (e.g. both `apps/sentinel` and some future `apps/other` configuring
 * `delivery.previewDeploy`) would otherwise overwrite each other's
 * `.github/workflows/<task>.yml` on whichever package's write ran last —
 * only one package's behavior would ever actually run in CI, with no
 * signal that the other's was silently dropped (holocron#1026).
 *
 * Shared by both `holocron repo sync` (reads the file straight off local
 * disk) and `holocron repo setup` (reads it through the loaded `Source`
 * capability, which happens to be local disk too for the github plugin
 * today, but the interface doesn't promise that for every provider —
 * holocron#1068). The marker-parsing and error message are identical
 * either way; `readExisting` is how the two callers differ.
 *
 * A file with no marker at all predates this check (or was written before
 * #1026) and is never flagged — only a marker that's present AND disagrees
 * with the current run's own package is a real collision. `readExisting`
 * returning `null` means "nothing there," not "unreadable" — a caller
 * whose underlying read can fail for reasons other than "doesn't exist"
 * (e.g. local fs EISDIR) is expected to let that error propagate out of
 * `readExisting` itself rather than mapping it to `null`.
 */
export async function assertNoPackageCollision(
	taskName: string,
	pkgRelPath: string,
	filename: string,
	readExisting: () => Promise<string | null>
): Promise<void> {
	const existing = await readExisting();
	if (existing === null) return;
	const previousPkg = SOURCE_PACKAGE_MARKER.exec(existing)?.[1];
	if (previousPkg !== undefined && previousPkg !== pkgRelPath) {
		throw new Error(
			`task "${taskName}" would overwrite .github/workflows/${filename}, already generated for package ` +
				`"${sanitizeForDisplay(previousPkg)}" — the same task name can't be used by two different packages ` +
				`(holocron#1026). If "${sanitizeForDisplay(previousPkg)}" moved or was renamed to this path, delete ` +
				`.github/workflows/${filename} first and re-run this command; otherwise rename one or give it a ` +
				`different thin-caller filename.`
		);
	}
}
