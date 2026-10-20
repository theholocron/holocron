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
